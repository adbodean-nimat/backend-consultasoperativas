"""Offline transport contracts; exercise sync/dedup boundary and attachment authorization."""
import base64
from datetime import datetime, timezone
import json
import unittest
from unittest.mock import patch
from xml.etree import ElementTree as ET
from ews_probe import NS, ProbeError
from ews_worker import list_page, download, sent_at, metadata_request, sync_request, expected_file
from test_ews_probe import Response, Session, xml


CONFIG = {'endpoint': 'https://exchange.example.test:8443/ews/exchange.asmx',
          'mailbox': 'mail@example.test', 'folder': 'Bandeja de entrada\\Reportes',
          'subject': 'Reporte2', 'sender': 'erp@example.test', 'filename': 'Reporte2.xlsx', 'verify': True}


def metadata(data=b'xlsx-bytes', sender='erp@example.test', name='Reporte2.xlsx', parent='folder', date='2000-01-01T00:00:00Z', size=None, extra=''):
    return xml('<m:Items><t:Message><t:ItemId Id="message"/><t:ParentFolderId Id="' + parent + '"/>'
               '<t:Subject>Reporte2</t:Subject><t:From><t:Mailbox><t:EmailAddress>' + sender
               + '</t:EmailAddress><t:RoutingType>SMTP</t:RoutingType></t:Mailbox></t:From>'
               '<t:DateTimeSent>' + date + '</t:DateTimeSent><t:Attachments><t:FileAttachment>'
               '<t:AttachmentId Id="attachment"/><t:Name>' + name + '</t:Name><t:Size>'
               + str(len(data) if size is None else size) + '</t:Size><t:IsInline>false</t:IsInline>'
               '</t:FileAttachment>' + extra + '</t:Attachments></t:Message></m:Items>')


def sync(state='next', last=True, changes=None):
    if changes is None:
        changes = '<t:Create><t:Message><t:ItemId Id="message"/></t:Message></t:Create>'
    return xml('<m:SyncFolderItemsResponseMessage><m:SyncState>' + state + '</m:SyncState>'
               '<m:IncludesLastItemInRange>' + str(last).lower() + '</m:IncludesLastItemInRange>'
               '<m:Changes>' + changes + '</m:Changes></m:SyncFolderItemsResponseMessage>')


def attachment(data=b'xlsx-bytes', name='Reporte2.xlsx', identity='attachment'):
    return xml('<m:Attachments><t:FileAttachment><t:AttachmentId Id="' + identity + '"/><t:Name>'
               + name + '</t:Name><t:Content>' + base64.b64encode(data).decode()
               + '</t:Content></t:FileAttachment></m:Attachments>')


