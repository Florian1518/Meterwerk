const base = process.env.RELEASE_GATE_URL;
if (!base) {
  console.log("RELEASE_GATE_URL fehlt: Remote-Gate wird in CI ausgeführt.");
  process.exit(0);
}
for (const path of ["/api/health/ready", "/api/system/build-info"]) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
}
console.log("Release health gates passed");
