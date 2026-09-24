const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
for (const path of [
  "/api/health/live",
  "/api/health/ready",
  "/api/system/build-info",
]) {
  const response = await fetch(base + path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  console.log(path, response.status);
}
