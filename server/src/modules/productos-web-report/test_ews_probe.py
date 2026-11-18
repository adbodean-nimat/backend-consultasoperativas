"""Offline contract tests; no credentials, network or third-party dependencies."""
import unittest
import errno
import socket
import ssl
import contextlib
import io
import json
import sys
import tempfile
import types
from unittest.mock import patch
from xml.etree import ElementTree as ET
from ews_probe import (MAX_RESPONSE, NS, ProbeError, call, check_response,
                       find_report, get_folder, probe, settings,
                       find_inbox_subfolder, resolve_inbox_subfolder, connection_detail)
from ews_probe import main


def xml(body="", code="NoError"):
    return ('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
            'xmlns:m="' + NS["m"] + '" xmlns:t="' + NS["t"] + '"><s:Body>'
            '<m:ResponseCode>' + code + '</m:ResponseCode>' + body
            + '</s:Body></s:Envelope>').encode()


def folder(modify="false"):
    return xml('<t:EffectiveRights><t:Read>true</t:Read>'
               '<t:CreateAssociated>false</t:CreateAssociated>'
               '<t:CreateContents>false</t:CreateContents>'
               '<t:CreateHierarchy>false</t:CreateHierarchy>'
               '<t:Delete>false</t:Delete><t:Modify>' + modify
               + '</t:Modify></t:EffectiveRights>')


class Response:
    def __init__(self, body, status=200):
        self.body, self.status_code = body, status
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def iter_content(self, size):
        yield self.body


