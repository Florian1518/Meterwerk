import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import { propertyScope, tenantScope, type Actor, AccessError } from "./policy";
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
      where: { id: entityId, tenantId },
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
    .enum(["PROPERTY", "METER", "GATEWAY", "ALARM"])
    .parse(form.get("targetType"));
  const entityId = z.string().min(1).parse(form.get("entityId"));
  const file = form.get("file");
  if (!(file instanceof File) || !allowed.has(file.type))
    throw new AccessError(415, "Dateityp nicht erlaubt.");
  if (file.size > maxBytes) throw new AccessError(413, "Datei ist zu groß.");
  if (!(await targetWhere(actor, tenantId, targetType, entityId)))
    throw new AccessError(404, "Ziel nicht gefunden.");
  const key = `${tenantId}/${randomUUID()}`;
  const root = process.env.ATTACHMENT_LOCAL_ROOT ?? ".local/attachments";
  if (
    process.env.METERWERK_ENV === "production" &&
    process.env.ATTACHMENT_STORAGE !== "s3"
  )
    throw new AccessError(
      503,
      "Produktiver Object Storage ist nicht konfiguriert.",
    );
  await mkdir(/* turbopackIgnore: true */ join(root, tenantId), {
    recursive: true,
  });
  await writeFile(
    /* turbopackIgnore: true */ join(root, key.split("/").pop()!),
    Buffer.from(await file.arrayBuffer()),
    { flag: "wx", mode: 0o600 },
  );
  const attachment = await db.attachment.create({
    data: {
      tenantId,
      uploadedById: actor.id,
      targetType,
      entityId,
      fileName: file.name.replace(/[\\/\0]/g, "_").slice(0, 160),
      contentType: file.type,
      storageKey: key,
      sizeBytes: file.size,
    },
  });
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: "attachment.created",
      entityId: attachment.id,
    },
  });
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    sizeBytes: attachment.sizeBytes,
  };
}
export async function readAttachment(id: string, requested?: string | null) {
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
  const root = process.env.ATTACHMENT_LOCAL_ROOT ?? ".local/attachments";
  const data = await readFile(
    /* turbopackIgnore: true */ join(root, attachment.storageKey),
  );
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
