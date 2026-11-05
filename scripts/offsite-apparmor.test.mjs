import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addition, localInclude, rule } from "./offsite-apparmor.mjs";

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

test("only adds the exact read rule and preserves all existing content", () => {
  const original = "# existing operator rules\n/etc/mosquitto/custom.conf r,\n";
  assert.equal(
    original + addition(original),
    original + "\n/mosquitto/config/mosquitto.conf r,\n",
  );
  assert.equal(addition(""), `\n${rule}\n`);
  assert.throws(() => addition(rule));
  assert.doesNotMatch(addition(original), /\*|\brw[k]?\b|complain|unconfined/);
});

test("bootstrap reloads and checks enforce, with no bypass or package-profile write", () => {
  const code = readFileSync(
    new URL("./offsite-apparmor.mjs", import.meta.url),
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
