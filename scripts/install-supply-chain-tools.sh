#!/usr/bin/env bash
set -euo pipefail
# Linux x86_64 only. Fixed release archives, independently recorded SHA-256 pins.
destination="${RUNNER_TEMP:?}/meterwerk-tools"
mkdir -p "$destination"
install_tool() {
  local tool="$1" version="$2" checksum="$3"
  local archive="$destination/$tool.tar.gz"
  curl --fail --silent --show-error --location --retry 3 \
    "https://github.com/anchore/$tool/releases/download/v$version/${tool}_${version}_linux_amd64.tar.gz" -o "$archive"
  printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --strict
  tar -xzf "$archive" -C "$destination" "$tool"
  "$destination/$tool" version
}
install_tool syft 1.55.0 bb65249542db5fedeeb4d3f9b018b75e7264dbfbbb10486f044581a92f90490d
install_tool grype 0.121.0 64e07133d3486115de647a66581461dccf5c732748a0a3119077395565f15519
echo "$destination" >> "$GITHUB_PATH"
archive="$destination/gh.tar.gz"
curl --fail --silent --show-error --location --retry 3 \
  https://github.com/cli/cli/releases/download/v2.103.3/gh_2.103.3_linux_amd64.tar.gz -o "$archive"
printf '%s  %s\n' 4c806978ffce1cec70853302a56d70ac6da4f19bae7adca4e1a8ab00633dd91d "$archive" | sha256sum --check --strict
tar -xzf "$archive" -C "$destination" --strip-components=2 gh_2.103.3_linux_amd64/bin/gh
"$destination/gh" version
