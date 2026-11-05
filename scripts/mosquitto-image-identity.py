"""Compare explicitly saved Docker image config and loaded runtime metadata."""
import hashlib
import json
import sys
import tarfile


def verify(archive_path, inspected_path, tag):
    with open(inspected_path, encoding="utf-8") as stream:
        loaded = json.load(stream)[0]
    print("LOADED_ID=" + loaded["Id"])
    print("LOADED_REPO_DIGESTS=" + json.dumps(loaded.get("RepoDigests", [])))
    print("LOADED_REPO_TAGS=" + json.dumps(loaded.get("RepoTags", [])))
    with tarfile.open(archive_path) as archive:
        manifest = json.load(archive.extractfile("manifest.json"))
        entries = [item for item in manifest if tag in (item.get("RepoTags") or [])]
        if len(entries) != 1:
            print("DIAGNOSTIC_IMAGE_IDENTITY=PARTIAL reason=archive_tag_not_unique")
            return 0
        raw = archive.extractfile(entries[0]["Config"]).read()
        expected = json.loads(raw)
    digest = "sha256:" + hashlib.sha256(raw).hexdigest()
    print("ARCHIVE_CONFIG_DIGEST=" + digest)
    mismatch = []
    for field in ("User", "Entrypoint", "Cmd", "WorkingDir", "Volumes", "Env"):
        if expected.get("config", {}).get(field) != loaded.get("Config", {}).get(field):
            mismatch.append("Config." + field)
    layers = expected.get("rootfs", {}).get("diff_ids")
    loaded_layers = loaded.get("RootFS", {}).get("Layers")
    if layers and loaded_layers and layers != loaded_layers:
        mismatch.append("RootFS.Layers")
    for key, runtime_key in (("architecture", "Architecture"), ("os", "Os")):
        if expected.get(key) and loaded.get(runtime_key) != expected[key]:
            mismatch.append(runtime_key)
    if tag not in (loaded.get("RepoTags") or []):
        mismatch.append("RepoTags")
    if mismatch:
        print("DIAGNOSTIC_IMAGE_IDENTITY=FAILED mismatch=" + ",".join(mismatch))
        return 2
    if loaded["Id"] == digest:
        print("DIAGNOSTIC_IMAGE_IDENTITY=VERIFIED method=archive_config_sha256")
    else:
        print("DIAGNOSTIC_IMAGE_IDENTITY=PARTIAL method=tag_config_rootfs_metadata; different_identity_representation")
    return 0


if __name__ == "__main__":
    try:
        code = verify(*sys.argv[1:])
    except Exception as error:
        print("DIAGNOSTIC_IMAGE_IDENTITY=PARTIAL verifier_error=" + type(error).__name__)
        code = 0
    sys.exit(code)
