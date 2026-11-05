#!/usr/bin/env bash
set -uo pipefail
# Diagnostic only. No backup, application, credentials, or external services.
out="$RUNNER_TEMP/mosquitto-diagnostic"
mkdir -p "$out" || exit 1
exec > >(tee "$out/evidence.log") 2>&1
host="mosquitto-diagnostic-${GITHUB_RUN_ID}"
trap 'docker rm -fv "$host" >/dev/null 2>&1 || true' EXIT
image=meterwerk-offsite-mosquitto:acceptance
step() {
  local label="$1" rc
  shift
  echo "BEGIN=$label"
  "$@"; rc=$?
  echo "STEP_STATUS=$label EXIT=$rc"
  return "$rc"
}
fatal() { echo "MOSQUITTO_RUNTIME_DIAGNOSIS=INCOMPLETE reason=$1"; exit 1; }
inner() { docker exec "$host" docker "$@"; }
source scripts/mosquitto-lsm-diagnose.sh
lsm_host
echo 'SOURCE_CANDIDATE=60352da8f3f27432b6a56a54180ee705c81d3f55'
for path in / "$GITHUB_WORKSPACE" "$GITHUB_WORKSPACE/infra" "$GITHUB_WORKSPACE/infra/mosquitto" "$GITHUB_WORKSPACE/infra/mosquitto/mosquitto.conf"; do
  step host_stat stat -c '%u:%g %a %F %s %n' "$path"
done
step host_namei namei -l "$GITHUB_WORKSPACE/infra/mosquitto/mosquitto.conf"
step source_hash sha256sum infra/mosquitto/mosquitto.conf
step build docker build --progress=plain -f Dockerfile.offsite-mosquitto -t "$image" . || fatal build
step source_image docker image inspect "$image" --format 'ID={{.Id}} DIGESTS={{json .RepoDigests}} USER={{json .Config.User}} ENTRYPOINT={{json .Config.Entrypoint}} CMD={{json .Config.Cmd}} VOLUMES={{json .Config.Volumes}}'
docker save "$image" > "$out/image.tar" || fatal save
step daemon_start docker run -d --privileged --name "$host" -e DOCKER_TLS_CERTDIR= docker:27-dind || fatal daemon_start
for attempt in $(seq 1 60); do
  if inner info >/dev/null 2>&1; then break; fi
  sleep 1
done
inner info >/dev/null || fatal daemon_unavailable
test -z "$(inner image ls -q)" && test -z "$(inner ps -aq)" || fatal target_not_empty
docker exec -i "$host" docker load < "$out/image.tar" > "$out/load.log" 2>&1
load_rc=$?
cat "$out/load.log"
echo "LOAD_EXIT=$load_rc"
test "$load_rc" -eq 0 || fatal load
grep -Fx "Loaded image: $image" "$out/load.log" || fatal intended_tag_not_loaded
inner image inspect "$image" > "$out/loaded-image.json" || fatal intended_image_unavailable
python3 scripts/mosquitto-image-identity.py "$out/image.tar" "$out/loaded-image.json" "$image"
identity_rc=$?
test "$identity_rc" -ne 2 || fatal wrong_image
# Pin subsequent diagnostics to the loaded daemon's immutable local ID.
image="$(inner image inspect "$image" -f '{{.Id}}')" || fatal loaded_id_unavailable
test -n "$image" || fatal empty_loaded_id
rm "$out/image.tar"
step loaded_image inner image inspect "$image" --format 'ID={{.Id}} DIGESTS={{json .RepoDigests}} USER={{json .Config.User}} ENTRYPOINT={{json .Config.Entrypoint}} CMD={{json .Config.Cmd}} VOLUMES={{json .Config.Volumes}}'
step nested_docker_version inner version
step nested_docker_info inner info --format 'VERSION={{.ServerVersion}} OS={{.OperatingSystem}} KERNEL={{.KernelVersion}} DRIVER={{.Driver}} SECURITY={{json .SecurityOptions}}'
step daemon_security docker inspect "$host" --format 'APPARMOR={{json .AppArmorProfile}} SECURITY_OPT={{json .HostConfig.SecurityOpt}} PRIVILEGED={{.HostConfig.Privileged}}'
step create inner create --name mqtt "$image"
create_rc=$?
step container_inspect inner inspect mqtt --format 'USER={{json .Config.User}} PATH={{json .Path}} ARGS={{json .Args}} ENTRYPOINT={{json .Config.Entrypoint}} CMD={{json .Config.Cmd}} WORKDIR={{json .Config.WorkingDir}} MOUNTS={{json .Mounts}} IMAGE={{.Image}}'
# Stopped-container metadata is supplementary, not a substitute for default-user tests.
if docker exec "$host" docker export mqtt > "$out/container.tar"; then
  python3 - "$out/container.tar" <<'PY'
