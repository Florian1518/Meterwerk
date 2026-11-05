import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const rule = "/mosquitto/config/mosquitto.conf r,";
const profile = "/etc/apparmor.d/mosquitto";
const hash = (value) => createHash("sha256").update(value).digest("hex");

export function localInclude(source) {
  const matches = [
    ...source.matchAll(
      /^\s*#?include\s+(?:if\s+exists\s+)?<(?<path>local\/[A-Za-z0-9_.-]+)>\s*$/gm,
    ),
  ];
  if (
    matches.length !== 1 ||
    !/^\s*profile\s+mosquitto\s+\/usr\/sbin\/mosquitto\s*\{/m.test(source)
  ) {
    throw new Error("APPARMOR_LOCAL_INCLUDE_UNCONFIRMED");
  }
  const name = matches[0].groups.path;
  if (name.includes("..")) throw new Error("APPARMOR_LOCAL_INCLUDE_UNSAFE");
  return `/etc/apparmor.d/${name}`;
}

export function addition(existing) {
  if (existing.split(/\r?\n/).some((line) => line.trim() === rule)) {
    throw new Error("APPARMOR_RULE_ALREADY_PRESENT_BASELINE_NOT_REPRODUCIBLE");
  }
  return `\n${rule}\n`;
}

function sudo(...args) {
  const result = spawnSync("sudo", ["-n", ...args], { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`APPARMOR_COMMAND_FAILED:${args[0]}`);
  return result.stdout;
}

function enforce() {
  const profiles = sudo("cat", "/sys/kernel/security/apparmor/profiles");
  if (!profiles.split("\n").includes("mosquitto (enforce)")) {
    throw new Error("APPARMOR_PROFILE_NOT_ENFORCING");
  }
  console.log("APPARMOR_PROFILE_MODE=ENFORCE");
}

export function main(mode) {
  if (process.env.GITHUB_ACTIONS !== "true" || process.platform !== "linux") {
    throw new Error("EPHEMERAL_GITHUB_LINUX_RUNNER_REQUIRED");
  }
  const stateDir = resolve(process.env.RUNNER_TEMP, "meterwerk-apparmor-state");
  const stateFile = `${stateDir}/state.json`;
  if (mode === "cleanup") {
    if (!existsSync(stateFile)) {
      console.log("APPARMOR_CLEANUP=NOT_NEEDED");
      return;
    }
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    if (state.local !== localInclude(sudo("cat", profile)))
      throw new Error("APPARMOR_CLEANUP_INCLUDE_CHANGED");
    if (state.existed) {
      sudo("cp", "-a", `${stateDir}/original`, state.local);
      if (hash(sudo("cat", state.local)) !== state.hash)
        throw new Error("APPARMOR_RESTORE_HASH_MISMATCH");
    } else {
      sudo("rm", "--", state.local);
    }
    sudo("apparmor_parser", "-r", profile);
    enforce();
    console.log("APPARMOR_CLEANUP=PASS");
    return;
  }
  const source = sudo("cat", profile);
  const local = localInclude(source);
  console.log(`APPARMOR_LOCAL_INCLUDE=${local}`);
  console.log(`APPARMOR_PACKAGE_PROFILE_SHA256=${hash(source)}`);
  enforce();
  const exists = spawnSync("sudo", ["-n", "test", "-e", local]).status === 0;
  if (spawnSync("sudo", ["-n", "test", "-L", local]).status === 0)
    throw new Error("APPARMOR_LOCAL_SYMLINK_REJECTED");
  const existing = exists ? sudo("cat", local) : "";
  const append = addition(existing);
  if (mode === "check") {
    console.log("APPARMOR_BOOTSTRAP_PRECHECK=PASS");
    return;
  }
  if (mode !== "apply") throw new Error("APPARMOR_UNKNOWN_ACTION");
  if (existsSync(stateFile)) throw new Error("APPARMOR_STATE_ALREADY_EXISTS");
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  if (exists) {
    sudo("cp", "-a", local, `${stateDir}/original`);
    console.log(
      `APPARMOR_ORIGINAL_METADATA=${sudo("stat", "-c", "%u:%g %a %F", local).trim()}`,
    );
  }
  const state = { local, existed: exists, hash: hash(existing) };
  writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
  console.log(`APPARMOR_ORIGINAL_EXISTS=${exists} SHA256=${state.hash}`);
  sudo("mkdir", "-p", dirname(local));
  const write = spawnSync("sudo", ["-n", "tee", "-a", local], {
    input: append,
    encoding: "utf8",
  });
  if (write.status !== 0 || sudo("cat", local) !== existing + append)
    throw new Error("APPARMOR_APPEND_FAILED");
  console.log(`APPARMOR_ADDED_RULE=${rule}`);
  const expanded = sudo("apparmor_parser", "--preprocess", profile);
  if (!expanded.split("\n").some((line) => line.trim() === rule))
    throw new Error("APPARMOR_RULE_NOT_INCLUDED");
  sudo("apparmor_parser", "-r", profile);
  console.log("APPARMOR_RELOAD_EXIT=0");
  enforce();
  if (sudo("cat", profile) !== source)
    throw new Error("APPARMOR_PACKAGE_PROFILE_CHANGED");
  console.log("APPARMOR_LOCAL_OVERRIDE_LOADED=PASS");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
