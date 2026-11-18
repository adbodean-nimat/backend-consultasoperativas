"""Manual read-only EWS/NTLM diagnostic; independent of the pending Node adapter."""
import argparse
import errno
import getpass
import json
import os
from pathlib import Path
import re
import socket
import ssl
import sys
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape, quoteattr

NS = {"m": "http://schemas.microsoft.com/exchange/services/2006/messages",
      "t": "http://schemas.microsoft.com/exchange/services/2006/types"}
MAX_RESPONSE = 2 * 1024 * 1024


class ProbeError(Exception):
    """Contains a safe diagnostic code, never a raw provider response."""


def connection_detail(error):
    """Classify wrapped Requests/urllib3 failures without exposing exception text."""
    pending, seen, errors = [error], set(), []
    while pending and len(seen) < 32:
        current = pending.pop()
        if not isinstance(current, BaseException) or id(current) in seen:
            continue
        seen.add(id(current))
        errors.append(current)
        pending.extend([current.__cause__, current.__context__, getattr(current, "reason", None)])
        pending.extend(arg for arg in current.args if isinstance(arg, BaseException))
    if any(isinstance(e, ssl.SSLError) for e in errors):
        return "TLS_HANDSHAKE_FAILED"
    if any(isinstance(e, socket.gaierror) or
           (type(e).__module__.startswith("urllib3.") and type(e).__name__ == "NameResolutionError") for e in errors):
        return "DNS_RESOLUTION_FAILED"
    if any(isinstance(e, TimeoutError) for e in errors):
        return "NETWORK_TIMEOUT"
    reasons = [(errno.ECONNREFUSED, "CONNECTION_REFUSED"),
               (errno.ENETUNREACH, "NETWORK_UNREACHABLE"),
               (errno.EHOSTUNREACH, "HOST_UNREACHABLE"),
               (errno.ECONNRESET, "CONNECTION_RESET"),
               (errno.EPIPE, "CONNECTION_CLOSED")]
    for number, reason in reasons:
        if any(isinstance(e, OSError) and e.errno == number for e in errors):
            return reason
    return "UNCLASSIFIED_CONNECTION_ERROR"


def required(env, name):
    value = env.get(name, "").strip()
    if not value:
        raise ProbeError("MISSING_" + name)
    return value


def settings(env):
    endpoint = required(env, "PRODUCTOS_WEB_EXCHANGE_URL")
    parsed = urlsplit(endpoint)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment):
        raise ProbeError("EWS_HTTPS_URL_REQUIRED")
    if required(env, "PRODUCTOS_WEB_EXCHANGE_PROTOCOL").lower() != "ews":
        raise ProbeError("EWS_PROTOCOL_REQUIRED")
    if required(env, "PRODUCTOS_WEB_EXCHANGE_AUTH").lower() != "ntlm":
        raise ProbeError("EWS_NTLM_ADMIN_CONFIRMATION_REQUIRED")
    domain = required(env, "PRODUCTOS_WEB_EXCHANGE_DOMAIN")
    user = required(env, "PRODUCTOS_WEB_EXCHANGE_USER")
    if any(c in domain + user for c in "\\/\r\n@"):
        raise ProbeError("EWS_EXPECT_NETBIOS_DOMAIN_AND_SAMACCOUNTNAME")
    ca = env.get("PRODUCTOS_WEB_EXCHANGE_CA_FILE", "").strip()
    if ca and not Path(ca).is_file():
        raise ProbeError("EWS_CA_FILE_NOT_FOUND")
    return {"endpoint": endpoint, "username": domain + "\\" + user,
            "mailbox": required(env, "PRODUCTOS_WEB_MAILBOX"), "verify": ca or True}


def folder_xml(mailbox, folder_id=None):
    if folder_id:
        return "<t:FolderId Id=" + quoteattr(folder_id) + "/>"
    return ('<t:DistinguishedFolderId Id="inbox"><t:Mailbox><t:EmailAddress>'
            + escape(mailbox) + '</t:EmailAddress></t:Mailbox></t:DistinguishedFolderId>')


def envelope(body):
    return ('<?xml version="1.0" encoding="utf-8"?>'
            '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
            'xmlns:m="' + NS["m"] + '" xmlns:t="' + NS["t"] + '">'
            '<s:Header><t:RequestServerVersion Version="Exchange2013_SP1"/></s:Header>'
            '<s:Body>' + body + '</s:Body></s:Envelope>').encode("utf-8")


def get_folder(mailbox, folder_id=None):
    return envelope('<m:GetFolder><m:FolderShape><t:BaseShape>IdOnly</t:BaseShape>'
                    '<t:AdditionalProperties><t:FieldURI FieldURI="folder:EffectiveRights"/>'
                    '</t:AdditionalProperties>'
                    '</m:FolderShape><m:FolderIds>' + folder_xml(mailbox, folder_id)
                    + '</m:FolderIds></m:GetFolder>')


