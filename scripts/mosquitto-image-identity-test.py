"""Synthetic regression checks for the diagnostic harness, without Docker."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("identity", Path(__file__).with_name("mosquitto-image-identity.py"))
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)


class IdentityTests(unittest.TestCase):
    def check_identity(self, mode):
        tag = "diagnostic:acceptance"
        config = {"User": "mosquitto", "Entrypoint": ["/docker-entrypoint.sh"], "Cmd": ["mosquitto"], "WorkingDir": "", "Volumes": {}, "Env": []}
        raw = json.dumps({"config": config, "rootfs": {"diff_ids": ["sha256:layer"]}, "os": "linux", "architecture": "amd64"}).encode()
        digest = "sha256:" + hashlib.sha256(raw).hexdigest()
        loaded = {"Id": digest, "RepoTags": [tag], "RepoDigests": [], "Config": dict(config), "RootFS": {"Layers": ["sha256:layer"]}, "Os": "linux", "Architecture": "amd64"}
        if mode == "index":
            loaded["Id"] = "sha256:manifest-index"
        elif mode == "wrong_user":
            loaded["Config"]["User"] = "root"
        elif mode == "wrong_layers":
            loaded["RootFS"]["Layers"] = ["sha256:other"]
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "image.tar"
            inspected_path = Path(directory) / "inspect.json"
            with tarfile.open(archive_path, "w") as archive:
                files = {"config.json": raw, "manifest.json": json.dumps([{"Config": "config.json", "RepoTags": [tag]}]).encode()}
                for name, content in files.items():
                    item = tarfile.TarInfo(name)
                    item.size = len(content)
                    archive.addfile(item, io.BytesIO(content))
            inspected_path.write_text(json.dumps([loaded]), encoding="utf-8")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                result = identity.verify(archive_path, inspected_path, tag)
            return result, output.getvalue()

    def test_config_digest_verifies(self):
        result, output = self.check_identity("config")
        self.assertEqual(result, 0)
        self.assertIn("IDENTITY=VERIFIED", output)

    def test_different_digest_representation_continues(self):
        result, output = self.check_identity("index")
        self.assertEqual(result, 0)
        self.assertIn("IDENTITY=PARTIAL", output)

    def test_wrong_user_stops(self):
        result, output = self.check_identity("wrong_user")
        self.assertEqual(result, 2)
        self.assertIn("Config.User", output)

    def test_wrong_layers_stop(self):
        result, output = self.check_identity("wrong_layers")
        self.assertEqual(result, 2)
        self.assertIn("RootFS.Layers", output)


if __name__ == "__main__":
    unittest.main()
