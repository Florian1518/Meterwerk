import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const state = JSON.parse(
  readFileSync(
    new URL("../.local/phase3-processes.json", import.meta.url),
    "utf8",
  ),
);
const scripts = {
  edge: "apps/edge-gateway/src/cli.ts",
  simulator: "scripts/modbus-simulator.ts",
  worker: "src/server/mqtt-worker.ts",
};
const verified = [];
for (const [name, script] of Object.entries(scripts)) {
  const pid = state[name];
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw new Error("Invalid process ID");
  const output = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object Name,CommandLine | ConvertTo-Json -Compress`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (!output.trim()) continue;
  const processInfo = JSON.parse(output);
  if (
    processInfo.Name !== "node.exe" ||
    !processInfo.CommandLine.endsWith(script)
  )
    throw new Error(`Process identity mismatch: ${name}`);
  verified.push(pid);
}
for (const pid of verified) process.kill(pid);
console.log("Phase-3 processes stopped. Docker and Web remain running.");
