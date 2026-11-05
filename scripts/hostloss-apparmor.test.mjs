import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addition,
  databaseRule,
  localInclude,
  persistenceRule,
  rule,
} from "./hostloss-apparmor.mjs";

test("uses the actual unique local include and refuses absent or unsafe includes", () => {
  const header = "profile mosquitto /usr/sbin/mosquitto {\n";
  assert.equal(
    localInclude(header + " include if exists <local/mosquitto>\n}"),
    "/etc/apparmor.d/local/mosquitto",
  );
  assert.equal(
    localInclude(header + " #include <local/custom-mqtt>\n}"),
    "/etc/apparmor.d/local/custom-mqtt",
  );
  assert.throws(() => localInclude(header + "}"));
  assert.throws(() => localInclude(header + "include <local/../other>\n}"));
  assert.throws(() =>
    localInclude(header + "include <local/a>\ninclude <local/b>\n}"),
  );
});

test("only adds the three exact least-privilege rules and preserves content", () => {
  const original = "# existing operator rules\n/etc/mosquitto/custom.conf r,\n";
  const exact = `${rule}\n${persistenceRule}\n${databaseRule}`;
  assert.equal(original + addition(original), original + `\n${exact}\n`);
  assert.equal(addition(""), `\n${exact}\n`);
  assert.throws(() => addition(databaseRule));
  assert.doesNotMatch(
    addition(original),
    /\/mosquitto\/data\/\*\*|\/mosquitto\/\*\*|\/\*\s+rw|complain|unconfined/,
  );
});

test("bootstrap reloads and checks enforce, with no bypass or package-profile write", () => {
  const code = readFileSync(
    new URL("./hostloss-apparmor.mjs", import.meta.url),
    "utf8",
  );
  assert.match(code, /sudo\("apparmor_parser", "-r", profile\)/);
  assert.match(code, /mosquitto \(enforce\)/);
  assert.match(code, /APPARMOR_PACKAGE_PROFILE_CHANGED/);
  assert.doesNotMatch(
    code,
    /aa-disable|aa-complain|apparmor=unconfined|chmod.*777/,
  );
});

test("persistence evidence is checked through the nested Docker host", () => {
  const code = readFileSync(
    new URL("./hostloss-apparmor-regression.sh", import.meta.url),
    "utf8",
  );
  assert.match(code, /--volumes-from "\$name" --entrypoint sh/);
  assert.match(code, /PATH=%n OWNER=%u:%g MODE=%a TYPE=%F SIZE=%s/);
  assert.match(code, /PATH=\$path STATE=ABSENT/);
  assert.match(code, /mosquitto_pub -h 127\.0\.0\.1 -p 1883/);
  assert.match(code, /MOSQUITTO_PERSISTENCE_DATABASE=PASS/);
  assert.match(code, /MOSQUITTO_PERSISTENCE_TEMPFILE_CLEANUP=PASS/);
  assert.doesNotMatch(code, /inner cp/);
});

test("missing persistence files and failed shutdown cannot skip audit evidence", () => {
  const code = readFileSync(
    new URL("./hostloss-apparmor-regression.sh", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(code, /^set -e/m);
  assert.match(code, /PATH=\$path STATE=ABSENT/);
  assert.match(code, /CONTROLLED_SHUTDOWN=.*CONTAINER_EXIT=/);
  assert.match(code, /audit "\$marker" "\$out\/\$name-audit\.log" \|\| true/);
  assert.match(code, /capture_data_state "\$name" after-shutdown/);
  assert.match(code, /audit "\$marker"/);
  assert.match(code, /AUDIT_READ=PASS SOURCE=/);
  assert.match(code, /MOSQUITTO_PERSISTENCE_AUDIT_DENIAL=UNKNOWN/);
});

test("stage is initialized before traps and remains diagnostic through cleanup", () => {
  const code = readFileSync(
    new URL("./hostloss-apparmor-regression.sh", import.meta.url),
    "utf8",
  );
  assert.ok(code.indexOf('stage="initialization"') < code.indexOf("trap 'on_error"));
  assert.match(code, /trap 'on_error "\$\?" "\$LINENO"' ERR/);
  assert.match(code, /trap cleanup EXIT/);
  assert.match(code, /HARNESS_UNEXPECTED_ERROR stage=\$error_stage/);
  assert.match(code, /HARNESS_EXIT_STAGE=\$exit_stage EXIT_CODE=\$exit_code CLEANUP_STAGE=\$stage/);
  assert.match(code, /stage="filesystem-\$phase"/);
  assert.doesNotMatch(code, /local name="\$1" stage="\$2" statefile=.*\$stage/);
  assert.ok(code.indexOf('exec > >(tee "$out/regression.log")') < code.indexOf('stage="mosquitto-start"'));
});

test("host loss runs only after the persistence gate succeeds in the same run", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/host-loss-recovery.yml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(workflow, /run_host_loss:/);
  assert.match(
    workflow,
    /name: Reproduce, allow and verify Mosquitto persistence\n\s+run: bash scripts\/hostloss-apparmor-regression\.sh[\s\S]*?name: Run complete host-loss drill in an empty isolated Docker daemon\n\s+if: \$\{\{ success\(\) \}\}/,
  );
  assert.doesNotMatch(workflow, /github\.event_name == 'workflow_dispatch' && inputs\.run_host_loss/);
});
