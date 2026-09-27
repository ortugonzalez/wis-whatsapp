"""Standard-library client. No messages are sent when run directly."""
import json
import os
import urllib.request

class WISClient:
    def __init__(self):
        self.base = os.environ.get('WIS_API_URL', 'http://localhost:3010/api/v1').rstrip('/')
        self.token = os.environ['WIS_API_TOKEN']

    def call(self, path, data=None, idempotency_key=None):
        headers = {'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'}
        if idempotency_key:
            headers['Idempotency-Key'] = idempotency_key
        request = urllib.request.Request(self.base + path, data=None if data is None else json.dumps(data).encode(), headers=headers)
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)['data']

    def send_text(self, to, text, idempotency_key):
        # Persist this key in your application before calling. Never change it on retry.
        return self.call('/messages', {'to': to, 'type': 'text', 'body': text}, idempotency_key)

if __name__ == '__main__':
    print(json.dumps(WISClient().call('/connections'), indent=2))
