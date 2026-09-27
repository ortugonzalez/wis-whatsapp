"""Standard-library client. No messages are sent when run directly."""
import json
import os
import urllib.request
import urllib.parse
import ipaddress
import math


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never forward a bearer credential to a redirected destination."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('HTTP redirects are disabled')

class WISClient:
    LIST_RESOURCES = frozenset({'contacts', 'conversations', 'messages', 'operations',
        'groups', 'events', 'calls', 'identities', 'stories', 'products', 'collections',
        'labels', 'label-associations', 'communities', 'channels', 'channel-messages', 'collection-products', 'media'})

    def __init__(self, base=None, token=None, timeout=30):
        self.base = (base or os.environ.get('WIS_API_URL', 'http://localhost:3010/api/v1')).rstrip('/')
        parsed = urllib.parse.urlsplit(self.base)
        try:
            loopback = parsed.hostname == 'localhost' or ipaddress.ip_address(parsed.hostname).is_loopback
        except ValueError:
            loopback = False
        if (parsed.scheme not in ('http', 'https') or not parsed.hostname or
                parsed.username is not None or parsed.password is not None or
                parsed.query or parsed.fragment or parsed.path != '/api/v1' or
                '\\' in self.base or any(ord(c) <= 32 for c in self.base) or
                (parsed.scheme == 'http' and not loopback)):
            raise ValueError('Use HTTPS or loopback HTTP with an /api/v1 base URL')
        parsed.port  # Validate malformed/out-of-range ports before loading credentials.
        if not isinstance(timeout, (int, float)) or not math.isfinite(timeout) or not 1 <= timeout <= 60:
            raise ValueError('Timeout must be between 1 and 60 seconds')
        self.timeout = timeout
        self.token = token if token is not None else os.environ['WIS_API_TOKEN']
        if not isinstance(self.token, str) or not self.token or any(ord(c) < 33 or ord(c) > 126 for c in self.token):
            raise ValueError('Invalid API token')
        self._opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def response(self, path, data=None, idempotency_key=None):
        if not isinstance(path, str) or not path.startswith('/') or path.startswith('//'):
            raise ValueError('Use a relative API resource path')
        parsed = urllib.parse.urlsplit(path)
        decoded = urllib.parse.unquote(parsed.path)
        if parsed.scheme or parsed.netloc or parsed.fragment or '\\' in decoded or '..' in decoded.split('/') or any(ord(c) <= 32 for c in path):
            raise ValueError('Invalid API resource path')
        headers = {'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'}
        if idempotency_key:
            if not isinstance(idempotency_key, str) or not 1 <= len(idempotency_key) <= 128 or any(ord(c) < 33 or ord(c) > 126 for c in idempotency_key):
                raise ValueError('Invalid idempotency key')
            headers['Idempotency-Key'] = idempotency_key
        request = urllib.request.Request(self.base + path, data=None if data is None else json.dumps(data).encode(), headers=headers)
        with self._opener.open(request, timeout=self.timeout) as response:
            return json.load(response)

    def call(self, path, data=None, idempotency_key=None):
        return self.response(path, data, idempotency_key)['data']

    def iter_records(self, resource, **filters):
        """Read every available page. This does not trigger remote sync or send messages."""
        if resource not in self.LIST_RESOURCES or any(key in filters for key in ('id', 'path', 'offset', 'limit')):
            raise ValueError('Use an allowed list resource and list filters')
        offset = 0
        while True:
            query = urllib.parse.urlencode({**filters, 'limit': 100, 'offset': offset})
            result = self.response('/' + resource + '?' + query)
            rows = result['data']
            if not isinstance(rows, list):
                raise ValueError('Expected a paginated list resource')
            yield from rows
            if not result.get('meta', {}).get('has_more') or not rows:
                break
            offset += len(rows)

    def overview(self):
        return self.call('/overview')

    def calls(self, **filters):
        return self.iter_records('calls', **filters)

    def identities(self, **filters):
        return self.iter_records('identities', **filters)

    def stories(self, **filters):
        """Only unexpired locally observed stories; never marks them as viewed."""
        return self.iter_records('stories', **filters)

    def channel_messages(self, target):
        """Read the bounded local snapshot of a known channel; no remote sync."""
        import re
        if not isinstance(target, str) or not re.fullmatch(r'[0-9]{1,40}@newsletter', target):
            raise ValueError('Use a known newsletter identifier')
        return self.iter_records('channel-messages', target=target)

    def detail(self, resource, identifier):
        if resource not in {'calls', 'identities', 'stories', 'messages', 'contacts', 'groups', 'conversations', 'products', 'collections'} or not isinstance(identifier, str) or not identifier:
            raise ValueError('Invalid detail resource or identifier')
        return self.call('/' + resource + '?' + urllib.parse.urlencode({'id': identifier}))

    def send_text(self, to, text, idempotency_key):
        # Persist this key in your application before calling. Never change it on retry.
        return self.call('/messages', {'to': to, 'type': 'text', 'body': text}, idempotency_key)

if __name__ == '__main__':
    # Print aggregate counts only, never account identity, token or message contents.
    try:
        counts = WISClient().overview().get('counts', {})
        print(json.dumps({key: value for key, value in counts.items()
                          if key in {'contacts', 'conversations', 'messages', 'groups', 'operations', 'pending', 'failed', 'events'}
                          and isinstance(value, int)}, indent=2))
    except Exception:
        raise SystemExit('WIS API request failed; check local configuration and access.') from None