class Session:
    def __init__(self, responses):
        self.responses, self.calls = list(responses), []
    def post(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.responses.pop(0)


class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.env = {"PRODUCTOS_WEB_EXCHANGE_URL": "https://exchange.example.test/ews/exchange.asmx",
                    "PRODUCTOS_WEB_EXCHANGE_PROTOCOL": "ews",
                    "PRODUCTOS_WEB_EXCHANGE_AUTH": "ntlm", "PRODUCTOS_WEB_EXCHANGE_DOMAIN": "TEST",
                    "PRODUCTOS_WEB_EXCHANGE_USER": "svc_prodweb", "PRODUCTOS_WEB_MAILBOX": "mail@example.test"}
        self.config = settings(self.env)

    def test_explicit_credentials_do_not_require_machine_domain(self):
        self.assertEqual(self.config["username"], "TEST\\svc_prodweb")
        self.assertIs(self.config["verify"], True)

    def test_configuration_fails_closed(self):
        for key, value in [("PRODUCTOS_WEB_EXCHANGE_AUTH", ""),
                           ("PRODUCTOS_WEB_EXCHANGE_AUTH", "basic"),
                           ("PRODUCTOS_WEB_EXCHANGE_URL", "http://exchange.example.test/ews"),
                           ("PRODUCTOS_WEB_EXCHANGE_URL", "https://user:password@exchange.example.test/ews"),
                           ("PRODUCTOS_WEB_EXCHANGE_DOMAIN", ""),
                           ("PRODUCTOS_WEB_EXCHANGE_USER", "TEST\\svc"),
                           ("PRODUCTOS_WEB_EXCHANGE_CA_FILE", "nonexistent-ca-file.pem")]:
            with self.subTest(key=key, value=value), self.assertRaises(ProbeError):
                settings({**self.env, key: value})

    def test_requests_are_read_only_and_escape_input(self):
        a = ET.fromstring(get_folder('mail&<@example.test'))
        self.assertEqual(a.find(".//t:EmailAddress", NS).text, 'mail&<@example.test')
        b = ET.fromstring(find_report("mail@example.test", 'Reporte "&<>', "erp@example.test"))
        self.assertEqual(b.find(".//t:Constant", NS).attrib["Value"], 'Reporte "&<>')
        self.assertIsNotNone(b.find(".//m:FindItem", NS))
        custom = ET.fromstring(get_folder("mail@example.test", 'opaque&"id'))
        self.assertEqual(custom.find(".//t:FolderId", NS).attrib["Id"], 'opaque&"id')
        self.assertIsNone(custom.find(".//t:DistinguishedFolderId", NS))

    def test_successful_probe_reports_no_writes_or_download(self):
        session = Session([Response(folder()), Response(xml('<t:Items><t:Message/></t:Items>'))])
        result = probe(session, self.config, "Reporte2", "erp@example.test")
        self.assertTrue(result["folderReadable"])
        self.assertTrue(result["reportFound"])
        self.assertFalse(result["attachmentDownloaded"])
        self.assertFalse(result["dropboxTouched"])
        self.assertEqual(len(session.calls), 2)
        for _, options in session.calls:
            self.assertIs(options["verify"], True)
            self.assertIs(options["allow_redirects"], False)
            self.assertEqual(options["timeout"], (10, 30))
            self.assertNotIn("Authorization", options["headers"])

    def test_missing_report_is_not_a_connection_failure(self):
        session = Session([Response(folder()), Response(xml('<t:Items/>'))])
        result = probe(session, self.config, "Reporte2", "erp@example.test")
        self.assertTrue(result["ok"])
        self.assertFalse(result["reportFound"])

    def test_filter_diagnostics_distinguish_sender_mismatch_without_listing_mail(self):
        empty = Response(xml('<t:Items/>'))
        hit = lambda: Response(xml('<t:Items><t:Message><t:ItemId Id="private-id"/></t:Message></t:Items>'))
        session = Session([Response(folder()), empty, hit(), hit(), empty, empty])
        result = probe(session, self.config, "Reporte2", "erp@example.test", "child-id", diagnose_filters=True)
        self.assertFalse(result["reportFound"])
        self.assertEqual(result["diagnosticMatches"],
            {"all": True, "subject": True, "sender": False, "subject_sender": False, "combined": False})
        self.assertNotIn("private-id", json.dumps(result))
        self.assertEqual(len(session.calls), 6)
        for _, options in session.calls:
            tree = ET.fromstring(options["data"])
            self.assertEqual(tree.find(".//t:FolderId", NS).get("Id"), "child-id")
            self.assertIsNone(tree.find(".//t:DistinguishedFolderId", NS))

    def test_filter_modes_preserve_combined_restriction_and_bound_results(self):
        expected = {"all": [], "subject": ["item:Subject"], "sender": ["message:From"],
                    "subject_sender": ["item:Subject", "message:From"],
                    "combined": ["item:Subject", "message:From", "item:HasAttachments"]}
        for mode, fields in expected.items():
            tree = ET.fromstring(find_report("mail@example.test", "Reporte2", "erp@example.test", "child", mode))
            self.assertEqual([field.get("FieldURI") for field in tree.findall(".//t:FieldURI", NS)], fields)
            self.assertEqual(tree.find(".//m:IndexedPageItemView", NS).get("MaxEntriesReturned"), "1")
            if mode == "all":
                self.assertIsNone(tree.find(".//m:Restriction", NS))
        with self.assertRaisesRegex(ProbeError, "EWS_FILTER_MODE_INVALID"):
            find_report("mail@example.test", "Reporte2", "erp@example.test", filter_mode="invalid")

    def test_effective_rights_must_be_read_only(self):
        for data in [folder("true"), xml(), folder().replace(b'<t:Read>true', b'<t:Read>false')]:
            with self.assertRaises(ProbeError):
                probe(Session([Response(data)]), self.config, "Reporte2", "erp@example.test")

    def test_http_auth_redirect_and_temporary_failures_are_not_retried(self):
        for status in [401, 403, 302, 429, 500]:
            session = Session([Response(b"private error", status)])
            with self.assertRaisesRegex(ProbeError, "EWS_HTTP_" + str(status)):
                call(session, self.config, get_folder("mail@example.test"))
            self.assertEqual(len(session.calls), 1)

    def test_ews_errors_are_sanitized(self):
        with self.assertRaisesRegex(ProbeError, "ErrorAccessDenied"):
            check_response(xml("", "ErrorAccessDenied"))
        with self.assertRaisesRegex(ProbeError, "^EWS_OPERATION_FAILED$"):
            check_response(xml("<m:MessageText>password-secret</m:MessageText>", "secret-untrusted-code"))

    def test_untrusted_xml_is_rejected(self):
        for payload in [b'<!DOCTYPE x [<!ENTITY test "private">]><x/>', b"not xml", '<x/>'.encode("utf-16")]:
            with self.assertRaises(ProbeError):
                check_response(payload)

    def test_response_size_is_bounded(self):
        with self.assertRaisesRegex(ProbeError, "EWS_RESPONSE_LIMIT"):
            call(Session([Response(b"a" * (MAX_RESPONSE + 1))]), self.config, get_folder("mail@example.test"))

    def test_subfolder_lookup_queries_only_exact_name_and_parent(self):
        tree = ET.fromstring(find_inbox_subfolder("mail@example.test", 'Reportes & "web"'))
        self.assertEqual(tree.find(".//m:FindFolder", NS).get("Traversal"), "Shallow")
        self.assertEqual(tree.find(".//t:Constant", NS).get("Value"), 'Reportes & "web"')
        self.assertEqual(tree.find(".//t:DistinguishedFolderId", NS).get("Id"), "inbox")
        self.assertEqual(tree.find(".//t:EmailAddress", NS).text, "mail@example.test")
        self.assertIsNone(tree.find(".//m:FindItem", NS))

    def test_subfolder_resolution_then_probes_child_id(self):
        content = xml('<m:RootFolder IncludesLastItemInRange="true"><t:Folders><t:Folder>'
                      '<t:FolderId Id="opaque-child"/><t:DisplayName>Reportes</t:DisplayName>'
                      '</t:Folder></t:Folders></m:RootFolder>')
        session = Session([Response(content), Response(folder()), Response(xml('<t:Items/>'))])
        child = resolve_inbox_subfolder(session, self.config, "Reportes")
        self.assertEqual(child, "opaque-child")
        self.assertTrue(probe(session, self.config, "Reporte2", "erp@example.test", child)["ok"])
        for _, options in session.calls[1:]:
            tree = ET.fromstring(options["data"])
            self.assertEqual(tree.find(".//t:FolderId", NS).get("Id"), "opaque-child")
            self.assertIsNone(tree.find(".//t:DistinguishedFolderId", NS))

    def test_subfolder_lookup_fails_closed_for_missing_ambiguous_or_partial(self):
        child = '<t:Folder><t:FolderId Id="child"/><t:DisplayName>Reportes</t:DisplayName></t:Folder>'
        for children, last in [("", "true"), (child + child, "true"), (child, "false")]:
            content = xml('<m:RootFolder IncludesLastItemInRange="' + last + '"><t:Folders>'
                          + children + '</t:Folders></m:RootFolder>')
            with self.assertRaises(ProbeError):
                resolve_inbox_subfolder(Session([Response(content)]), self.config, "Reportes")

    def test_subfolder_name_cannot_be_a_path(self):
        for name in ["", "Inbox\\Reportes", "Inbox/Reportes", "Reportes\n"]:
            with self.assertRaises(ProbeError):
                find_inbox_subfolder("mail@example.test", name)

    def test_connection_failures_are_classified_without_exception_text(self):
        cases = [(socket.gaierror(-2, "private dns details"), "DNS_RESOLUTION_FAILED"),
                 (ConnectionRefusedError(errno.ECONNREFUSED, "private endpoint"), "CONNECTION_REFUSED"),
                 (OSError(errno.ENETUNREACH, "private route"), "NETWORK_UNREACHABLE"),
                 (OSError(errno.EHOSTUNREACH, "private route"), "HOST_UNREACHABLE"),
                 (ConnectionResetError(errno.ECONNRESET, "private token"), "CONNECTION_RESET"),
                 (TimeoutError("private timeout"), "NETWORK_TIMEOUT"),
                 (ssl.SSLError("private certificate details"), "TLS_HANDSHAKE_FAILED"),
                 (Exception("password-secret"), "UNCLASSIFIED_CONNECTION_ERROR")]
        for cause, expected in cases:
            with self.subTest(expected=expected):
                wrapper = Exception("private request body", cause)
                self.assertEqual(connection_detail(wrapper), expected)

    def test_wrapped_dns_reason_and_cycles_do_not_leak_or_loop(self):
        inner = socket.gaierror(-2, "password-secret")
        middle = Exception("private URL")
        middle.reason = inner
        outer = Exception("private username")
        outer.__cause__ = middle
        inner.__context__ = outer
        self.assertEqual(connection_detail(outer), "DNS_RESOLUTION_FAILED")

    def test_cli_distinguishes_connect_and_read_timeout_without_secrets(self):
        class RequestError(Exception):
            pass
        class Timeout(RequestError):
            pass
        class ConnectionError(RequestError):
            pass
        class ConnectTimeout(ConnectionError, Timeout):
            pass
        class ReadTimeout(Timeout):
            pass
        class SSLError(ConnectionError):
            pass
        exceptions = types.SimpleNamespace(SSLError=SSLError, Timeout=Timeout,
            ConnectionError=ConnectionError, ConnectTimeout=ConnectTimeout, ReadTimeout=ReadTimeout)
        env = {**self.env, "PRODUCTOS_WEB_SUBJECT": "Reporte2",
               "PRODUCTOS_WEB_SENDER": "erp@example.test", "PRODUCTOS_WEB_EXCHANGE_PASSWORD": "password-secret"}
        for error_type, detail in [(ConnectTimeout, "CONNECT_TIMEOUT"),
                                   (ReadTimeout, "READ_TIMEOUT"), (Timeout, "UNCLASSIFIED_TIMEOUT")]:
            with self.subTest(detail=detail):
                class TimeoutSession:
                    def __enter__(self):
                        return self
                    def __exit__(self, *args):
                        pass
                    def post(self, *args, **kwargs):
                        raise error_type("private request and password-secret")
                modules = {
                    "requests": types.SimpleNamespace(Session=TimeoutSession, exceptions=exceptions),
                    "requests_ntlm": types.SimpleNamespace(HttpNtlmAuth=lambda *args, **kwargs: object()),
                    "dotenv": types.SimpleNamespace(dotenv_values=lambda *args, **kwargs: env),
                }
                with tempfile.NamedTemporaryFile() as temp, patch.dict(sys.modules, modules), \
                        patch.dict("os.environ", {}, clear=True), \
                        patch.object(sys, "argv", ["ews_probe.py", "--env-file", temp.name, "--inbox-subfolder", "Reportes"]):
                    output = io.StringIO()
                    with contextlib.redirect_stdout(output):
                        self.assertEqual(main(), 1)
                    self.assertEqual(json.loads(output.getvalue()),
                        {"ok": False, "code": "EWS_TIMEOUT", "detail": detail})
                    self.assertNotIn("password-secret", output.getvalue())


if __name__ == "__main__":
    unittest.main()
