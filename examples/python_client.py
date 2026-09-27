"""Standard-library client. No messages are sent when run directly."""
import json
import os
import urllib.request
import urllib.parse

class WISClient:
    def __init__(self):
        self.base = os.environ.get('WIS_API_URL', 'http://localhost:3010/api/v1').rstrip('/')
        self.token = os.environ['WIS_API_TOKEN']

    def response(self, path, data=None, idempotency_key=None):
        headers = {'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'}
        if idempotency_key:
            headers['Idempotency-Key'] = idempotency_key
        request = urllib.request.Request(self.base + path, data=None if data is None else json.dumps(data).encode(), headers=headers)
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    def call(self, path, data=None, idempotency_key=None):
        return self.response(path, data, idempotency_key)['data']

    def iter_records(self, resource, **filters):
        """Read every available page. This does not trigger remote sync or send messages."""
        offset = 0
        while True:
            query = urllib.parse.urlencode({**filters, 'limit': 100, 'offset': offset})
            result = self.response('/' + resource.strip('/') + '?' + query)
            rows = result['data']
            if not isinstance(rows, list):
                raise ValueError('Expected a paginated list resource')
            yield from rows
            if not result.get('meta', {}).get('has_more') or not rows:
                break
            offset += len(rows)

    def overview(self):
        return self.call('/overview')

    def send_text(self, to, text, idempotency_key):
        # Persist this key in your application before calling. Never change it on retry.
        return self.call('/messages', {'to': to, 'type': 'text', 'body': text}, idempotency_key)

if __name__ == '__main__':
    print(json.dumps(WISClient().call('/connections'), indent=2))
