import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import { propertyScope, tenantScope, type Actor, AccessError } from "./policy";
import { mutate, workOrderScope } from "./field-service";
import { categories } from "@/lib/field-documentation";
import { attachmentError } from "@/lib/attachment-validation";
import { terminal } from "@/lib/field-service";
import { deleteObject, getObject, putObject } from "./storage";
import { downloadAllowed, scanUpload } from "./malware";
const allowed = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
  "text/plain",
]);
const maxBytes = 10 * 1024 * 1024;
function targetWhere(
  actor: Actor,
  tenantId: string,
  targetType: string,
  entityId: string,
) {
  if (targetType === "WORK_ORDER")
    return db.workOrder.findFirst({
      where: { ...workOrderScope(actor, tenantId), id: entityId },
      select: { id: true },
    });
  if (targetType === "PROPERTY")
    return db.property.findFirst({
      where: { id: entityId, ...propertyScope(actor, tenantId) },
      select: { id: true },
    });
  if (targetType === "METER")
    return db.meter.findFirst({
      where: {
        id: entityId,
        tenantId,
        unit: { building: { property: propertyScope(actor, tenantId) } },
      },
      select: { id: true },
    });
  if (targetType === "GATEWAY")
    return db.gateway.findFirst({
      where: {
        id: entityId,
        tenantId,
        ...(actor.role === "USER" ? { id: { in: [] } } : {}),
      },
      select: { id: true },
    });
  if (targetType === "ALARM")
    return db.alarm.findFirst({
      where: {
        id: entityId,
        tenantId,
        meter: {
          unit: { building: { property: propertyScope(actor, tenantId) } },
        },
      },
      select: { id: true },
    });
  throw new AccessError(400, "Ungültiger Attachment-Typ.");
}
export async function storeAttachment(
  form: FormData,
  requested?: string | null,
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const targetType = z
    .enum(["PROPERTY", "METER", "GATEWAY", "ALARM", "WORK_ORDER"])
    .parse(form.get("targetType"));
  const entityId = z.string().min(1).parse(form.get("entityId"));
  const file = form.get("file");
  const rejected = () =>
    db.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "security.upload.rejected",
        entityId: tenantId,
      },
    });
  if (!(file instanceof File) || !allowed.has(file.type)) {
    await rejected();
    throw new AccessError(415, "Dateityp nicht erlaubt.");
  }
  if (file.size > maxBytes) {
    await rejected();
    throw new AccessError(413, "Datei ist zu groß.");
  }
  if (actor.role === "SUPER_ADMIN")
    throw new AccessError(403, "Plattformdiagnose ist nur lesend.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const error = attachmentError(file.name, file.type, bytes);
  if (error) {
    await db.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "security.upload.rejected",
        entityId: tenantId,
      },
    });
    throw new AccessError(415, error);
  }
  const description = z
    .string()
    .max(2000)
    .parse(form.get("description") ?? "");
  const category = z.enum(categories).parse(form.get("category") ?? "OTHER");
  const requestId =
    targetType === "WORK_ORDER" ? z.uuid().parse(form.get("requestId")) : null;
  const contentHash = createHash("sha256")
    .update(bytes)
    .update(
      JSON.stringify({
        description,
        category,
        name: file.name,
        mime: file.type,
      }),
    )
    .digest("hex");
  if (!(await targetWhere(actor, tenantId, targetType, entityId)))
    throw new AccessError(404, "Ziel nicht gefunden.");
  const key = `${tenantId}/${randomUUID()}`;
  const scan = await scanUpload(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let storageProvider: "local" | "s3";
  try {
    storageProvider = await putObject(key, bytes, file.type);
  } catch {
    throw new AccessError(503, "Object Storage nicht verfügbar.");
  }
  try {
    const persist = async (
      tx: import("@/generated/prisma/client").Prisma.TransactionClient,
    ) => {
      const attachment = await tx.attachment.create({
        data: {
          tenantId,
          uploadedById: actor.id,
          targetType,
          entityId,
          fileName: file.name.replace(/[\\/\0]/g, "_").slice(0, 160),
          contentType: file.type,
          storageKey: key,
          sizeBytes: file.size,
          description,
          category,
          requestId,
          contentHash,
          storageProvider,
          sha256,
          scanStatus: scan.status,
          scanProvider: scan.provider,
          scannedAt: new Date(),
          workOrderId: targetType === "WORK_ORDER" ? entityId : null,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: actor.id,
          action:
            scan.status === "INFECTED"
              ? "security.malware.detected"
              : "security.upload.scan",
          entityId: attachment.id,
          details: { status: scan.status, provider: scan.provider },
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: actor.id,
          action:
            targetType === "WORK_ORDER"
              ? "work-order.attachment-created"
              : "attachment.created",
          entityId: targetType === "WORK_ORDER" ? entityId : attachment.id,
          details: {
            attachmentId: attachment.id,
            category,
            contentHash,
          },
        },
      });
      return {
        id: attachment.id,
        fileName: attachment.fileName,
        sizeBytes: attachment.sizeBytes,
      };
    };
    if (targetType === "WORK_ORDER")
      return await mutate(requested, entityId, async (tx, row) => {
        const prior = await tx.attachment.findFirst({
          where: { tenantId, workOrderId: entityId, requestId },
        });
        if (prior) {
          if (
            prior.contentHash !== contentHash ||
            prior.uploadedById !== actor.id
          )
            throw new AccessError(409, "Upload-ID bereits anders verwendet.");
          await deleteObject(key, storageProvider);
          return {
            id: prior.id,
            fileName: prior.fileName,
            sizeBytes: prior.sizeBytes,
          };
        }
        if (
          terminal(row.status) ||
          row.entries.some((e) => e.kind === "signature")
        )
          throw new AccessError(
            409,
            "Bestätigte Einsätze sind unveränderlich.",
          );
        return persist(tx);
      });
    return await db.$transaction(persist);
  } catch (error) {
    await deleteObject(key, storageProvider).catch(() => {});
    throw error;
  }
}
export async function authorizeAttachment(
  id: string,
  requested?: string | null,
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const attachment = await db.attachment.findFirst({ where: { id, tenantId } });
  if (!attachment) throw new AccessError(404, "Datei nicht gefunden.");
  if (
    !(await targetWhere(
      actor,
      tenantId,
      attachment.targetType,
      attachment.entityId,
    ))
  )
    throw new AccessError(404, "Datei nicht gefunden.");
  if (
    attachment.deletedAt ||
    (attachment.expiresAt && attachment.expiresAt < new Date())
  )
    throw new AccessError(404, "Datei nicht gefunden.");
  if (!downloadAllowed(attachment.scanStatus))
    throw new AccessError(423, "Datei ist zur Sicherheitsprüfung gesperrt.");
  if (!attachment.storageKey.startsWith(`${tenantId}/`))
    throw new AccessError(404, "Datei nicht gefunden.");
  return { actor, tenantId, attachment };
}
export async function readAttachment(id: string, requested?: string | null) {
  const { actor, tenantId, attachment } = await authorizeAttachment(
    id,
    requested,
  );
  const data = await getObject(
    attachment.storageKey,
    attachment.storageProvider,
  );
  if (
    !attachment.sha256 ||
    createHash("sha256").update(data).digest("hex") !== attachment.sha256 ||
    attachmentError(attachment.fileName, attachment.contentType, data)
  )
    throw new AccessError(423, "Datei ist zur Sicherheitsprüfung gesperrt.");
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: "attachment.read",
      entityId: attachment.id,
    },
  });
  return {
    data,
    contentType: attachment.contentType,
    fileName: attachment.fileName,
  };
}

