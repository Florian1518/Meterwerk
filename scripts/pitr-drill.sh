#!/usr/bin/env bash
set -euo pipefail

# Disposable synthetic-only PostgreSQL PITR drill. No external DB/credentials.
command -v docker >/dev/null || { echo "docker unavailable" >&2; exit 1; }
work="$(mktemp -d /tmp/meterwerk-pitr.XXXXXX)"
source="meterwerk-pitr-source-$$"
restored="meterwerk-pitr-restored-$$"
mkdir -p "$work/archive" "$work/base"
chmod 777 "$work/archive"
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then
    echo "PITR drill failed; synthetic source and restore logs follow" >&2
    docker logs "$source" >&2 || true
    docker logs "$restored" >&2 || true
  fi
  docker rm -f "$restored" "$source" >/dev/null 2>&1 || true
  case "$work" in
    /tmp/meterwerk-pitr.*) sudo rm -rf -- "$work" ;;
    *) echo "Refusing to remove unexpected PITR temp path" >&2; return 1 ;;
  esac
  return "$result"
}
trap cleanup EXIT

docker run -d --name "$source" --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$work/archive:/archive" postgres:17-alpine \
  -c wal_level=replica -c archive_mode=on -c archive_timeout=1s \
  -c "archive_command=test ! -f /archive/%f && cp %p /archive/%f" >/dev/null
for attempt in $(seq 1 60); do
  if docker exec "$source" pg_isready -U postgres -d postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$source" pg_isready -U postgres -d postgres >/dev/null
docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE phase3_pitr_probe (marker text PRIMARY KEY); INSERT INTO phase3_pitr_probe VALUES ('baseline');" >/dev/null
docker exec "$source" psql -U postgres -d postgres -Atqc "SELECT pg_switch_wal()" >/dev/null
docker exec "$source" pg_basebackup -D /tmp/phase3-base -U postgres -X stream --checkpoint=fast >/dev/null
target="$(docker exec "$source" psql -U postgres -d postgres -Atqc \
  "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'")"
docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "INSERT INTO phase3_pitr_probe VALUES ('simulated-error'); SELECT pg_switch_wal();" >/dev/null
sleep 2
docker cp "$source:/tmp/phase3-base/." "$work/base/" >/dev/null
test "$(find "$work/archive" -type f | wc -l)" -gt 0
touch "$work/base/recovery.signal"
printf "restore_command = 'cp /archive/%%f %%p'\nrecovery_target_time = '%s'\nrecovery_target_action = 'promote'\n" \
  "$target" >> "$work/base/postgresql.auto.conf"

docker run -d --name "$restored" --network none \
  -v "$work/base:/var/lib/postgresql/data" -v "$work/archive:/archive:ro" \
  postgres:17-alpine >/dev/null
for attempt in $(seq 1 60); do
  if docker exec "$restored" pg_isready -U postgres -d postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$restored" pg_isready -U postgres -d postgres >/dev/null
baseline="$(docker exec "$restored" psql -U postgres -d postgres -Atqc \
  "SELECT count(*) FROM phase3_pitr_probe WHERE marker='baseline'")"
error_rows="$(docker exec "$restored" psql -U postgres -d postgres -Atqc \
  "SELECT count(*) FROM phase3_pitr_probe WHERE marker='simulated-error'")"
test "$baseline" = "1"
test "$error_rows" = "0"
echo "PITR synthetic drill PASSED: baseline restored, post-target error absent, target=$target"
