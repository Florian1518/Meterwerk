"""Synthetic WAL transport: never change bucket settings or delete objects."""
import importlib.util
import json
from pathlib import Path
import re
import sys

spec = importlib.util.spec_from_file_location("storage", Path(__file__).with_name("offsite-storage.py"))
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)

if __name__ == "__main__":
    try:
        store = storage.Store()
        action = sys.argv[1]
        if action == "ship":
            source, destination, wal = sys.argv[2:]
            storage.require(re.fullmatch(r"[0-9A-F]{24}", wal), "INVALID_WAL_NAME")
            storage.require(store.call("get-bucket-versioning").get("Status") == "Enabled", "VERSIONING_DISABLED")
            object_class = __import__("os").environ.get("METERWERK_WAL_OBJECT_CLASS", "continuous-wal")
            storage.require(object_class in ("continuous-wal", "startup-wal"), "INVALID_OBJECT_CLASS")
            record = store.put(source, store.prefix + object_class + "/" + wal + ".age")
            store.get(record, destination)
            print(json.dumps(record))
        elif action == "verify":
            store.get(json.loads(Path(sys.argv[2]).read_text()), sys.argv[3])
        else:
            raise storage.StorageFailure("UNKNOWN_ACTION")
    except Exception:
        # All provider errors remain failures; no raw response or credentials.
        print("WAL_TRANSPORT_FAILURE", file=sys.stderr)
        sys.exit(1)
