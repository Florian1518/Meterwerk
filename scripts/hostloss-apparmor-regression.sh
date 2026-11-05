#!/usr/bin/env bash
set -Euo pipefail
source scripts/hostloss-persistence-evidence.sh

stage="initialization"
out=""
host=""
image=""
failure=0

inner() { docker exec "$host" docker "$@"; }
mark_failure() {
  echo "DIAGNOSTIC_FAILURE stage=$stage reason=$1"
  failure=1
}

on_error() {
  local error_code="$1" error_line="$2" error_stage="${stage:-unknown}"
  echo "HARNESS_UNEXPECTED_ERROR stage=$error_stage exit=$error_code line=$error_line"
  exit "$error_code"
}
cleanup() {
  local exit_code="$?" exit_stage="${stage:-unknown}"
  stage="cleanup"
  echo "HARNESS_EXIT_STAGE=$exit_stage EXIT_CODE=$exit_code CLEANUP_STAGE=$stage"
  if [[ -n "${host:-}" ]]; then docker rm -fv "$host" >/dev/null 2>&1 || true; fi
}
trap 'on_error "$?" "$LINENO"' ERR
trap cleanup EXIT

if [[ -z "${RUNNER_TEMP:-}" ]]; then
  echo "HARNESS_ERROR stage=$stage missing_required_env=RUNNER_TEMP"
  exit 2
fi
out="$RUNNER_TEMP/meterwerk-apparmor-evidence"
mkdir -p "$out"
exec > >(tee "$out/regression.log") 2>&1
if [[ -z "${GITHUB_RUN_ID:-}" ]]; then
  echo "HARNESS_ERROR stage=$stage missing_required_env=GITHUB_RUN_ID"
  exit 2
fi
host="meterwerk-apparmor-${GITHUB_RUN_ID}"

stage="runner-metadata"
cat /etc/os-release
uname -a
stage="apparmor-bootstrap"
if test "$(cat /sys/module/apparmor/parameters/enabled 2>/dev/null || true)" = Y; then
  echo APPARMOR_ACTIVE=YES
else
  echo APPARMOR_ACTIVE=NO_OR_UNAVAILABLE
  mark_failure APPARMOR_UNAVAILABLE
fi

if ! node scripts/hostloss-apparmor.mjs check; then mark_failure APPARMOR_BOOTSTRAP_PRECHECK_FAILED; fi
stage="image-build"
if ! docker build -f Dockerfile.offsite-mosquitto -t meterwerk-offsite-mosquitto:acceptance .; then mark_failure MOSQUITTO_IMAGE_BUILD_FAILED; fi
stage="image-save"
if ! docker save meterwerk-offsite-mosquitto:acceptance > "$out/image.tar"; then mark_failure MOSQUITTO_IMAGE_SAVE_FAILED; fi
stage="nested-docker-start"
if ! docker run -d --privileged --name "$host" -e DOCKER_TLS_CERTDIR= docker:27-dind >/dev/null; then mark_failure NESTED_DOCKER_START_FAILED; fi
for attempt in $(seq 1 60); do
  if inner info >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! inner info >/dev/null 2>&1; then mark_failure NESTED_DOCKER_UNAVAILABLE; fi
stage="image-load"
if ! docker exec -i "$host" docker load < "$out/image.tar"; then mark_failure MOSQUITTO_IMAGE_LOAD_FAILED; fi
rm -f "$out/image.tar"

image="$(inner image inspect meterwerk-offsite-mosquitto:acceptance -f '{{.Id}}' 2>/dev/null || true)"
if test -z "$image"; then
  mark_failure MOSQUITTO_IMAGE_NOT_FOUND
else
  inner image inspect "$image" -f 'IMAGE={{.Id}} USER={{.Config.User}} ENTRYPOINT={{json .Config.Entrypoint}} CMD={{json .Config.Cmd}}' || mark_failure IMAGE_METADATA_UNAVAILABLE
  uid="$(inner run --rm --entrypoint id "$image" -u 2>/dev/null || true)"
  gid="$(inner run --rm --entrypoint id "$image" -g 2>/dev/null || true)"
  echo "MOSQUITTO_UID=${uid:-UNKNOWN}"
  echo "MOSQUITTO_GID=${gid:-UNKNOWN}"
  test "$uid" = 1883 && test "$gid" = 1883 || mark_failure MOSQUITTO_RUNTIME_IDENTITY_UNEXPECTED
