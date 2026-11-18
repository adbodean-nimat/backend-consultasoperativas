"""Bounded JSON-over-stdin bridge for the Node backend. No mailbox mutations."""
import base64
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
import sys
from xml.sax.saxutils import escape, quoteattr
from ews_probe import (NS, ProbeError, call, envelope, get_folder, folder_xml,
                       resolve_inbox_subfolder, smtp_metadata, check_response)

MAX_BYTES = 20 * 1024 * 1024
MAX_CHANGES = 25


def metadata_request(item_id):
    fields = ''.join('<t:FieldURI FieldURI=' + quoteattr(field) + '/>' for field in
        ('item:Subject', 'message:From', 'item:Attachments', 'item:DateTimeSent', 'item:ParentFolderId'))
    return envelope('<m:GetItem><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape>'
        '<t:AdditionalProperties>' + fields + '<t:ExtendedFieldURI PropertyTag="0x5D02" PropertyType="String"/>'
        '</t:AdditionalProperties></m:ItemShape><m:ItemIds><t:ItemId Id='
        + quoteattr(item_id) + '/></m:ItemIds></m:GetItem>')


def read_metadata(session, config, item_id):
    tree = call(session, config, metadata_request(item_id))
    messages = tree.findall('.//m:Items/t:Message', NS)
    if len(messages) != 1:
        raise ProbeError('EWS_METADATA_INVALID')
    return messages[0]


def expected_file(message, config):
    if message.findtext('t:Subject', default='', namespaces=NS) != config['subject']:
        return None
    _, address, _ = smtp_metadata(message, 'From', 0x5D02)
    if not address or address != config['sender'].strip().casefold():
        return None
    files = [a for a in message.findall('t:Attachments/t:FileAttachment', NS)
             if a.findtext('t:Name', default='', namespaces=NS) == config['filename']
             and a.findtext('t:IsInline', default='false', namespaces=NS) == 'false']
    if not files:
        return None
    if len(files) != 1:
        raise ProbeError('EWS_ATTACHMENT_AMBIGUOUS')
    identity = files[0].find('t:AttachmentId', NS)
    try:
        size = int(files[0].findtext('t:Size', default='', namespaces=NS))
    except ValueError:
        raise ProbeError('EWS_ATTACHMENT_SIZE_INVALID') from None
    if identity is None or not identity.get('Id') or not 0 < size <= MAX_BYTES:
        raise ProbeError('EWS_ATTACHMENT_SIZE_INVALID')
    return {'id': identity.get('Id'), 'name': config['filename'], 'size': size, 'inline': False}


def sent_at(message, now=None):
    value = message.findtext('t:DateTimeSent', default='', namespaces=NS)
    try:
        date = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        raise ProbeError('EWS_SENT_DATE_INVALID') from None
    if date.tzinfo is None or date > (now or datetime.now(timezone.utc)) + timedelta(minutes=5):
        raise ProbeError('EWS_SENT_DATE_INVALID')
    return date.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def resolve_folder(session, config):
    parts = config['folder'].replace('/', '\\').strip('\\').split('\\')
    # First segment is the confirmed localized Inbox name, never an arbitrary root.
    if parts[0].casefold() not in ('inbox', 'bandeja de entrada'):
        raise ProbeError('EWS_FOLDER_CONFIG_UNSUPPORTED')
    if len(parts) == 1:
        # Inbox distinguished identity may be used directly throughout the worker.
        identity = None
    elif len(parts) == 2 and parts[1]:
        identity = resolve_inbox_subfolder(session, config, parts[1])
    else:
        raise ProbeError('EWS_FOLDER_CONFIG_UNSUPPORTED')
    tree = call(session, config, get_folder(config['mailbox'], identity))
    rights = tree.find('.//t:EffectiveRights', NS)
    if rights is None or rights.findtext('t:Read', namespaces=NS) != 'true':
        raise ProbeError('EWS_READ_RIGHT_NOT_CONFIRMED')
    fields = ('CreateAssociated', 'CreateContents', 'CreateHierarchy', 'Delete', 'Modify')
    if any(rights.findtext('t:' + f, namespaces=NS) != 'false' for f in fields):
        raise ProbeError('EWS_PERMISSIONS_TOO_BROAD')
    folder = tree.find('.//t:Folder/t:FolderId', NS)
    if folder is None or not folder.get('Id') or (identity and folder.get('Id') != identity):
        raise ProbeError('EWS_FOLDER_ID_INVALID')
    return folder.get('Id')


