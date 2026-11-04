import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("storage", Path(__file__).with_name("offsite-storage.py"))
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)


class OffsiteSafety(unittest.TestCase):
    def test_public_acl(self):
        for group in ("AllUsers", "AuthenticatedUsers"):
            with self.assertRaises(storage.StorageFailure):
                storage.validate_acl({"Grants": [{"Grantee": {"Type": "Group", "URI": group}}]})

    def test_public_policy(self):
        for principal in ("*", {"AWS": "*"}, {"AWS": ["*"]}):
            with self.assertRaises(storage.StorageFailure):
                storage.validate_policy({"Statement": [{"Effect": "Allow", "Principal": principal}]})

    def test_private_policy(self):
        storage.validate_policy({"Statement": [{"Effect": "Allow", "Principal": {"AWS": "specific-user"}}]})

    def test_unknown_acl(self):
        with self.assertRaises(storage.StorageFailure):
            storage.validate_acl({})

    def test_wrong_endpoint_before_credentials(self):
        with patch.dict("os.environ", {"IONOS_S3_BUCKET": "meterwerk-offsite-backup-fesch",
                                       "AWS_ACCESS_KEY_ID": "synthetic", "AWS_SECRET_ACCESS_KEY": "synthetic",
                                       "IONOS_S3_REGION": "eu-central-3",
                                       "IONOS_S3_ENDPOINT": "https://wrong.invalid"}):
            with self.assertRaisesRegex(storage.StorageFailure, "UNAUTHORIZED"):
                storage.Store()

    def test_unencrypted_before_upload(self):
        store = object.__new__(storage.Store)
        store.prefix = "phase3-acceptance/test/"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plain"
            path.write_bytes(b"PGDMP synthetic plaintext")
            with self.assertRaisesRegex(storage.StorageFailure, "UNENCRYPTED"):
                store.put(path, store.prefix + "plain")

    def test_corrupt_or_wrong_hash_download(self):
        store = object.__new__(storage.Store)
        store.prefix = "phase3-acceptance/test/"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "copy"
            def download(*args):
                path.write_bytes(b"changed")
                return {"VersionId": "v1", "ServerSideEncryption": "AES256"}
            store.call = download
            with self.assertRaisesRegex(storage.StorageFailure, "HASH"):
                store.get({"key": store.prefix + "file", "version": "v1", "bytes": 7,
                           "sha256": "0" * 64}, path)

    def test_infrastructure_not_expected_missing(self):
        store = object.__new__(storage.Store)
        store.endpoint, store.region, store.bucket, store.env = "https://example.invalid", "test", "test", {}
        store.env = {"AWS_ACCESS_KEY_ID": "synthetic", "AWS_SECRET_ACCESS_KEY": "synthetic"}
        with patch("botocore.client.BaseClient._make_api_call", side_effect=OSError()):
            with self.assertRaisesRegex(storage.StorageFailure, "INFRASTRUCTURE_FAILURE"):
                store.call("get-object", allowed=("NoSuchKey",))


if __name__ == "__main__":
    unittest.main()