def find_report(mailbox, subject, sender, folder_id=None, filter_mode="combined"):
    def equals(field, value):
        return ('<t:IsEqualTo><t:FieldURI FieldURI=' + quoteattr(field)
                + '/><t:FieldURIOrConstant><t:Constant Value=' + quoteattr(value)
                + '/></t:FieldURIOrConstant></t:IsEqualTo>')
    criteria = {
        "all": [],
        "subject": [("item:Subject", subject)],
        "sender": [("message:From", sender)],
        "subject_sender": [("item:Subject", subject), ("message:From", sender)],
        "combined": [("item:Subject", subject), ("message:From", sender), ("item:HasAttachments", "true")],
    }
    if filter_mode not in criteria:
        raise ProbeError("EWS_FILTER_MODE_INVALID")
    clauses = [equals(field, value) for field, value in criteria[filter_mode]]
    restriction = ""
    if clauses:
        condition = clauses[0] if len(clauses) == 1 else '<t:And>' + ''.join(clauses) + '</t:And>'
        restriction = '<m:Restriction>' + condition + '</m:Restriction>'
    return envelope('<m:FindItem Traversal="Shallow"><m:ItemShape>'
                    '<t:BaseShape>IdOnly</t:BaseShape></m:ItemShape>'
                    '<m:IndexedPageItemView MaxEntriesReturned="1" Offset="0" BasePoint="Beginning"/>'
                    + restriction + '<m:ParentFolderIds>'
                    + folder_xml(mailbox, folder_id) + '</m:ParentFolderIds></m:FindItem>')


def find_inbox_subfolder(mailbox, name):
    if not name or any(c in name for c in "\\/\r\n"):
        raise ProbeError("EWS_EXPECT_DIRECT_INBOX_SUBFOLDER_NAME")
    return envelope('<m:FindFolder Traversal="Shallow"><m:FolderShape>'
                    '<t:BaseShape>IdOnly</t:BaseShape><t:AdditionalProperties>'
                    '<t:FieldURI FieldURI="folder:DisplayName"/></t:AdditionalProperties>'
                    '</m:FolderShape><m:IndexedPageFolderView MaxEntriesReturned="2" '
                    'Offset="0" BasePoint="Beginning"/><m:Restriction><t:IsEqualTo>'
                    '<t:FieldURI FieldURI="folder:DisplayName"/><t:FieldURIOrConstant>'
                    '<t:Constant Value=' + quoteattr(name) + '/></t:FieldURIOrConstant>'
                    '</t:IsEqualTo></m:Restriction><m:ParentFolderIds>'
                    + folder_xml(mailbox) + '</m:ParentFolderIds></m:FindFolder>')


def resolve_inbox_subfolder(session, config, name):
    tree = call(session, config, find_inbox_subfolder(config["mailbox"], name))
    root = tree.find(".//m:RootFolder", NS)
    if root is None or root.get("IncludesLastItemInRange") != "true":
        raise ProbeError("EWS_FOLDER_LOOKUP_INCOMPLETE")
    folders = root.findall("t:Folders/*", NS)
    if not folders:
        raise ProbeError("ErrorFolderNotFound")
    if len(folders) != 1 or folders[0].findtext("t:DisplayName", namespaces=NS) != name:
        raise ProbeError("EWS_FOLDER_LOOKUP_AMBIGUOUS")
    folder = folders[0].find("t:FolderId", NS)
    if folder is None or not folder.get("Id"):
        raise ProbeError("EWS_FOLDER_ID_MISSING")
    return folder.get("Id")


def check_response(content):
    # Reject entities/DTDs, including UTF-16 payloads. EWS returns ordinary XML.
    if b"\x00" in content or re.search(br"<!\s*(DOCTYPE|ENTITY)", content, re.I):
        raise ProbeError("EWS_UNSAFE_XML")
    try:
        tree = ET.fromstring(content)
    except ET.ParseError:
        raise ProbeError("EWS_INVALID_XML") from None
    codes = [node.text for node in tree.findall(".//m:ResponseCode", NS)]
    if not codes or any(code != "NoError" for code in codes):
        # Only report identifiers from a fixed allowlist; never MessageText or raw XML.
        allowed = {"ErrorAccessDenied", "ErrorFolderNotFound", "ErrorNonExistentMailbox",
                   "ErrorServerBusy", "ErrorInvalidUserInfo", "ErrorInvalidPropertyForOperation"}
        code = next((code for code in codes if code in allowed), "EWS_OPERATION_FAILED")
        raise ProbeError(code)
    return tree


def call(session, config, body):
    with session.post(config["endpoint"], data=body,
                      headers={"Content-Type": "text/xml; charset=utf-8",
                               "User-Agent": "Nimat-ProductosWeb/1.0"},
                      timeout=(10, 30), verify=config["verify"],
                      allow_redirects=False, stream=True) as response:
        if response.status_code != 200:
            raise ProbeError("EWS_HTTP_" + str(response.status_code))
        content = bytearray()
        for chunk in response.iter_content(65536):
            content.extend(chunk)
            if len(content) > MAX_RESPONSE:
                raise ProbeError("EWS_RESPONSE_LIMIT")
        return check_response(bytes(content))