import tarfile, sys, hashlib
with tarfile.open(sys.argv[1]) as archive:
    for path in ['mosquitto', 'mosquitto/config', 'mosquitto/config/mosquitto.conf']:
        try:
            item = archive.getmember(path)
            print('EXPORT', path, 'uid', item.uid, 'gid', item.gid, 'mode', oct(item.mode), 'size', item.size, 'type', item.type)
            if item.isfile():
                print('EXPORT_SHA256', hashlib.sha256(archive.extractfile(item).read()).hexdigest())
        except KeyError:
            print('EXPORT_MISSING', path)
PY
  echo "EXPORT_METADATA_EXIT=$?"
else
  echo EXPORT_METADATA_UNAVAILABLE
fi
rm -f "$out/container.tar"
probe='prefix=$1
id
echo SELF_SECURITY_CONTEXT; cat /proc/self/attr/current || true
echo PID1_SECURITY_CONTEXT; cat /proc/1/attr/current || true
echo IDENTITY_AND_CAPABILITIES; grep -E "^(Uid|Gid|Groups|Cap|NoNewPrivs|Seccomp)" /proc/self/status || true
printf "%s_UID=" "$prefix"; id -u
printf "%s_GID=" "$prefix"; id -g
printf "%s_GROUPS=" "$prefix"; id -G
for p in / /mosquitto /mosquitto/config /mosquitto/config/mosquitto.conf; do
  ls -ldn "$p"; stat -c "%u:%g %a %F %s %n" "$p" || busybox stat "$p"
done
check() { label=$1; shift; if "$@"; then echo "$prefix$label=PASS"; else rc=$?; echo "$prefix$label=FAIL exit=$rc"; fi; }
check _DIR_TRAVERSE test -x /mosquitto
check _CONFIG_DIR_TRAVERSE test -x /mosquitto/config
check _CONFIG_EXISTS test -f /mosquitto/config/mosquitto.conf
check _CONFIG_READABLE test -r /mosquitto/config/mosquitto.conf
readlink -f /mosquitto/config/mosquitto.conf || true
check _CONFIG_ACTUAL_READ sh -c "head -c 1 /mosquitto/config/mosquitto.conf >/dev/null"
check _CONFIG_CAT sh -c "cat /mosquitto/config/mosquitto.conf >/dev/null"
sha256sum /mosquitto/config/mosquitto.conf || true
if test -r /docker-entrypoint.sh; then echo ENTRYPOINT_SOURCE; cat /docker-entrypoint.sh; fi
echo "$prefix PROBE_COMPLETED"'
step default_user inner run --name shell-context --entrypoint sh "$image" -c "$probe" sh MOSQUITTO > "$out/default-user.log" 2>&1
default_rc=$?; cat "$out/default-user.log"
security_inspect shell-context
step root_comparison_only inner run --rm --user 0:0 --entrypoint sh "$image" -c "$probe" sh ROOT > "$out/root-user.log" 2>&1
root_rc=$?; cat "$out/root-user.log"
# Start the real binary directly: no shell, timeout binary, or entrypoint wrapper.
lsm_marker="$(date -u '+%Y-%m-%d %H:%M:%S')"
echo "MOSQUITTO_TEST_MARKER=$lsm_marker"
step direct_start inner run -d --name direct --entrypoint /usr/sbin/mosquitto "$image" -c /mosquitto/config/mosquitto.conf
direct_rc=$?
sleep 4
inner logs direct > "$out/direct.log" 2>&1; direct_logs_rc=$?; cat "$out/direct.log"
step direct_inspect inner inspect direct --format 'USER={{json .Config.User}} PATH={{json .Path}} ARGS={{json .Args}} MOUNTS={{json .Mounts}} STATE={{json .State}}'
direct_running="$(inner inspect direct -f '{{.State.Running}}')"
security_inspect direct
lsm_audit normal
if test "$direct_running" = true && grep -q 'mosquitto .* running' "$out/direct.log"; then
  echo NORMAL_RESULT=CONFIG_READ_OK
else
  echo NORMAL_RESULT=FAILED
