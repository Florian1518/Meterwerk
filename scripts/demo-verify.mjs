import "dotenv/config";
const env = process.env.METERWERK_ENV ?? "";
if (!["demo", "test"].includes(env))
  throw new Error("demo:verify requires METERWERK_ENV=demo or test");
const { PrismaClient } =
  await import("../src/generated/prisma/client/index.js");
const { PrismaPg } = await import("@prisma/adapter-pg");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const checks = {
  tenants: await db.tenant.count({
    where: { id: { startsWith: "demo-tenant-" } },
  }),
  users: await db.user.count({ where: { email: { endsWith: ".demo" } } }),
  properties: await db.property.count({
    where: { id: { contains: "demo-tenant-" } },
  }),
  meters: await db.meter.count({ where: { id: { contains: "demo-tenant-" } } }),
  readings: await db.reading.count({ where: { source: "DEMO" } }),
  alarms: await db.alarm.count({ where: { id: { contains: "-alarm" } } }),
  devices: await db.device.count({ where: { id: { contains: "demo-" } } }),
  gateways: await db.gateway.count({ where: { id: { contains: "demo-" } } }),
  workOrders: await db.workOrder.count({
    where: { tenantId: { startsWith: "demo-tenant-" } },
  }),
  supportCases: await db.supportCase.count({
    where: { tenantId: { startsWith: "demo-tenant-" } },
  }),
  dashboards: await db.dashboard.count({
    where: { tenantId: { startsWith: "demo-tenant-" } },
  }),
  reports: await db.report.count({
    where: { tenantId: { startsWith: "demo-tenant-" } },
  }),
  rules: await db.rule.count({
    where: { tenantId: { startsWith: "demo-tenant-" } },
  }),
  anomalies: await db.analyticsAnomaly.count({
    where: { tenantId: { startsWith: "demo-tenant-" } },
  }),
};
await db.$disconnect();
if (
  checks.tenants < 1 ||
  checks.users < 3 ||
  checks.properties < 1 ||
  checks.meters < 4 ||
  checks.readings < 1 ||
  checks.alarms < 1 ||
  checks.devices < 1 ||
  checks.gateways < 1 ||
  checks.workOrders < 1 ||
  checks.supportCases < 1 ||
  checks.dashboards < 1 ||
  checks.reports < 1 ||
  checks.rules < 1 ||
  checks.anomalies < 1
)
  throw new Error(`Demo validation failed: ${JSON.stringify(checks)}`);
console.log(`Demo validation passed: ${JSON.stringify(checks)}`);
