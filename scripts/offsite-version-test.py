"""Real version retrieval and explicit negative responses; no remote deletes."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

spec = importlib.util.spec_from_file_location("storage", Path(__file__).with_name("offsite-storage.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def main():
    store = m.Store()
    store.preflight()
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "version-probe"
        path.write_bytes(b"synthetic version one")
        first = store.put(path, store.prefix + "version-probe", encrypted=False)
        print("VERSION_ONE_METADATA_CONFIRMED")
        path.write_bytes(b"synthetic version two")
        second = store.put(path, first["key"], encrypted=False)
        print("VERSION_TWO_METADATA_CONFIRMED")
        m.require(first["version"] != second["version"], "VERSIONING_NOT_EFFECTIVE")
        path.unlink()
        store.get(first, path)
        print("OLDER_VERSION_RETRIEVED")
        m.require(path.read_bytes() == b"synthetic version one", "OLD_VERSION_INVALID")
        missing = store.call("head-object", "--key", store.prefix + "absent",
                             allowed=("404", "NoSuchKey", "NotFound"))
        m.require("expectedError" in missing, "MISSING_OBJECT_UNEXPECTED_SUCCESS")
        store.call("head-object", "--key", first["key"])
        version = store.call("get-object", "--key", first["key"], "--version-id", "invalid-version",
                             str(Path(directory) / "invalid"), allowed=("NoSuchVersion", "NoSuchKey", "InvalidArgument", "404"))
        m.require("expectedError" in version, "INVALID_VERSION_UNEXPECTED_SUCCESS")
        denied = store.call("get-object", "--key", first["key"], str(Path(directory) / "anonymous"),
                            anonymous=True, allowed=("AccessDenied", "403"))
        m.require("expectedError" in denied, "ANONYMOUS_ACCESS_ALLOWED")
        Path(sys.argv[1]).write_text(json.dumps({"status": "PASSED", "versions": [first, second],
            "olderVersionRetrieved": True, "missingObject": missing["expectedError"],
            "invalidVersion": version["expectedError"], "anonymousDenied": denied["expectedError"],
            "cleanup": "retained synthetic probe versions; no DeleteObject permission required"}, indent=2) + "\n")


try:
    main()
except Exception as error:
    print(str(error) if isinstance(error, m.StorageFailure) else "VERSION_TEST_INTERNAL_FAILURE", file=sys.stderr)
    sys.exit(1)