fi
if test "$direct_running" = true; then step direct_stop inner stop -t 5 direct; fi
# A/B: identical immutable image, default identity, command, environment and
# exact same data/log volumes. Only AppArmor option differs. Diagnostic only.
step unconfined_start inner run -d --name unconfined --volumes-from direct --security-opt apparmor=unconfined --entrypoint /usr/sbin/mosquitto "$image" -c /mosquitto/config/mosquitto.conf
unconfined_rc=$?
sleep 4
inner logs unconfined > "$out/unconfined.log" 2>&1; cat "$out/unconfined.log"
security_inspect unconfined
step unconfined_state inner inspect unconfined --format 'STATE={{json .State}}'
unconfined_running="$(inner inspect unconfined -f '{{.State.Running}}')"
if test "$unconfined_running" = true && grep -q 'mosquitto .* running' "$out/unconfined.log"; then
  echo UNCONFINED_RESULT=CONFIG_READ_OK
  step unconfined_context inner exec unconfined sh -c 'id; cat /proc/1/attr/current; grep -E "^(Uid|Gid|Groups|Cap|NoNewPrivs|Seccomp)" /proc/1/status'
else
  echo "UNCONFINED_RESULT=FAILED start_exit=$unconfined_rc"
fi
lsm_audit unconfined
if test "$unconfined_running" = true; then step unconfined_stop inner stop -t 5 unconfined; fi
step original_entrypoint_start inner start mqtt
original_rc=$?
sleep 4
inner logs mqtt > "$out/original.log" 2>&1; original_logs_rc=$?; cat "$out/original.log"
step original_inspect inner inspect mqtt --format 'USER={{json .Config.User}} PATH={{json .Path}} ARGS={{json .Args}} MOUNTS={{json .Mounts}} STATE={{json .State}}'
original_running="$(inner inspect mqtt -f '{{.State.Running}}')"
if test "$original_running" = true; then
  step process_identity inner exec mqtt sh -c 'id; head -n 25 /proc/1/status'
  step original_stop inner stop -t 5 mqtt
fi
# Optional syscall trace in a separate disposable container after baseline tests.
# Root installs only the debugger; the traced broker keeps the default image user.
step trace_container inner run -d --name trace --entrypoint sh "$image" -c 'sleep 120'
if step install_debugger inner exec --user 0:0 trace sh -c 'command -v apk >/dev/null && apk add --no-cache strace'; then
  step trace_identity inner exec trace id
  security_inspect trace
  step pre_exec_context inner exec trace sh -c 'echo BEFORE_EXEC; cat /proc/self/attr/current; cat /proc/1/attr/current; grep -E "^(Uid|Gid|Groups|Cap|NoNewPrivs|Seccomp)" /proc/self/status'
  step syscall_trace inner exec trace sh -c 'timeout 5 strace -f -s 256 -e trace=%file,%creds,prctl,capset,chroot /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf -v'
else
  echo SUPPLEMENTARY_TRACE_UNAVAILABLE
fi
lsm_audit final
echo 'LSM_ROOT_CAUSE=UNKNOWN_PENDING_EVIDENCE_REVIEW; NO_HOST_LOSS_PASS'
# Conservative classification; unknowns never become a broker PASS.
classification=OTHER
if grep -q 'MOSQUITTO_DIR_TRAVERSE=FAIL\|MOSQUITTO_CONFIG_DIR_TRAVERSE=FAIL' "$out/default-user.log"; then
  classification=DIRECTORY_TRAVERSAL_DENIED
elif grep -q 'MOSQUITTO_CONFIG_EXISTS=FAIL' "$out/default-user.log" && grep -q 'ROOT_CONFIG_EXISTS=FAIL' "$out/root-user.log"; then
  classification=FILE_NOT_FOUND
elif grep -q 'MOSQUITTO_CONFIG_ACTUAL_READ=FAIL' "$out/default-user.log" && grep -q 'ROOT_CONFIG_ACTUAL_READ=PASS' "$out/root-user.log"; then
  classification=FILE_READ_DENIED
elif grep -q 'Error:.*Unknown configuration\|Error:.*Invalid\|Error found at' "$out/direct.log"; then
  classification=INVALID_CONFIG
elif grep -q 'MOSQUITTO_CONFIG_ACTUAL_READ=PASS' "$out/default-user.log" && test "$direct_running" = true && grep -q 'mosquitto .* running' "$out/direct.log"; then
  classification=CONFIG_READ_OK
fi
echo "MOSQUITTO_ERROR_CLASS=$classification"
if test "$classification" = CONFIG_READ_OK && test "$original_running" = true; then
  echo MOSQUITTO_RUNTIME_RESULT=PASSED
else
  echo MOSQUITTO_RUNTIME_RESULT=FAILED_OR_UNRESOLVED
fi
if test "$create_rc" -eq 0 && test "$default_rc" -eq 0 && test "$root_rc" -eq 0 && test "$direct_rc" -eq 0 && test "$original_rc" -eq 0 && test "$direct_logs_rc" -eq 0 && test "$original_logs_rc" -eq 0; then
  echo 'MOSQUITTO_RUNTIME_DIAGNOSIS=COMPLETED; NOT_HOST_LOSS_ACCEPTANCE'
  exit 0
fi
fatal evidence_incomplete
