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
from pathlib import Path
from contextlib import closing

MAX_BODY = 1024 * 1024


def verify_event(payload, headers, secret, now=None):
    """Verify original bytes before parsing; never reconstruct JSON for the MAC."""
    if not secret or not isinstance(payload, bytes) or not 0 < len(payload) <= MAX_BODY:
        raise ValueError('unauthorized')
    timestamp = headers.get('X-WIS-Timestamp', '')
    signature = headers.get('X-WIS-Signature', '')
    if not isinstance(timestamp, str) or not timestamp.isascii() or not timestamp.isdigit() or len(timestamp) > 12:
        raise ValueError('unauthorized')
    if abs((time.time() if now is None else now) - int(timestamp)) > 300:
        raise ValueError('unauthorized')
    expected = 'sha256=' + hmac.new(secret.encode(), timestamp.encode() + b'.' + payload, hashlib.sha256).hexdigest()
    if not isinstance(signature, str) or not signature.isascii() or not hmac.compare_digest(signature, expected):
        raise ValueError('unauthorized')
    try:
        event = json.loads(payload)
    except (ValueError, UnicodeDecodeError):
        raise ValueError('invalid_event') from None
    if not isinstance(event, dict):
        raise ValueError('invalid_event')
    event_id, event_type = event.get('id'), event.get('type')
    if not isinstance(event_id, str) or not 0 < len(event_id) <= 256 or event_id != headers.get('X-WIS-Event-ID'):
        raise ValueError('invalid_event')
    if not isinstance(event_type, str) or not 0 < len(event_type) <= 100 or not isinstance(event.get('data'), dict):
        raise ValueError('invalid_event')
    return event


def persist_event(path, event, payload):
    """Acknowledge only after commit. Equal IDs with different bytes are conflicts."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path, timeout=10)) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, payload TEXT NOT NULL, processed INTEGER NOT NULL DEFAULT 0)')
        db.execute('BEGIN IMMEDIATE')
        existing = db.execute('SELECT payload FROM events WHERE id=?', (event['id'],)).fetchone()
        text = payload.decode('utf-8')
        if existing:
            if existing[0] != text:
                raise ValueError('event_id_conflict')
            return False
        db.execute('INSERT INTO events(id,payload) VALUES (?,?)', (event['id'], text))
        return True

class Receiver(BaseHTTPRequestHandler):
    def do_POST(self):
        self.connection.settimeout(10)
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except (TypeError, ValueError):
            self.send_error(400)
            return
        if self.headers.get('Transfer-Encoding') or not 0 < length <= MAX_BODY:
            self.send_error(413)
            return
        try:
            payload = self.rfile.read(length)
            if len(payload) != length:
                raise ValueError('incomplete_body')
            event = verify_event(payload, self.headers, os.environ.get('WIS_WEBHOOK_SECRET', ''))
        except (ValueError, TypeError, OSError):
            self.send_error(401)
            return
        # Persist first, acknowledge second. A separate worker consumes this inbox.
        try:
            persist_event(os.environ.get('WIS_WEBHOOK_DB', '.local/webhook-inbox.sqlite'), event, payload)
        except ValueError:
            self.send_error(409)
            return
        except (OSError, sqlite3.Error):
            self.send_error(503)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', '17')
        self.end_headers()
        self.wfile.write(b'{"accepted":true}')

    def log_message(self, *_args):
        pass

if __name__ == '__main__':
    if not os.environ.get('WIS_WEBHOOK_SECRET'):
        raise SystemExit('Set WIS_WEBHOOK_SECRET in the environment, never in source code.')
    os.makedirs('.local', exist_ok=True)
    HTTPServer(('127.0.0.1', 8088), Receiver).serve_forever()
