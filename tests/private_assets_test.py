import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('assets', Path(__file__).parents[1] / 'scripts/private_assets.py')
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


class PrivateAssetsTest(unittest.TestCase):
    def test_local_custody_dedup_backup_restore(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp); root = base / 'private'; photo = base / 'synthetic.jpg'
            photo.write_bytes(b'synthetic fixture, not a real photograph')
            first = assets.ingest(root, [str(photo)])
            second = assets.ingest(root, [str(photo)])
            self.assertEqual(first, second)
            self.assertFalse(first['cloud_saved'])
            self.assertEqual(len(list((root / 'assets').iterdir())), 1)
            assets.backup(root, base / 'backup.zip')
            result = assets.restore(base / 'backup.zip', base / 'restored')
            self.assertTrue(result['integrity_verified'])
            self.assertFalse(result['cloud_restored'])
            self.assertEqual(assets.manifest(root), assets.manifest(base / 'restored'))

    def test_archive_traversal_rejected_before_creation(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            with zipfile.ZipFile(base / 'bad.zip', 'w') as z:
                z.writestr('../escaped.txt', 'not allowed')
            with self.assertRaises(ValueError):
                assets.restore(base / 'bad.zip', base / 'out')
            self.assertFalse((base / 'out').exists())

    def test_pending_retry_keeps_same_payload(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp); payload = base / 'command.json'
            payload.write_text('{"request_id":"synthetic-request-1","data":"fixture"}')
            self.assertEqual(assets.stage(base / 'private', payload), assets.stage(base / 'private', payload))
            payload.write_text('{"request_id":"synthetic-request-1","data":"changed"}')
            with self.assertRaises(ValueError): assets.stage(base / 'private', payload)


if __name__ == '__main__': unittest.main()
