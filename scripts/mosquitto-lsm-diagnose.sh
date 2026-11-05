#!/usr/bin/env bash
# Sourced by the diagnostic harness. All host security operations are read-only.
lsm_host() {
  step kernel uname -a
  step os_release cat /etc/os-release
  step docker_version docker version
  step docker_info docker info --format 'VERSION={{.ServerVersion}} OS={{.OperatingSystem}} KERNEL={{.KernelVersion}} DRIVER={{.Driver}} SECURITY={{json .SecurityOptions}}'
  step apparmor_enabled cat /sys/module/apparmor/parameters/enabled || echo DIAGNOSTIC_LIMITATION=apparmor_enabled_unavailable
  step apparmor_status sudo -n aa-status || echo DIAGNOSTIC_LIMITATION=aa_status_unavailable
  step active_lsms sudo -n cat /sys/kernel/security/lsm || echo DIAGNOSTIC_LIMITATION=lsm_list_unavailable
  step selinux_status getenforce || echo DIAGNOSTIC_LIMITATION=getenforce_unavailable
  if test -e /sys/fs/selinux/enforce; then
    step selinux_enforce cat /sys/fs/selinux/enforce
  else
    echo SELINUX_ENFORCE_FILE=ABSENT
  fi
  echo LOADED_MOSQUITTO_PROFILES
  sudo -n grep -i mosquitto /sys/kernel/security/apparmor/profiles || echo DIAGNOSTIC_NOTE=no_profile_match_or_profile_list_unavailable
  echo MOSQUITTO_PROFILE_FILES_READ_ONLY
  sudo -n grep -rlE '/usr/sbin/mosquitto|profile[[:space:]]+mosquitto' /etc/apparmor.d 2>/dev/null || echo DIAGNOSTIC_NOTE=no_profile_file_match_or_directory_unavailable
  # Read only the conventional Mosquitto profile, if present. No policy changes.
  for profile in /etc/apparmor.d/usr.sbin.mosquitto /etc/apparmor.d/mosquitto; do
    if sudo -n test -f "$profile"; then
      echo "PROFILE_FILE=$profile"
      step profile_contents sudo -n cat "$profile"
    fi
  done
}

security_inspect() {
  step "security_$1" inner inspect "$1" --format 'NAME={{.Name}} APPARMOR={{json .AppArmorProfile}} SECURITY_OPT={{json .HostConfig.SecurityOpt}} CAP_DROP={{json .HostConfig.CapDrop}} CAP_ADD={{json .HostConfig.CapAdd}} PRIVILEGED={{.HostConfig.Privileged}} USER={{json .Config.User}} IMAGE={{.Image}} ENTRYPOINT={{json .Config.Entrypoint}} CMD={{json .Config.Cmd}} ENV={{json .Config.Env}} MOUNTS={{json .Mounts}}'
}

lsm_audit() {
  local phase="$1" rc
  echo "AUDIT_WINDOW_START=$lsm_marker PHASE=$phase"
  sudo -n dmesg --since "$lsm_marker" > "$out/kernel-$phase.tmp" 2>&1
  rc=$?
  echo "DMESG_EXIT=$rc"
  if test "$rc" -eq 0; then
    grep -Ei 'apparmor="DENIED"|avc:.*denied|mosquitto|EACCES' "$out/kernel-$phase.tmp" || echo KERNEL_MATCHES=NONE_OBSERVED
  else
    echo DIAGNOSTIC_LIMITATION=dmesg_access_or_query_failed
  fi
  sudo -n journalctl -k --since "$lsm_marker" --no-pager -o short-iso > "$out/journal-$phase.tmp" 2>&1
  rc=$?
  echo "JOURNAL_KERNEL_EXIT=$rc"
  if test "$rc" -eq 0; then
    grep -Ei 'apparmor="DENIED"|avc:.*denied|mosquitto|EACCES' "$out/journal-$phase.tmp" || echo JOURNAL_MATCHES=NONE_OBSERVED
  else
    echo DIAGNOSTIC_LIMITATION=kernel_journal_access_or_query_failed
  fi
  # Raw host logs are never published; evidence contains only relevant matches.
  rm -f "$out/kernel-$phase.tmp" "$out/journal-$phase.tmp"
}
