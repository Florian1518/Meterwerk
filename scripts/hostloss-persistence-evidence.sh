#!/usr/bin/env bash

evidence_path() {
  printf '%s/%s-filesystem.log' "$out" "$1"
}

verify_persistence_filesystem() {
  local evidence="$1" valid=1
  if [[ ! -f "$evidence" ]]; then
    echo "MOSQUITTO_PERSISTENCE_EVIDENCE=FAIL_MISSING_FILE PATH=$evidence"
    return 1
  fi

  if grep -Eq '^PATH=/mosquitto/data/mosquitto\.db OWNER=[0-9]+:[0-9]+ MODE=[0-7]+ TYPE=regular file SIZE=[0-9]+' "$evidence"; then
    echo MOSQUITTO_PERSISTENCE_DATABASE=PASS
  else
    echo MOSQUITTO_PERSISTENCE_DATABASE=FAIL_MISSING
    valid=0
  fi

  if grep -Fxq 'PATH=/mosquitto/data/mosquitto.db.new STATE=ABSENT' "$evidence"; then
    echo MOSQUITTO_PERSISTENCE_TEMPFILE_CLEANUP=PASS
  else
    echo MOSQUITTO_PERSISTENCE_TEMPFILE_CLEANUP=FAIL_PRESENT_OR_UNVERIFIED
    valid=0
  fi

  [[ "$valid" -eq 1 ]]
}