fi

audit() {
  local marker="$1" target="$2" raw="$out/kernel-raw.tmp" source="dmesg" status="${2%.log}-status.log"
  stage="audit-collection"
  : > "$target"
  if ! sudo -n dmesg --since "$marker" > "$raw" 2>"$out/dmesg-error.tmp"; then
    source="journalctl"
    if ! sudo -n journalctl -k --since "$marker" --no-pager > "$raw" 2>"$out/journal-error.tmp"; then
      echo "AUDIT_READ=UNAVAILABLE SOURCE=dmesg,journalctl"
      echo AUDIT_READ=UNAVAILABLE > "$status"
      cat "$out/dmesg-error.tmp" "$out/journal-error.tmp" 2>/dev/null || true
      mark_failure AUDIT_EVIDENCE_UNAVAILABLE
      rm -f "$raw" "$out/dmesg-error.tmp" "$out/journal-error.tmp"
      return 1
    fi
  fi
  echo "AUDIT_READ=PASS SOURCE=$source" | tee "$status"
  { grep 'apparmor="DENIED"' "$raw" || true; } | { grep 'profile="mosquitto"' || true; } | tee "$target"
  rm -f "$raw" "$out/dmesg-error.tmp" "$out/journal-error.tmp"
}

capture_data_state() {
  local name="$1"
  local phase="$2"
  local statefile
  stage="filesystem-$phase"
  statefile="$(evidence_path "$phase")"
  : > "$statefile"
  if ! inner run --rm --volumes-from "$name" --entrypoint sh "$image" -c '
    for path in /mosquitto/data /mosquitto/data/mosquitto.db /mosquitto/data/mosquitto.db.new; do
      if [ -e "$path" ]; then
        if command -v stat >/dev/null 2>&1; then
          stat -c "PATH=%n OWNER=%u:%g MODE=%a TYPE=%F SIZE=%s" "$path" || echo "STAT_FAILED PATH=$path"
        else
          ls -ldn "$path" || echo "LS_FAILED PATH=$path"
        fi
        if [ -f "$path" ] && command -v sha256sum >/dev/null 2>&1; then
          sha256sum "$path" || echo "SHA256_FAILED PATH=$path"
        fi
      else
        echo "PATH=$path STATE=ABSENT"
      fi
    done
    grep " /mosquitto/data " /proc/mounts || echo DATA_MOUNT=NOT_FOUND
  ' > "$statefile" 2>&1; then
    echo "FILESYSTEM_CAPTURE=FAILED STAGE=$stage"
    cat "$statefile"
    mark_failure "FILESYSTEM_CAPTURE_$stage_FAILED"
  else
    echo "FILESYSTEM_CAPTURE=PASS STAGE=$stage"
    cat "$statefile"
  fi
}

