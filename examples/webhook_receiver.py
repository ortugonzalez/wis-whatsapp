"""Local example. Set WIS_WEBHOOK_SECRET; run behind HTTPS in production.
Use the same signature verification before a downstream n8n Webhook.
SQLite event IDs survive restarts; implement business work in a durable queue.
"""
import hashlib
import hmac
import json
import os
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

class Receiver(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', '0'))
        if not 0 < length <= 65536:
            self.send_error(413)
            return
        payload = self.rfile.read(length)
        timestamp = self.headers.get('X-WIS-Timestamp', '')
        signature = self.headers.get('X-WIS-Signature', '')
        try:
            if abs(time.time() - int(timestamp)) > 300:
                raise ValueError('expired')
            expected = 'sha256=' + hmac.new(os.environ['WIS_WEBHOOK_SECRET'].encode(), timestamp.encode() + b'.' + payload, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, expected):
                raise ValueError('signature')
            event = json.loads(payload)
            event_id = event['id']
            if event_id != self.headers.get('X-WIS-Event-ID'):
                raise ValueError('event_id')
        except (ValueError, KeyError, TypeError):
            self.send_error(401)
            return
        # Persist first, acknowledge second. A separate worker consumes this inbox.
        with sqlite3.connect(os.environ.get('WIS_WEBHOOK_DB', '.local/webhook-inbox.sqlite')) as db:
            db.execute('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, payload TEXT NOT NULL, processed INTEGER NOT NULL DEFAULT 0)')
            db.execute('INSERT OR IGNORE INTO events(id,payload) VALUES (?,?)', (event_id, payload.decode()))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"accepted":true}')

    def log_message(self, *_args):
        pass

if __name__ == '__main__':
    if not os.environ.get('WIS_WEBHOOK_SECRET'):
        raise SystemExit('Set WIS_WEBHOOK_SECRET in the environment, never in source code.')
    os.makedirs('.local', exist_ok=True)
    HTTPServer(('127.0.0.1', 8088), Receiver).serve_forever()
