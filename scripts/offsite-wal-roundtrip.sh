#!/usr/bin/env bash
set -euo pipefail
# Invoked only by the explicit offsite drill, after ARCHIVE_CONFIRMED.
work="$1"
evidence="$2"
[[ "$work" == /tmp/meterwerk-pitr.* && -d "$work/base" && -d "$work/archive" ]]
bundle="$RUNNER_TEMP/wal-base.tar"
cipher="$RUNNER_TEMP/wal-base.tar.age"
sudo tar -C "$work" -cf "$bundle" base archive
sudo chown "$(id -u):$(id -g)" "$bundle"
chmod 600 "$bundle"
age -r "$METERWERK_BACKUP_AGE_RECIPIENT" -o "$cipher" "$bundle"
rm "$bundle"
# Remove all source base/WAL copies before external retrieval; never touch source DB.
sudo rm -rf -- "$work/base" "$work/archive"
test ! -e "$work/base" && test ! -e "$work/archive"
python3 scripts/offsite-storage.py roundtrip "$cipher" "$evidence/offsite-wal.json"
age -d -i "$METERWERK_BACKUP_AGE_IDENTITY_FILE" -o "$bundle" "$cipher"
# Bundle is hash-pinned to the locally generated archive; provider cannot substitute it.
sudo tar -C "$work" -xf "$bundle"
rm "$bundle" "$cipher"
test -f "$work/base/backup_manifest"