def binding(config):
    return hashlib.sha256(json.dumps([config['endpoint'], config['mailbox'], config['folder']],
                                    ensure_ascii=False).encode()).hexdigest()


def sync_request(folder_id, sync_state):
    state = '<m:SyncState>' + escape(sync_state) + '</m:SyncState>' if sync_state else ''
    return envelope('<m:SyncFolderItems><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape>'
        '</m:ItemShape><m:SyncFolderId>' + folder_xml('', folder_id) + '</m:SyncFolderId>'
        + state + '<m:MaxChangesReturned>' + str(MAX_CHANGES)
        + '</m:MaxChangesReturned><m:SyncScope>NormalItems</m:SyncScope></m:SyncFolderItems>')


def list_page(session, config, cursor):
    folder_id = resolve_folder(session, config)
    sync_state = None
    if cursor is not None:
        try:
            state = json.loads(cursor)
            if state['version'] != 1 or state['binding'] != binding(config) or state['folderId'] != folder_id:
                raise ValueError()
            sync_state = state['syncState']
            if not isinstance(sync_state, str) or not sync_state or len(sync_state) > 1024 * 1024:
                raise ValueError()
        except (ValueError, TypeError, KeyError):
            raise ProbeError('EWS_CURSOR_INVALID') from None
    tree = call(session, config, sync_request(folder_id, sync_state))
    response = tree.find('.//m:SyncFolderItemsResponseMessage', NS)
    if response is None:
        raise ProbeError('EWS_SYNC_RESPONSE_INVALID')
    new_state = response.findtext('m:SyncState', default='', namespaces=NS)
    last = response.findtext('m:IncludesLastItemInRange', default='', namespaces=NS)
    changes = response.find('m:Changes', NS)
    if not new_state or len(new_state) > 1024 * 1024 or last not in ('true', 'false') or changes is None or len(changes) > MAX_CHANGES or (last == 'false' and new_state == sync_state):
        raise ProbeError('EWS_SYNC_RESPONSE_INVALID')
    ids = {}
    for change in changes:
        kind = change.tag.rsplit('}', 1)[-1]
        if kind in ('Create', 'Update'):
            identity = change.find('t:Message/t:ItemId', NS)
            if identity is not None and identity.get('Id'):
                ids[identity.get('Id')] = True
        elif kind == 'Delete':
            identity = change.find('t:ItemId', NS)
            if identity is not None:
                ids.pop(identity.get('Id'), None)
        elif kind != 'ReadFlagChange':
            raise ProbeError('EWS_SYNC_CHANGE_INVALID')
    messages = []
    for item_id in ids:
        try:
            message = read_metadata(session, config, item_id)
        except ProbeError as error:
            if str(error) == 'ErrorItemNotFound':
                continue  # Concurrent deletion/move by an external mailbox user.
            raise
        attachment = expected_file(message, config)
        if attachment:
            messages.append({'id': item_id, 'sender': config['sender'], 'subject': config['subject'],
                             'reportAt': sent_at(message), 'attachments': [attachment]})
    next_cursor = json.dumps({'version': 1, 'binding': binding(config), 'folderId': folder_id, 'syncState': new_state}, separators=(',', ':'))
    return {'messages': messages, 'cursor': next_cursor, 'hasMore': last == 'false'}


