"""Fail-closed S3 acceptance transport. Credentials stay in the process environment.

Only sanitized error codes and explicitly selected evidence are emitted.
No database, ciphertext, identities or raw provider responses are artifacts.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import urlparse


class StorageFailure(Exception):
    pass


def require(ok, code):
    if not ok:
        raise StorageFailure(code)


def digest(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def validate_acl(acl):
    require(isinstance(acl.get("Grants"), list), "ACL_UNREADABLE")
    for grant in acl["Grants"]:
        grantee = grant.get("Grantee", {})
        require(grantee.get("Type") == "CanonicalUser" and bool(grantee.get("ID")),
                "PUBLIC_OR_UNRECOGNIZED_ACL")


def validate_policy(policy):
    statements = policy.get("Statement", [])
    if isinstance(statements, dict):
        statements = [statements]
    require(isinstance(statements, list), "POLICY_UNREADABLE")
    for statement in statements:
        if statement.get("Effect") != "Allow":
            continue
        principal = statement.get("Principal")
        # Deliberately conservative: conditional public Allows also need operator review.
        require(principal is not None and "NotPrincipal" not in statement,
                "PUBLIC_OR_UNRECOGNIZED_POLICY")
        require("*" not in json.dumps(principal), "PUBLIC_BUCKET_POLICY")


class Store:
    def __init__(self):
        self.bucket = os.environ["IONOS_S3_BUCKET"]
        self.region = os.environ["IONOS_S3_REGION"]
        self.endpoint = os.environ["IONOS_S3_ENDPOINT"]
        url = urlparse(self.endpoint)
        require(url.scheme == "https" and not url.username and not url.password
                and not url.query and not url.fragment and url.path in ("", "/"),
                "INVALID_ENDPOINT")
        # Acceptance boundary provided by the operator; no credentials sent elsewhere.
        require(self.bucket == "meterwerk-offsite-backup-fesch"
                and self.region == "eu-central-3"
                and url.hostname == "s3.eu-central-3.ionoscloud.com",
                "UNAUTHORIZED_ACCEPTANCE_TARGET")
        self.prefix = "phase3-acceptance/" + os.environ["GITHUB_RUN_ID"] + "-" + os.environ.get("GITHUB_RUN_ATTEMPT", "1") + "/"
        self.env = dict(os.environ, AWS_EC2_METADATA_DISABLED="true", AWS_PAGER="",
                        AWS_MAX_ATTEMPTS="2", AWS_SHARED_CREDENTIALS_FILE=os.devnull,
                        AWS_CONFIG_FILE=os.devnull)

    def call(self, operation, *args, allowed=(), anonymous=False):
        command = ["aws", "--endpoint-url", self.endpoint, "--region", self.region,
                   "--cli-connect-timeout", "10", "--cli-read-timeout", "30",
                   "--output", "json"]
        if anonymous:
            command += ["--no-sign-request"]
        command += ["s3api", operation, "--bucket", self.bucket, *map(str, args)]
        try:
            result = subprocess.run(command, env=self.env, capture_output=True, timeout=90)
        except (OSError, subprocess.TimeoutExpired):
            raise StorageFailure(operation + ":INFRASTRUCTURE_FAILURE") from None
        if result.returncode:
            match = re.search(rb"\(([A-Za-z0-9]+)\) when calling", result.stderr)
            code = match.group(1).decode() if match else "TRANSPORT_FAILURE"
            if code in allowed:
                return {"expectedError": code}
            raise StorageFailure(operation + ":" + code)
        return json.loads(result.stdout or b"{}")

    def preflight(self):
        self.call("head-bucket")
        location = self.call("get-bucket-location").get("LocationConstraint")
        require(location == self.region, "BUCKET_REGION_MISMATCH")
        require(self.call("get-bucket-versioning").get("Status") == "Enabled", "VERSIONING_DISABLED")
        website = self.call("get-bucket-website", allowed=("NoSuchWebsiteConfiguration",))
        require(website.get("expectedError") == "NoSuchWebsiteConfiguration", "WEBSITE_ENABLED")
        validate_acl(self.call("get-bucket-acl"))
        policy = self.call("get-bucket-policy", allowed=("NoSuchBucketPolicy",))
        if "Policy" in policy:
            validate_policy(json.loads(policy["Policy"]))
        else:
            require(policy.get("expectedError") == "NoSuchBucketPolicy", "POLICY_UNREADABLE")
        status = self.call("get-bucket-policy-status", allowed=("NoSuchBucketPolicy", "NotImplemented"))
        if "PolicyStatus" in status:
            require(status["PolicyStatus"].get("IsPublic") is False, "PUBLIC_BUCKET")
        pab = self.call("get-public-access-block", allowed=("NoSuchPublicAccessBlockConfiguration", "NotImplemented"))
        supported = pab.get("expectedError") != "NotImplemented"
        if supported:
            flags = dict.fromkeys(("BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"), True)
            if pab.get("PublicAccessBlockConfiguration") != flags:
                self.call("put-public-access-block", "--public-access-block-configuration", json.dumps(flags))
            require(self.call("get-public-access-block").get("PublicAccessBlockConfiguration") == flags,
                    "PUBLIC_ACCESS_BLOCK_NOT_CONFIRMED")
        return {"privateBucketValidation": "PASSED", "endpoint": self.endpoint,
                "region": location, "versioning": "Enabled", "website": "disabled",
                "acl": "private", "policy": "no-public-allow",
                "publicAccessBlock": "all-enabled" if supported else "API_NOT_SUPPORTED"}

    def put(self, path, key, encrypted=True):
        require(key.startswith(self.prefix), "OUTSIDE_ACCEPTANCE_PREFIX")
        if encrypted:
            with open(path, "rb") as stream:
                require(stream.read(22) == b"age-encryption.org/v1\n", "UNENCRYPTED_BACKUP")
        response = self.call("put-object", "--key", key, "--body", path,
                             "--server-side-encryption", "AES256")
        version = response.get("VersionId")
        require(bool(version) and version != "null", "VERSION_ID_MISSING")
        head = self.call("head-object", "--key", key, "--version-id", version)
        require(head.get("VersionId") == version and head.get("ServerSideEncryption") == "AES256"
                and head.get("ContentLength") == Path(path).stat().st_size, "OBJECT_METADATA_INVALID")
        validate_acl(self.call("get-object-acl", "--key", key, "--version-id", version))
        return {"key": key, "version": version, "sha256": digest(path), "bytes": Path(path).stat().st_size,
                "sse": "AES256"}

    def get(self, record, path):
        require(record["key"].startswith(self.prefix), "OUTSIDE_ACCEPTANCE_PREFIX")
        require(not Path(path).exists(), "DOWNLOAD_DESTINATION_EXISTS")
        response = self.call("get-object", "--key", record["key"], "--version-id", record["version"], path)
        require(response.get("VersionId") == record["version"] and response.get("ServerSideEncryption") == "AES256",
                "DOWNLOAD_METADATA_INVALID")
        require(Path(path).stat().st_size == record["bytes"] and digest(path) == record["sha256"], "DOWNLOAD_HASH_INVALID")


def roundtrip(file, evidence):
    store = Store()
    security = store.preflight()
    path = Path(file)
    manifest = Path(str(path) + ".manifest.json")
    records = [store.put(path, store.prefix + path.name)]
    if manifest.exists():
        records.append(store.put(manifest, store.prefix + manifest.name, encrypted=False))
    for source in (path, manifest):
        source.unlink(missing_ok=True)
    require(not path.exists() and not manifest.exists(), "LOCAL_COPY_REMAINS")
    started = time.time()
    for record in records:
        store.get(record, path.parent / Path(record["key"]).name)
    result = {"status": "PASSED", "sourceSha": os.environ.get("GITHUB_SHA"),
              "security": security, "objects": records, "localCopiesRemoved": True,
              "offsiteOnlyDownload": True, "downloadStartEpoch": started,
              "downloadEndEpoch": time.time(), "cleanup": "retain encrypted test objects; no remote deletes"}
    Path(evidence).write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    try:
        if sys.argv[1] == "preflight":
            result = Store().preflight()
            Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + "\n")
        elif sys.argv[1] == "roundtrip":
            roundtrip(sys.argv[2], sys.argv[3])
        else:
            raise StorageFailure("UNKNOWN_ACTION")
    except Exception as error:
        # Never emit exception/provider payloads that could contain credentials.
        print(str(error) if isinstance(error, StorageFailure) else "OFFSITE_INTERNAL_FAILURE", file=sys.stderr)
        sys.exit(1)
