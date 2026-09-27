import unittest
from python_client import WISClient

class PaginationTest(unittest.TestCase):
    def test_reads_all_pages_without_sending_or_tokens(self):
        client = WISClient.__new__(WISClient)
        paths = []
        def response(path):
            paths.append(path)
            return {'data': [1, 2], 'meta': {'has_more': True}} if len(paths) == 1 else {'data': [3], 'meta': {'has_more': False}}
        client.response = response
        self.assertEqual(list(client.iter_records('messages', conversation_id='fixture')), [1, 2, 3])
        self.assertIn('offset=2', paths[1])
        self.assertIn('conversation_id=fixture', paths[0])

if __name__ == '__main__':
    unittest.main()