export async function rescanAttachment(id: string, requested?: string | null) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  if (actor.role !== "TENANT_ADMIN")
    throw new AccessError(403, "Keine Scanberechtigung.");
  const row = await db.attachment.findFirst({
    where: {
      id: z.string().min(1).max(160).parse(id),
      tenantId,
      deletedAt: null,
    },
  });
  if (
    !row ||
    !row.storageKey.startsWith(`${tenantId}/`) ||
    (row.expiresAt && row.expiresAt <= new Date()) ||
    !(await targetWhere(actor, tenantId, row.targetType, row.entityId))
  )
    throw new AccessError(404, "Datei nicht gefunden.");
  // Revoke download access before performing any external scan.
  await db.$transaction(async (tx) => {
    await tx.attachment.update({
      where: { id_tenantId: { id, tenantId } },
      data: { scanStatus: "PENDING" },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: id,
        action: "security.upload.rescan",
      },
    });
  });
  let scan: import("./malware").ScanResult = {
    status: "FAILED",
    provider: "validation",
  };
  let sha256: string | undefined;
  try {
    const bytes = await getObject(row.storageKey, row.storageProvider);
    if (!attachmentError(row.fileName, row.contentType, bytes)) {
      sha256 = createHash("sha256").update(bytes).digest("hex");
      scan = await scanUpload(bytes);
    }
  } catch {
    /* Remain quarantined; never return scanner/storage exception text. */
  }
  await db.$transaction(async (tx) => {
    await tx.attachment.update({
      where: { id_tenantId: { id, tenantId } },
      data: {
        scanStatus: scan.status,
        scanProvider: scan.provider,
        scannedAt: new Date(),
        sha256,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: id,
        action:
          scan.status === "INFECTED"
            ? "security.malware.detected"
            : "security.upload.scan",
        details: { status: scan.status },
      },
    });
  });
  return { id, status: scan.status };
}
