import "server-only";
import type { Prisma } from "../generated/prisma/client";

// Evidence is read from authenticated gateway results and validated ingestion,
// never from client-supplied status/step fields. Revision identifies the entire
// saved connection and profile snapshot, including the gateway assignment.
export async function commissioningEvidence(
  tx: Prisma.TransactionClient,
  tenantId: string,
  deviceId: string,
  unitId: string,
) {
  const device = await tx.device.findFirst({
    where: { id: deviceId, tenantId },
    include: { modbusConfig: true, diagnostic: true, gateway: true },
  });
  const config = device?.modbusConfig;
  const scope = {
    tenantId,
    deviceId,
    gatewayId: device?.gatewayId ?? "",
    revision: config?.revision ?? 0,
  };
  const [test, read, sample, pendingCount] = await Promise.all([
    tx.gatewayCommand.findFirst({
      where: { ...scope, action: "TEST" },
      orderBy: { createdAt: "desc" },
    }),
    tx.gatewayCommand.findFirst({
      where: { ...scope, action: "READ" },
      orderBy: { createdAt: "desc" },
    }),
    tx.telemetrySample.findFirst({
      where: {
        tenantId,
        deviceId,
        revision: scope.revision,
        error: null,
        measurements: { some: {} },
      },
      orderBy: { timestamp: "desc" },
      select: { id: true, timestamp: true },
    }),
    tx.gatewayCommand.count({
      where: {
        ...scope,
        action: { in: ["TEST", "READ"] },
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    }),
  ]);
  const pending =
    pendingCount > 0 ||
    [test, read].some(
      (c) => c?.status === "PENDING" && c.expiresAt > new Date(),
    );
  const connectionVerified = !!(
    config &&
    device?.gateway &&
    device.gateway.status !== "DISABLED" &&
    test?.status === "SUCCEEDED" &&
    !test.error &&
    test.completedAt &&
    test.completedAt <= test.expiresAt
  );
  const diagnostic = device?.diagnostic;
  const readVerified = !!(
    connectionVerified &&
    !pending &&
    (!read ||
      (read.status === "SUCCEEDED" &&
        !read.error &&
        read.completedAt &&
        read.completedAt <= read.expiresAt)) &&
    diagnostic?.revision === config?.revision &&
    diagnostic &&
    diagnostic.successes >= 1 &&
    diagnostic.lastSuccessAt &&
    diagnostic.responseMs !== null &&
    !diagnostic.lastError &&
    sample &&
    sample.timestamp >= test!.createdAt &&
    Date.now() - diagnostic.lastSuccessAt.getTime() <= 300000
  );
  const reviewed = !!(
    readVerified &&
    config?.reviewedRevision === config?.revision &&
    config?.reviewedAt &&
    config.reviewedBy
  );
  const assigned = !!(
    reviewed &&
    config?.confirmedUnitId === unitId &&
    config?.assignedAt &&
    config.assignedBy
  );
  const enabled = !!(
    config &&
    config.state !== "DISABLED" &&
    device?.gateway &&
    device.gateway.status !== "DISABLED"
  );
  const reason = !enabled
    ? "Zuerst eine gültige Gateway-Konfiguration speichern."
    : pending
      ? "Aktion wurde noch nicht vom Gateway ausgeführt. Die Inbetriebnahme kann erst nach einer erfolgreichen technischen Bestätigung fortgesetzt werden."
      : !connectionVerified
        ? "Schritt 6: Erfolgreicher Verbindungstest der aktuellen Konfiguration erforderlich."
        : !readVerified
          ? "Schritt 7: Erfolgreicher aktueller Read mit gültigen Messwerten erforderlich."
          : !reviewed
            ? "Schritt 7: Messwerte prüfen und bestätigen."
            : !assigned
              ? "Schritt 8: Nutzungseinheit bestätigen."
              : null;
  return {
    stage: !config
      ? "DRAFT"
      : !connectionVerified
        ? "CONFIGURED"
        : !readVerified
          ? "CONNECTION_VERIFIED"
          : !assigned
            ? "READ_VERIFIED"
            : config.completedAt
              ? "COMMISSIONED"
              : "ASSIGNMENT_CONFIRMED",
    connectionVerified,
    readVerified,
    reviewed,
    assigned,
    pending,
    canReview: enabled && readVerified,
    canAssign: enabled && reviewed,
    canComplete: enabled && assigned && !pending,
    reason,
    testCommandId: test?.id ?? null,
    connectionTestAt: test?.completedAt ?? null,
    connectionTestResult:
      test?.status === "PENDING" && test.expiresAt <= new Date()
        ? "EXPIRED"
        : (test?.status ?? null),
    sampleId: sample?.id ?? null,
    lastSuccessfulReadAt: diagnostic?.lastSuccessAt ?? null,
  };
}
