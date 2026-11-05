#!/usr/bin/env bash
set -euo pipefail
out="$RUNNER_TEMP/meterwerk-apparmor-evidence"
mkdir -p "$out"
exec > >(tee "$out/regression.log") 2>&1
host="meterwerk-apparmor-${GITHUB_RUN_ID}"
trap 'docker rm -fv "$host" >/dev/null 2>&1 || true' EXIT
inner() { docker exec "$host" docker "$@"; }
cat /etc/os-release
uname -a
test "$(cat /sys/module/apparmor/parameters/enabled)" = Y
echo APPARMOR_ACTIVE=YES
node scripts/offsite-apparmor.mjs check
docker build -f Dockerfile.offsite-mosquitto -t meterwerk-offsite-mosquitto:acceptance .
docker save meterwerk-offsite-mosquitto:acceptance > "$out/image.tar"
docker run -d --privileged --name "$host" -e DOCKER_TLS_CERTDIR= docker:27-dind >/dev/null
for attempt in $(seq 1 60); do
  if inner info >/dev/null 2>&1; then break; fi
  sleep 1
done
inner info >/dev/null
docker exec -i "$host" docker load < "$out/image.tar"
rm "$out/image.tar"
image="$(inner image inspect meterwerk-offsite-mosquitto:acceptance -f '{{.Id}}')"
inner image inspect "$image" -f 'IMAGE={{.Id}} USER={{.Config.User}} ENTRYPOINT={{json .Config.Entrypoint}} CMD={{json .Config.Cmd}}'
test "$(inner run --rm --entrypoint id "$image" -u)" = 1883
test "$(inner run --rm --entrypoint id "$image" -g)" = 1883
audit() {
  local marker="$1" target="$2"
  # Kernel-log access is required to prove absence/presence of this denial.
  sudo -n dmesg --since "$marker" > "$out/kernel.tmp"
  grep 'apparmor="DENIED"' "$out/kernel.tmp" | grep 'profile="mosquitto"' > "$target" || true
  rm "$out/kernel.tmp"
  cat "$target"
}
probe() {
  local name="$1"
  inner run -d --name "$name" "$image" >/dev/null
  sleep 3
  inner logs "$name" > "$out/$name.log" 2>&1
  inner inspect "$name" -f 'USER={{.Config.User}} APPARMOR={{.AppArmorProfile}} STATE={{json .State}}'
  if test "$(inner inspect "$name" -f '{{.State.Running}}')" = true; then
    inner stop -t 5 "$name" >/dev/null
    inner logs "$name" > "$out/$name.log" 2>&1
  fi
  cat "$out/$name.log"
}
before="$(date -u '+%Y-%m-%d %H:%M:%S')"
probe before
audit "$before" "$out/before-audit.log"
grep -q 'Unable to open config file' "$out/before.log"
grep 'name="/mosquitto/config/mosquitto.conf"' "$out/before-audit.log" | grep -q 'denied_mask="r"'
echo APPARMOR_NEGATIVE_REGRESSION=PASS
node scripts/offsite-apparmor.mjs apply
sleep 1
after="$(date -u '+%Y-%m-%d %H:%M:%S')"
probe after
audit "$after" "$out/after-audit.log"
if grep -q 'name="/mosquitto/config/mosquitto.conf"' "$out/after-audit.log" || grep -q 'Unable to open config file' "$out/after.log"; then
  echo MOSQUITTO_CONFIG_APPARMOR_FIX=FAIL
  exit 1
fi
if ! grep -q 'Config loaded from /mosquitto/config/mosquitto.conf' "$out/after.log"; then
  echo MOSQUITTO_CONFIG_APPARMOR_FIX=UNPROVEN
  exit 1
fi
echo MOSQUITTO_CONFIG_APPARMOR_FIX=PASS
if test -s "$out/after-audit.log"; then
  echo NEW_APPARMOR_DENIAL=YES
  echo HOST_LOSS_RESULT=BLOCKED_BEFORE_DRILL
  exit 1
fi
echo NEW_APPARMOR_DENIAL=NO
grep -q 'mosquitto .* running' "$out/after.log"
echo APPARMOR_POSITIVE_REGRESSION=PASS
