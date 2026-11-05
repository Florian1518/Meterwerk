#!/usr/bin/env bash
set -euo pipefail
# Diagnostic only. No backup, application, credentials, or external services.
out="$RUNNER_TEMP/mosquitto-diagnostic"
mkdir -p "$out"
exec > >(tee "$out/evidence.log") 2>&1
host="mosquitto-diagnostic-${GITHUB_RUN_ID}"
trap 'docker rm -fv "$host" >/dev/null 2>&1 || true' EXIT
image=meterwerk-offsite-mosquitto:acceptance
echo 'SOURCE_CANDIDATE=60352da8f3f27432b6a56a54180ee705c81d3f55'
for path in / "$GITHUB_WORKSPACE" "$GITHUB_WORKSPACE/infra" "$GITHUB_WORKSPACE/infra/mosquitto" "$GITHUB_WORKSPACE/infra/mosquitto/mosquitto.conf"; do
  stat -c '%u:%g %a %F %s %n' "$path"
done
namei -l "$GITHUB_WORKSPACE/infra/mosquitto/mosquitto.conf" || true
sha256sum infra/mosquitto/mosquitto.conf
docker build --progress=plain -f Dockerfile.offsite-mosquitto -t "$image" .
docker image inspect "$image" --format 'ID={{.Id}} DIGESTS={{json .RepoDigests}} USER={{json .Config.User}} ENTRYPOINT={{json .Config.Entrypoint}} CMD={{json .Config.Cmd}} VOLUMES={{json .Config.Volumes}}'
docker save "$image" > "$out/image.tar"
docker run -d --privileged --name "$host" -e DOCKER_TLS_CERTDIR= docker:27-dind
inner() { docker exec "$host" docker "$@"; }
for attempt in $(seq 1 60); do
  if inner info >/dev/null 2>&1; then break; fi
  sleep 1
done
inner info >/dev/null
test -z "$(inner image ls -q)"
test -z "$(inner ps -aq)"
docker exec -i "$host" docker load < "$out/image.tar"
rm "$out/image.tar"
test "$(docker image inspect "$image" -f '{{.Id}}')" = "$(inner image inspect "$image" -f '{{.Id}}')"
inner network create recovery
inner create --name mqtt --network recovery "$image"
inner inspect mqtt --format 'USER={{json .Config.User}} PATH={{json .Path}} ARGS={{json .Args}} ENTRYPOINT={{json .Config.Entrypoint}} CMD={{json .Config.Cmd}} WORKDIR={{json .Config.WorkingDir}} MOUNTS={{json .Mounts}} IMAGE={{.Image}}'
# Export records stopped-container metadata; it does not substitute for user tests.
docker exec "$host" docker export mqtt > "$out/container.tar"
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
rm "$out/container.tar"
probe='id; printf "UID="; id -u; printf "GID="; id -g; printf "GROUPS="; id -G
for p in / /mosquitto /mosquitto/config /mosquitto/config/mosquitto.conf; do
  ls -ldn "$p"; stat -c "%u:%g %a %F %s %n" "$p" || busybox stat "$p"
done
check() { label=$1; shift; if "$@"; then echo "$label=PASS"; else rc=$?; echo "$label=FAIL exit=$rc"; fi; }
check MOSQUITTO_DIR_TRAVERSE test -x /mosquitto
check MOSQUITTO_CONFIG_DIR_TRAVERSE test -x /mosquitto/config
check MOSQUITTO_CONFIG_EXISTS test -f /mosquitto/config/mosquitto.conf
check MOSQUITTO_CONFIG_READ test -r /mosquitto/config/mosquitto.conf
readlink -f /mosquitto/config/mosquitto.conf || true
check MOSQUITTO_CONFIG_HEAD sh -c "head -c 1 /mosquitto/config/mosquitto.conf >/dev/null"
check MOSQUITTO_CONFIG_CAT sh -c "cat /mosquitto/config/mosquitto.conf >/dev/null"
sha256sum /mosquitto/config/mosquitto.conf || true
if test -r /docker-entrypoint.sh; then echo ENTRYPOINT_SOURCE; cat /docker-entrypoint.sh; fi
true'
echo DEFAULT_USER_EVIDENCE
inner run --rm --network recovery --entrypoint sh "$image" -c "$probe"
echo ROOT_COMPARISON_ONLY
inner run --rm --network recovery --user 0:0 --entrypoint sh "$image" -c "$probe"
echo DIRECT_MOSQUITTO_DEFAULT_USER
rc=0
inner run --name direct --network recovery --entrypoint sh "$image" -c 'timeout 5 /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf -v' || rc=$?
echo "DIRECT_EXIT=$rc"
inner inspect direct --format 'DIRECT_USER={{json .Config.User}} DIRECT_MOUNTS={{json .Mounts}} DIRECT_STATE={{json .State}}'
echo ACTUAL_DEFAULT_ENTRYPOINT_START
inner start mqtt
sleep 5
inner logs mqtt
inner inspect mqtt --format 'STATE={{json .State}} USER={{json .Config.User}} PATH={{json .Path}} ARGS={{json .Args}} MOUNTS={{json .Mounts}}'
if test "$(inner inspect mqtt -f '{{.State.Running}}')" = true; then
  inner exec mqtt sh -c 'id; cat /proc/1/status | head -n 25'
  inner stop -t 2 mqtt >/dev/null
fi
# Supplementary syscall evidence only, after the unmodified-image tests above.
# Install a debugger in a disposable container; never change config or permissions.
# Mosquitto and strace still run under the image default user, never root.
echo SUPPLEMENTARY_INSTRUMENTED_CONTAINER
inner run -d --name trace --network recovery --entrypoint sh "$image" -c 'sleep 120'
if inner exec --user 0:0 trace sh -c 'command -v apk >/dev/null && apk add --no-cache strace'; then
  inner exec trace id
  trace_rc=0
  inner exec trace sh -c 'timeout 5 strace -f -s 256 -e trace=%file,%creds,prctl /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf -v' || trace_rc=$?
  echo "SUPPLEMENTARY_TRACE_EXIT=$trace_rc"
else
  echo SUPPLEMENTARY_TRACE_UNAVAILABLE
fi
echo 'DIAGNOSTIC_CAPTURE_COMPLETE; NOT_HOST_LOSS_ACCEPTANCE'