probe() {
  local name="$1" marker="$2" running="false" stop_rc="NOT_RUN" state_exit="UNKNOWN"
  local inspectfile="$out/$name-inspect.log" logfile="$out/$name.log"
  stage="container-create"
  if ! inner create --name "$name" "$image" > "$out/$name-create.log" 2>&1; then
    cat "$out/$name-create.log"
    mark_failure "CONTAINER_CREATE_$name_FAILED"
    audit "$marker" "$out/$name-audit.log" || true
    return
  fi
  echo "CONTAINER_MOUNTS_$name=$(inner inspect "$name" -f '{{json .Mounts}}' 2>&1)" | tee "$out/$name-mounts.log"
  capture_data_state "$name" before-start

  stage="mosquitto-start"
  if inner start "$name" > "$out/$name-start.log" 2>&1; then echo "CONTAINER_START_$name=PASS"; else cat "$out/$name-start.log"; mark_failure "CONTAINER_START_$name"; fi
  sleep 3
  running="$(inner inspect "$name" -f '{{.State.Running}}' 2>/dev/null || echo unknown)"
  if test "$running" = true; then
    if inner exec "$name" mosquitto_pub -h 127.0.0.1 -p 1883 -q 1 \
      -t recovery/persistence-gate -m ready > "$out/$name-ready.log" 2>&1; then
      echo "MOSQUITTO_BROKER_READY=$name PASS"
    else
      echo "MOSQUITTO_BROKER_READY=$name FAIL"
      cat "$out/$name-ready.log"
      mark_failure "BROKER_NOT_READY_$name"
    fi
  else
    echo "MOSQUITTO_BROKER_READY=$name FAIL"
    mark_failure "BROKER_NOT_RUNNING_$name"
  fi
  inner inspect "$name" -f 'USER={{.Config.User}} APPARMOR={{.AppArmorProfile}} STATE={{json .State}}' > "$inspectfile" 2>&1 || true
  cat "$inspectfile"
  stage="persistence-shutdown"
  if test "$running" = true; then
    if inner stop -t 10 "$name" > "$out/$name-stop.log" 2>&1; then stop_rc=0; else stop_rc=$?; mark_failure "DOCKER_STOP_$name_EXIT_$stop_rc"; fi
  else
    echo "CONTAINER_ALREADY_STOPPED=$name"
  fi
  inner inspect "$name" -f 'FINAL_STATE={{json .State}}' >> "$inspectfile" 2>&1 || true
  state_exit="$(inner inspect "$name" -f '{{.State.ExitCode}}' 2>/dev/null || echo unknown)"
  echo "CONTROLLED_SHUTDOWN=$name DOCKER_STOP_EXIT=$stop_rc CONTAINER_EXIT=$state_exit"
  inner logs "$name" > "$logfile" 2>&1 || echo "CONTAINER_LOG_CAPTURE_FAILED=$name" >> "$logfile"
  cat "$logfile"
  # Always capture the audit immediately after shutdown, before file checks.
  audit "$marker" "$out/$name-audit.log" || true
  capture_data_state "$name" after-shutdown
}

trace_persistence() {
  local marker="$1" running="false" stop_rc="NOT_RUN" trace_name=mosquitto-persistence-strace
  stage="strace-analysis"
  if ! inner run --rm --entrypoint sh "$image" -c 'command -v strace >/dev/null 2>&1'; then
    echo STRACE_RESULT=UNAVAILABLE_IN_EXACT_IMAGE
    return 0
  fi
  echo STRACE_RESULT=AVAILABLE
  if ! inner run -d --name "$trace_name" --volumes-from after --entrypoint strace "$image" \
    -f -ttt -s 256 \
    -e trace=open,openat,creat,mknod,rename,renameat,renameat2,unlink,unlinkat,link,linkat,fsync,fdatasync,fchmod,fchown \
    -o /dev/stderr /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf \
    > "$out/strace-start.log" 2>&1; then
    cat "$out/strace-start.log"
    mark_failure STRACE_CONTAINER_START_FAILED
    audit "$marker" "$out/strace-audit.log" || true
    return 1
  fi
  sleep 3
  running="$(inner inspect "$trace_name" -f '{{.State.Running}}' 2>/dev/null || echo unknown)"
  if test "$running" = true; then
    if inner stop -t 10 "$trace_name" > "$out/strace-stop.log" 2>&1; then stop_rc=0; else stop_rc=$?; mark_failure "STRACE_STOP_EXIT_$stop_rc"; fi
  fi
  inner inspect "$trace_name" -f 'STRACE_FINAL_STATE={{json .State}}' > "$out/strace-inspect.log" 2>&1 || true
  echo "STRACE_SHUTDOWN DOCKER_STOP_EXIT=$stop_rc CONTAINER_EXIT=$(inner inspect "$trace_name" -f '{{.State.ExitCode}}' 2>/dev/null || echo unknown)"
  inner logs "$trace_name" > "$out/strace.log" 2>&1 || echo STRACE_LOG_CAPTURE_FAILED >> "$out/strace.log"
  cat "$out/strace.log"
  audit "$marker" "$out/strace-audit.log" || true
  capture_data_state "$trace_name" after-strace
}