class WorkerTests(unittest.TestCase):
    def test_sync_cursor_survives_new_worker_and_pages(self):
        with patch('ews_worker.resolve_folder', return_value='folder'):
            first = list_page(Session([Response(sync(last=False)), Response(metadata())]), CONFIG, None)
            self.assertTrue(first['hasMore'])
            self.assertEqual(first['messages'][0]['reportAt'], '2000-01-01T00:00:00.000Z')
            second_session = Session([Response(sync('final', changes=''))])
            second = list_page(second_session, CONFIG, first['cursor'])
            self.assertFalse(second['hasMore'])
            self.assertEqual(second['messages'], [])
            body = ET.fromstring(second_session.calls[0][1]['data'])
            self.assertEqual(body.find('.//m:SyncState', NS).text, 'next')
            self.assertEqual(body.find('.//t:FolderId', NS).get('Id'), 'folder')

    def test_cursor_cannot_switch_mailbox_folder_or_binding(self):
        with patch('ews_worker.resolve_folder', return_value='folder'):
            result = list_page(Session([Response(sync(changes=''))]), CONFIG, None)
            for change in [{'folder': 'Inbox'}, {'mailbox': 'other@example.test'}, {'endpoint': 'https://other.example.test/ews'}]:
                with self.assertRaisesRegex(ProbeError, 'EWS_CURSOR_INVALID'):
                    list_page(Session([]), {**CONFIG, **change}, result['cursor'])

    def test_sync_ignores_read_flags_and_deletions_without_mutating_mail(self):
        changes = ('<t:ReadFlagChange><t:ItemId Id="read"/><t:IsRead>true</t:IsRead></t:ReadFlagChange>'
                   '<t:Create><t:Message><t:ItemId Id="deleted"/></t:Message></t:Create>'
                   '<t:Delete><t:ItemId Id="deleted"/></t:Delete>')
        session = Session([Response(sync(changes=changes))])
        with patch('ews_worker.resolve_folder', return_value='folder'):
            self.assertEqual(list_page(session, CONFIG, None)['messages'], [])
        self.assertEqual(len(session.calls), 1)

    def test_mismatching_sender_or_attachment_is_never_downloaded(self):
        for body in [metadata(sender='other@example.test'), metadata(name='other.xlsx')]:
            session = Session([Response(sync()), Response(body)])
            with patch('ews_worker.resolve_folder', return_value='folder'):
                self.assertEqual(list_page(session, CONFIG, None)['messages'], [])
            self.assertEqual(len(session.calls), 2)
            self.assertTrue(all(b'GetAttachment' not in options['data'] for _, options in session.calls))

    def test_download_rechecks_folder_identity_name_sender_and_attachment_id(self):
        for body, attachment_id in [(metadata(sender='other@example.test'), 'attachment'),
                                    (metadata(parent='other-folder'), 'attachment'),
                                    (metadata(), 'different-attachment')]:
            session = Session([Response(body)])
            with patch('ews_worker.resolve_folder', return_value='folder'), self.assertRaises(ProbeError):
                download(session, CONFIG, 'message', attachment_id, 1024)
            self.assertEqual(len(session.calls), 1)

    def test_expected_attachment_is_downloaded_once_and_bounded(self):
        data = b'expected-content'
        session = Session([Response(metadata(data)), Response(attachment(data))])
        with patch('ews_worker.resolve_folder', return_value='folder'):
            result = download(session, CONFIG, 'message', 'attachment', 1024)
        self.assertEqual(base64.b64decode(result['base64']), data)
        self.assertEqual(result['byteLength'], len(data))
        request = ET.fromstring(session.calls[1][1]['data'])
        self.assertEqual(request.find('.//t:AttachmentId', NS).get('Id'), 'attachment')

    def test_empty_oversized_invalid_base64_wrong_name_and_wrong_id_are_rejected(self):
        for response in [attachment(b''), attachment(b'x' * 1025),
                         attachment().replace(base64.b64encode(b'xlsx-bytes'), b'???'),
                         attachment()[:-20],
                         attachment(name='other.xlsx'), attachment(identity='other')]:
            session = Session([Response(metadata()), Response(response)])
            with patch('ews_worker.resolve_folder', return_value='folder'), self.assertRaises(ProbeError):
                download(session, CONFIG, 'message', 'attachment', 1024)

    def test_ews_size_includes_properties_and_is_not_content_length(self):
        data = b'file-content'
        session = Session([Response(metadata(size=len(data) + 390)), Response(attachment(data))])
        with patch('ews_worker.resolve_folder', return_value='folder'):
            result = download(session, CONFIG, 'message', 'attachment', 1024)
        self.assertEqual(base64.b64decode(result['base64']), data)
        self.assertEqual(result['byteLength'], len(data))

    def test_oversized_or_duplicate_expected_attachment_fails_closed(self):
        extra = '<t:FileAttachment><t:AttachmentId Id="other"/><t:Name>Reporte2.xlsx</t:Name><t:Size>3</t:Size></t:FileAttachment>'
        for body in [metadata(size=30 * 1024 * 1024), metadata(extra=extra)]:
            message = ET.fromstring(body).find('.//t:Message', NS)
            with self.assertRaises(ProbeError):
                expected_file(message, CONFIG)

    def test_sent_timestamp_requires_zone_and_is_not_in_future(self):
        now = datetime(2026, 11, 18, tzinfo=timezone.utc)
        for date in ['', '2000-01-01', '2099-01-01T00:00:00Z']:
            with self.assertRaises(ProbeError):
                sent_at(ET.fromstring(metadata(date=date)).find('.//t:Message', NS), now)

    def test_invalid_cursor_state_and_sync_errors_do_not_reset_cursor(self):
        with patch('ews_worker.resolve_folder', return_value='folder'):
            for cursor in ['not-json', '{}', '[]']:
                with self.assertRaises(ProbeError):
                    list_page(Session([]), CONFIG, cursor)
            with self.assertRaisesRegex(ProbeError, 'ErrorInvalidSyncStateData'):
                list_page(Session([Response(xml('', 'ErrorInvalidSyncStateData'))]), CONFIG, None)

    def test_requests_use_only_read_operations_and_specific_fields(self):
        tree = ET.fromstring(metadata_request('message'))
        fields = [f.get('FieldURI') for f in tree.findall('.//t:FieldURI', NS)]
        self.assertIn('item:DateTimeSent', fields)
        self.assertIn('item:ParentFolderId', fields)
        self.assertNotIn('item:Body', fields)
        sync_tree = ET.fromstring(sync_request('folder', 'state&'))
        self.assertEqual(sync_tree.find('.//m:SyncState', NS).text, 'state&')
        self.assertEqual(sync_tree.find('.//m:MaxChangesReturned', NS).text, '25')


if __name__ == '__main__':
    unittest.main()
