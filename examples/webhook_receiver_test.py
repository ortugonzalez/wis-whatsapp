"""Offline receiver contract tests: no listener, external requests or business work."""
import hashlib
import hmac
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from contextlib import closing
from webhook_receiver import verify_event, persist_event


class ReceiverTests(unittest.TestCase):
    def setUp(self):
        self.secret = 'offline-test-only'
        self.now = 1700000000
        self.event = {'id': 'test-event', 'type': 'message.created', 'data': {'body': 'á'}}
        self.raw = json.dumps(self.event, ensure_ascii=False).encode()

    def headers(self, raw=None, timestamp=None):
        stamp = str(self.now if timestamp is None else timestamp)
        raw = self.raw if raw is None else raw
        mac = hmac.new(self.secret.encode(), stamp.encode() + b'.' + raw, hashlib.sha256).hexdigest()
        return {'X-WIS-Timestamp': stamp, 'X-WIS-Signature': 'sha256=' + mac, 'X-WIS-Event-ID': self.event['id']}

    def test_original_bytes_verified_and_modified_bytes_rejected(self):
        self.assertEqual(verify_event(self.raw, self.headers(), self.secret, self.now), self.event)
        with self.assertRaises(ValueError):
            verify_event(self.raw + b' ', self.headers(), self.secret, self.now)

    def test_expired_future_missing_secret_and_mismatched_id_rejected(self):
        for timestamp in [self.now - 301, self.now + 301]:
            with self.assertRaises(ValueError):
                verify_event(self.raw, self.headers(timestamp=timestamp), self.secret, self.now)
        with self.assertRaises(ValueError):
            verify_event(self.raw, self.headers(), '', self.now)
        headers = self.headers()
        headers['X-WIS-Event-ID'] = 'wrong'
        with self.assertRaises(ValueError):
            verify_event(self.raw, headers, self.secret, self.now)

    def test_signed_malformed_event_rejected(self):
        for body in [None, [], {}, {'id': '', 'type': 'x', 'data': {}}, {'id': 'test-event', 'type': 'x', 'data': []}]:
            raw = json.dumps(body).encode()
            with self.assertRaises(ValueError):
                verify_event(raw, self.headers(raw), self.secret, self.now)

    def test_dedup_survives_reopening_and_conflict_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'inbox.sqlite'
            self.assertTrue(persist_event(path, self.event, self.raw))
            self.assertFalse(persist_event(path, self.event, self.raw))
            with self.assertRaisesRegex(ValueError, 'conflict'):
                persist_event(path, self.event, self.raw + b' ')
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM events').fetchone()[0], 1)
                self.assertEqual(db.execute('SELECT payload FROM events').fetchone()[0], self.raw.decode())


if __name__ == '__main__':
    unittest.main()