def probe(session, config, subject, sender, folder_id=None, diagnose_filters=False):
    folder = call(session, config, get_folder(config["mailbox"], folder_id))
    rights = folder.find(".//t:EffectiveRights", NS)
    if rights is None or rights.findtext("t:Read", namespaces=NS) != "true":
        raise ProbeError("EWS_READ_RIGHT_NOT_CONFIRMED")
    # Inspect effective rights rather than performing a destructive negative test.
    mutations = ("CreateAssociated", "CreateContents", "CreateHierarchy", "Delete", "Modify")
    if any(rights.findtext("t:" + right, namespaces=NS) not in ("true", "false") for right in mutations):
        raise ProbeError("EWS_WRITE_RIGHTS_NOT_CONFIRMED")
    if any(rights.findtext("t:" + right, namespaces=NS) == "true" for right in mutations):
        raise ProbeError("EWS_PERMISSIONS_TOO_BROAD")
    tree = call(session, config, find_report(config["mailbox"], subject, sender, folder_id))
    matched = bool(tree.findall(".//t:Items/t:Message", NS))
    result = {"ok": True, "folderReadable": True, "reportFound": matched,
            "readOnly": True, "writeRightsDetected": False,
            "attachmentDownloaded": False, "dropboxTouched": False}
    if diagnose_filters:
        matches = {}
        for mode in ("all", "subject", "sender", "subject_sender"):
            response = call(session, config, find_report(config["mailbox"], subject, sender, folder_id, mode))
            matches[mode] = bool(response.findall(".//t:Items/*", NS))
        matches["combined"] = matched
        result["diagnosticMatches"] = matches
    return result


def main():
    parser = argparse.ArgumentParser(description="Consulta EWS sin modificar correos ni tocar Dropbox.")
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--diagnose-filters", action="store_true",
                        help="Devuelve sólo coincidencias booleanas de filtros; no lista datos de correos.")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--inbox", action="store_true", help="Sólo si el administrador confirmó Bandeja de entrada.")
    target.add_argument("--folder-id", help="ID EWS de la carpeta autorizada, no ID de Outlook ni FolderStatistics.")
    target.add_argument("--inbox-subfolder", help="Nombre exacto de una subcarpeta directa de Inbox; requiere visibilidad del padre.")
    args = parser.parse_args()
    try:
        import requests
        from requests_ntlm import HttpNtlmAuth
        from dotenv import dotenv_values
    except ImportError:
        print(json.dumps({"ok": False, "code": "INSTALL_PROBE_REQUIREMENTS"}))
        return 1
    try:
        if not Path(args.env_file).is_file():
            raise ProbeError("ENV_FILE_NOT_FOUND")
        # Match backend precedence: process env wins; preserve secrets literally.
        env = {**dotenv_values(args.env_file, interpolate=False), **os.environ}
        config = settings(env)
        subject = required(env, "PRODUCTOS_WEB_SUBJECT")
        sender = required(env, "PRODUCTOS_WEB_SENDER")
        password = env.get("PRODUCTOS_WEB_EXCHANGE_PASSWORD", "")
        if not password:
            if not sys.stdin.isatty():
                raise ProbeError("EWS_PASSWORD_REQUIRES_INTERACTIVE_TERMINAL")
            password = getpass.getpass("Contraseña de la cuenta de servicio (no se muestra): ")
        if not password:
            raise ProbeError("EWS_PASSWORD_EMPTY")
        # Force NTLM rather than accidentally selecting Negotiate/Kerberos.
        # requests-ntlm's NTLM context uses NTLMv2 by default; do not downgrade it.
        with requests.Session() as session:
            session.trust_env = False  # No implicit proxy or .netrc credentials.
            os.environ["LM_COMPAT_LEVEL"] = "3"  # NTLMv2 on the Linux pyspnego provider.
            session.auth = HttpNtlmAuth(config["username"], password, send_cbt=True)
            folder_id = args.folder_id
            if args.inbox_subfolder:
                folder_id = resolve_inbox_subfolder(session, config, args.inbox_subfolder)
            result = probe(session, config, subject, sender, folder_id, args.diagnose_filters)
        print(json.dumps(result))
        return 0
    except ProbeError as error:
        print(json.dumps({"ok": False, "code": str(error)}))
    except requests.exceptions.SSLError:
        print(json.dumps({"ok": False, "code": "EWS_TLS_FAILED"}))
    except requests.exceptions.ConnectTimeout:
        print(json.dumps({"ok": False, "code": "EWS_TIMEOUT", "detail": "CONNECT_TIMEOUT"}))
    except requests.exceptions.ReadTimeout:
        print(json.dumps({"ok": False, "code": "EWS_TIMEOUT", "detail": "READ_TIMEOUT"}))
    except requests.exceptions.Timeout:
        print(json.dumps({"ok": False, "code": "EWS_TIMEOUT", "detail": "UNCLASSIFIED_TIMEOUT"}))
    except requests.exceptions.ConnectionError as error:
        print(json.dumps({"ok": False, "code": "EWS_CONNECTION_FAILED",
                          "detail": connection_detail(error)}))
    except Exception:
        print(json.dumps({"ok": False, "code": "EWS_PROBE_FAILED"}))
    return 1


if __name__ == "__main__":
    sys.exit(main())