def download(session, config, message_id, attachment_id, max_bytes):
    if type(max_bytes) is not int or not 0 < max_bytes <= MAX_BYTES:
        raise ProbeError('EWS_ATTACHMENT_LIMIT_INVALID')
    message = read_metadata(session, config, message_id)
    attachment = expected_file(message, config)
    if not attachment or attachment['id'] != attachment_id or attachment['size'] > max_bytes:
        raise ProbeError('EWS_ATTACHMENT_NOT_AUTHORIZED')
    # Confirm the message is still in the authorized folder, not just addressable by ID.
    folder_id = resolve_folder(session, config)
    parent = message.find('t:ParentFolderId', NS)
    if parent is None or parent.get('Id') != folder_id:
        raise ProbeError('EWS_MESSAGE_FOLDER_CHANGED')
    body = envelope('<m:GetAttachment><m:AttachmentShape/><m:AttachmentIds><t:AttachmentId Id='
                    + quoteattr(attachment_id) + '/></m:AttachmentIds></m:GetAttachment>')
    maximum = ((max_bytes + 2) // 3) * 4 + 256 * 1024
    tree = call(session, config, body, max_response=maximum)
    files = tree.findall('.//m:Attachments/t:FileAttachment', NS)
    if len(files) != 1 or files[0].findtext('t:Name', default='', namespaces=NS) != config['filename']:
        raise ProbeError('EWS_ATTACHMENT_RESPONSE_INVALID')
    returned_id = files[0].find('t:AttachmentId', NS)
    if returned_id is None or returned_id.get('Id') != attachment_id:
        raise ProbeError('EWS_ATTACHMENT_RESPONSE_INVALID')
    encoded = ''.join(files[0].findtext('t:Content', default='', namespaces=NS).split())
    try:
        data = base64.b64decode(encoded, validate=True)
    except ValueError:
        raise ProbeError('EWS_ATTACHMENT_RESPONSE_INVALID') from None
    if len(data) != attachment['size'] or len(data) > max_bytes:
        raise ProbeError('EWS_ATTACHMENT_INCOMPLETE')
    return {'base64': base64.b64encode(data).decode('ascii')}


def main():
    try:
        import requests
        from requests_ntlm import HttpNtlmAuth
        from ews_probe import settings
        request = json.loads(sys.stdin.buffer.read(2 * 1024 * 1024 + 1))
        config = request['config']
        validated = settings(config['env'])
        validated.update({k: config[k] for k in ('subject', 'sender', 'filename', 'folder')})
        password = config['env'].get('PRODUCTOS_WEB_EXCHANGE_PASSWORD', '')
        if not password:
            raise ProbeError('EWS_PASSWORD_REQUIRED')
        if config.get('ordering') != 'message_sent' or config.get('freshReportPerMessageConfirmed') is not True:
            raise ProbeError('EWS_ORDERING_NOT_CONFIRMED')
        os.environ['LM_COMPAT_LEVEL'] = '3'
        with requests.Session() as session:
            session.trust_env = False
            session.auth = HttpNtlmAuth(validated['username'], password, send_cbt=True)
            if request['action'] == 'list':
                result = list_page(session, validated, request.get('cursor'))
            elif request['action'] == 'download':
                result = download(session, validated, request['messageId'], request['attachmentId'], request['maxBytes'])
            else:
                raise ProbeError('EWS_ACTION_NOT_ALLOWED')
        print(json.dumps({'ok': True, 'result': result}))
        return 0
    except ProbeError as error:
        status = getattr(error, 'http_status', None)
        retryable = str(error) == 'ErrorServerBusy' or status == 429 or (status is not None and status >= 500)
        print(json.dumps({'ok': False, 'code': str(error), 'retryable': retryable, 'status': status}))
    except ImportError:
        print(json.dumps({'ok': False, 'code': 'EWS_DEPENDENCIES_MISSING', 'retryable': False}))
    except Exception as error:
        # Avoid exception text: it may include request bodies, credentials or URLs.
        temporary = type(error).__module__.startswith('requests.') and type(error).__name__ in ('ConnectTimeout', 'ReadTimeout', 'Timeout', 'ConnectionError')
        print(json.dumps({'ok': False, 'code': 'EWS_TRANSPORT_FAILED' if temporary else 'EWS_WORKER_FAILED', 'retryable': temporary}))
    return 1


if __name__ == '__main__':
    sys.exit(main())