stage="negative-control"
before_marker="$(date -u '+%Y-%m-%d %H:%M:%S')"
probe before "$before_marker"
negative_ok=1
if ! grep -q 'Unable to open config file' "$out/before.log" 2>/dev/null; then
  echo EXPECTED_NEGATIVE_CONFIG_TEST_NOT_REPRODUCED
  negative_ok=0
fi
if ! grep -q 'name="/mosquitto/config/mosquitto.conf".*denied_mask="r"' "$out/before-audit.log" 2>/dev/null; then
  echo EXPECTED_NEGATIVE_CONFIG_AUDIT_NOT_FOUND
  negative_ok=0
fi
if test "$negative_ok" -eq 1; then
  failure=0
  echo APPARMOR_NEGATIVE_REGRESSION=PASS
else
  mark_failure APPARMOR_NEGATIVE_REGRESSION_FAILED
  echo APPARMOR_NEGATIVE_REGRESSION=FAIL
fi

stage="apparmor-bootstrap"
if ! node scripts/hostloss-apparmor.mjs apply; then mark_failure APPARMOR_LOCAL_OVERRIDE_APPLY_FAILED; fi
sleep 1
stage="persistence-positive-control"
after_marker="$(date -u '+%Y-%m-%d %H:%M:%S')"
probe after "$after_marker"

if test -s "$out/after-audit.log"; then
  echo MOSQUITTO_PERSISTENCE_AUDIT_DENIAL=YES
  cat "$out/after-audit.log"
  echo HOST_LOSS_RESULT=BLOCKED_BEFORE_DRILL
  exit 1
fi
if ! grep -q '^AUDIT_READ=PASS ' "$out/after-audit-status.log" 2>/dev/null; then
  echo MOSQUITTO_PERSISTENCE_AUDIT_DENIAL=UNKNOWN
  echo HOST_LOSS_RESULT=BLOCKED_BEFORE_DRILL
  exit 1
fi
echo MOSQUITTO_PERSISTENCE_AUDIT_DENIAL=NO
trace_marker="$(date -u '+%Y-%m-%d %H:%M:%S')"
trace_persistence "$trace_marker"
if test -s "$out/strace-audit.log"; then
  echo MOSQUITTO_STRACE_AUDIT_DENIAL=YES
  cat "$out/strace-audit.log"
  echo HOST_LOSS_RESULT=BLOCKED_BEFORE_DRILL
  exit 1
fi
if test -f "$out/strace-audit-status.log" && ! grep -q '^AUDIT_READ=PASS ' "$out/strace-audit-status.log"; then
  echo MOSQUITTO_STRACE_AUDIT_DENIAL=UNKNOWN
  echo HOST_LOSS_RESULT=BLOCKED_BEFORE_DRILL
  exit 1
fi
if grep -q 'Error saving in-memory database' "$out/after.log" 2>/dev/null; then
  echo MOSQUITTO_PERSISTENCE=FAIL
  echo HOST_LOSS_RESULT=BLOCKED_BEFORE_DRILL
  failure=1
fi
after_filesystem="$(evidence_path after-shutdown)"
if ! verify_persistence_filesystem "$after_filesystem"; then failure=1; fi
if grep -q 'Config loaded from /mosquitto/config/mosquitto.conf' "$out/after.log" 2>/dev/null; then
  echo MOSQUITTO_CONFIG_READ=PASS
else
  echo MOSQUITTO_CONFIG_READ=FAIL
  failure=1
fi
echo "MOSQUITTO_RUNTIME_DIAGNOSIS=$([ "$failure" -eq 0 ] && echo COMPLETED || echo COMPLETED_WITH_FAILURES)"
echo HOST_LOSS_RESULT=BLOCKED_BEFORE_DRILL
stage="complete"
exit "$failure"
