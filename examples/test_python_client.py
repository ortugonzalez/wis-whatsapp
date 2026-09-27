import io
import json
import unittest
from unittest.mock import Mock
from python_client import WISClient, NoRedirect


class ClientTests(unittest.TestCase):
    def client(self):
        return WISClient(token='wis_local_test')

    def test_base_and_timeout_validation(self):
        for base in ['http://example.com/api/v1', 'https://user:secret@example.com/api/v1',
                     'https://example.com/api/v1?token=x', 'file:///api/v1',
                     'http://localhost/other', 'http://localhost:99999/api/v1']:
            with self.assertRaises(ValueError):
                WISClient(base=base, token='test')
        for base in ['http://127.0.0.1:3010/api/v1', 'http://[::1]:3010/api/v1',
                     'https://example.com/api/v1']:
            WISClient(base=base, token='test')
        for timeout in [0, 61, float('nan')]:
            with self.assertRaises(ValueError):
                WISClient(token='test', timeout=timeout)

    def test_redirects_and_path_escape_rejected(self):
        with self.assertRaisesRegex(ValueError, 'redirects'):
            NoRedirect().redirect_request(None, None, 302, 'Found', {}, 'https://elsewhere.invalid')
        client = self.client()
        client._opener = Mock()
        for path in ['//elsewhere.invalid', 'https://elsewhere.invalid', '/%2e%2e/secrets', '/calls#fragment']:
            with self.assertRaises(ValueError):
                client.call(path)
        client._opener.open.assert_not_called()

    def test_readonly_pagination_detail_and_authorization(self):
        client = self.client()
        client._opener = Mock()
        client._opener.open.side_effect = [io.BytesIO(json.dumps(value).encode()) for value in
            [{'data': [{'id': 'one'}], 'meta': {'has_more': True}},
             {'data': [{'id': 'two'}], 'meta': {'has_more': False}}, {'data': {'id': '123@lid'}}]]
        self.assertEqual([row['id'] for row in client.calls(q='a b')], ['one', 'two'])
        self.assertEqual(client.detail('identities', '123@lid')['id'], '123@lid')
        requests = [call.args[0] for call in client._opener.open.call_args_list]
        self.assertTrue(all(request.get_method() == 'GET' for request in requests))
        self.assertIn('offset=1', requests[1].full_url)
        self.assertIn('123%40lid', requests[2].full_url)
        self.assertEqual(requests[0].get_header('Authorization'), 'Bearer wis_local_test')

    def test_list_allowlist_and_send_compatibility(self):
        client = self.client()
        with self.assertRaises(ValueError):
            list(client.iter_records('sync'))
        with self.assertRaises(ValueError):
            list(client.stories(id='not-list'))
        client._opener = Mock()
        client._opener.open.return_value = io.BytesIO(b'{"data":{"id":"queued"}}')
        self.assertEqual(client.send_text('+12025550123', 'test', 'stable-key')['id'], 'queued')
        request = client._opener.open.call_args.args[0]
        self.assertEqual(request.get_method(), 'POST')
        self.assertEqual(request.get_header('Idempotency-key'), 'stable-key')

    def test_conversation_detail_encodes_identifier_as_one_query_value(self):
        client = self.client()
        client._opener = Mock()
        client._opener.open.return_value = io.BytesIO(b'{"data":{"conversation":{"id":"local-id"}}}')
        identifier = 'local-id&target=//other.invalid/#fragment ?'
        self.assertEqual(client.detail('conversations', identifier)['conversation']['id'], 'local-id')
        request = client._opener.open.call_args.args[0]
        from urllib.parse import urlsplit, parse_qs
        url = urlsplit(request.full_url)
        self.assertEqual(url.path, '/api/v1/conversations')
        self.assertEqual(parse_qs(url.query), {'id': [identifier]})
        self.assertEqual(url.fragment, '')
        self.assertEqual(request.get_method(), 'GET')
        self.assertIsNone(request.data)
        client._opener.open.assert_called_once()


if __name__ == '__main__':
    unittest.main()
