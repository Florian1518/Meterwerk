import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { AccessError, tenantScope, type Actor } from "./policy";
import { requireTenantFeature, recordTenantUsage } from "./licensing";
import { exceedsReadingWindow, MAX_PAGE_SIZE } from "@/lib/performance";

export const publicApiScopes = [
  "properties:read",
  "buildings:read",
  "units:read",
  "meters:read",
  "readings:read",
  "alarms:read",
  "reports:read",
] as const;
export type PublicApiScope = (typeof publicApiScopes)[number];
export type PublicApiResource =
  | "properties"
  | "buildings"
  | "units"
  | "meters"
  | "readings"
  | "alarms"
  | "reports";
export const publicApiRateLimit = 120;

function requireKeyManager(actor: Actor) {
  if (actor.role !== "TENANT_ADMIN")
    throw new AccessError(
      403,
      "API-Keys dürfen nur Kundenadministratoren verwalten.",
    );
}

function requireKeyReader(actor: Actor) {
  if (actor.role !== "TENANT_ADMIN" && actor.role !== "SUPER_ADMIN")
    throw new AccessError(403, "Keine Berechtigung für API-Key-Diagnosen.");
}

const createKeySchema = z
  .object({
    tenantId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    scopes: z.array(z.enum(publicApiScopes)).min(1).max(publicApiScopes.length),
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine(
    (value) => !value.expiresAt || value.expiresAt.getTime() > Date.now(),
    "Das Ablaufdatum muss in der Zukunft liegen.",
  );

export async function createPublicApiKey(actor: Actor, raw: unknown) {
  requireKeyManager(actor);
  const value = createKeySchema.parse(raw);
  const tenantId = tenantScope(actor, value.tenantId);
  await requireTenantFeature(tenantId, "API");
  const token = `mwk_pub_${randomBytes(32).toString("base64url")}`;
  const keyHash = createHash("sha256").update(token).digest("hex");
  const key = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
    if (
      !(await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      }))
    )
      throw new AccessError(404, "Mandant nicht gefunden.");
    const created = await tx.publicApiKey.create({
      data: {
        tenantId,
        name: value.name,
        description: value.description ?? null,
        keyHash,
        scopes: [...new Set(value.scopes)],
        expiresAt: value.expiresAt ?? null,
        createdById: actor.id,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        description: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "public_api_key.created",
        entityId: created.id,
      },
    });
    return created;
  });
  // The bearer secret is returned here only. All future reads return metadata without keyHash.
  return { ...key, token };
}

export async function listPublicApiKeys(
  actor: Actor,
  requested?: string | null,
) {
  requireKeyReader(actor);
  const tenantId = tenantScope(actor, requested);
  return db.publicApiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      scopes: true,
      expiresAt: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
}

export async function revokePublicApiKey(
  actor: Actor,
  id: string,
  requested?: string | null,
) {
  requireKeyManager(actor);
  const tenantId = tenantScope(actor, requested);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
    const result = await tx.publicApiKey.updateMany({
      where: { id, tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new AccessError(404, "API-Key nicht gefunden.");
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "public_api_key.revoked",
        entityId: id,
      },
    });
    return { id, revoked: true };
  });
}

export type PublicApiCredential = {
  id: string;
  tenantId: string;
  scopes: PublicApiScope[];
};
export class PublicApiRateLimitError extends AccessError {
  constructor(public retryAfterSeconds: number) {
    super(
      429,
      "API-Rate-Limit erreicht. Bitte nach Ablauf des Zeitfensters erneut versuchen.",
    );
  }
}

export async function consumePublicApiRateLimit(
  keyId: string,
  tenantId: string,
  now = new Date(),
) {
  const resetAt = new Date(now.getTime() + 60_000);
  const [counter] = await db.$queryRaw<
    Array<{ attempts: number; resetAt: Date }>
  >`
    INSERT INTO "PublicApiRateLimit" ("keyId", "tenantId", "attempts", "resetAt")
    VALUES (${keyId}, ${tenantId}, 1, ${resetAt})
    ON CONFLICT ("keyId") DO UPDATE SET
      "attempts" = CASE WHEN "PublicApiRateLimit"."resetAt" <= ${now} THEN 1 ELSE "PublicApiRateLimit"."attempts" + 1 END,
      "resetAt" = CASE WHEN "PublicApiRateLimit"."resetAt" <= ${now} THEN ${resetAt} ELSE "PublicApiRateLimit"."resetAt" END
    RETURNING "attempts", "resetAt"`;
  if (counter.attempts > publicApiRateLimit)
    throw new PublicApiRateLimitError(
      Math.max(
        1,
        Math.ceil((counter.resetAt.getTime() - now.getTime()) / 1000),
      ),
    );
}

export async function authenticatePublicApiKey(
  authorization: string | null,
): Promise<PublicApiCredential> {
  if (!authorization?.startsWith("Bearer "))
    throw new AccessError(401, "API-Key fehlt oder ist ungültig.");
  const token = authorization.slice(7).trim();
  if (!token.startsWith("mwk_pub_") || token.length < 40)
    throw new AccessError(401, "API-Key fehlt oder ist ungültig.");
  const keyHash = createHash("sha256").update(token).digest("hex");
  const key = await db.publicApiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      tenantId: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date()))
    throw new AccessError(401, "API-Key fehlt oder ist ungültig.");
  await requireTenantFeature(key.tenantId, "API");
  const now = new Date();
  await consumePublicApiRateLimit(key.id, key.tenantId, now);
  await db.publicApiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: now },
  });
  await recordTenantUsage(key.tenantId, "API");
  return {
    id: key.id,
    tenantId: key.tenantId,
    scopes: key.scopes as PublicApiScope[],
  };
}

export function publicCorrelationId(header: string | null) {
  return header && /^[A-Za-z0-9._:-]{8,128}$/.test(header)
    ? header
    : randomUUID();
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
  cursor: z.string().min(1).max(160).optional(),
  tenantId: z.string().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export async function readPublicResource(
  credential: PublicApiCredential,
  resourceInput: unknown,
  rawQuery: unknown,
) {
  const resource = z
    .enum([
      "properties",
      "buildings",
      "units",
      "meters",
      "readings",
      "alarms",
      "reports",
    ])
    .parse(resourceInput) as PublicApiResource;
  const query = listQuerySchema.parse(rawQuery);
  if (query.tenantId && query.tenantId !== credential.tenantId)
    throw new AccessError(
      403,
      "API-Key darf nur auf den zugehörigen Mandanten zugreifen.",
    );
  if (!credential.scopes.includes(`${resource}:read` as PublicApiScope))
    throw new AccessError(403, `Dem API-Key fehlt der Scope ${resource}:read.`);
  const from = query.from ? new Date(query.from) : undefined;
  const to = query.to ? new Date(query.to) : undefined;
  if (from && to && from >= to)
    throw new AccessError(400, "Der Zeitfilter 'from' muss vor 'to' liegen.");
  if (resource === "readings" && from && to && exceedsReadingWindow(from, to))
    throw new AccessError(
      413,
      "Das Reading-Zeitfenster ist auf 366 Tage begrenzt; bitte in Abschnitte teilen.",
    );
  const tenantId = credential.tenantId;
  if (resource === "reports") await requireTenantFeature(tenantId, "REPORTING");
  const cursor = query.cursor ? { id: { gt: query.cursor } } : {};
  const dates =
    from || to
      ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) }
      : undefined;
  const take = query.limit + 1;
  const base = { tenantId, ...cursor };
  const rows =
    resource === "properties"
      ? await db.property.findMany({
          where: base,
          take,
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            createdAt: true,
          },
        })
      : resource === "buildings"
        ? await db.building.findMany({
            where: base,
            take,
            orderBy: { id: "asc" },
            select: { id: true, propertyId: true, name: true },
          })
        : resource === "units"
          ? await db.unit.findMany({
              where: base,
              take,
              orderBy: { id: "asc" },
              select: {
                id: true,
                buildingId: true,
                name: true,
                floor: true,
                area: true,
              },
            })
          : resource === "meters"
            ? await db.meter.findMany({
                where: base,
                take,
                orderBy: { id: "asc" },
                select: {
                  id: true,
                  unitId: true,
                  serialNumber: true,
                  type: true,
                  manufacturer: true,
                  model: true,
                  measurementUnit: true,
                  location: true,
                  status: true,
                  installedAt: true,
                  lastContact: true,
                },
              })
            : resource === "readings"
              ? await db.reading.findMany({
                  where: { ...base, ...(dates ? { timestamp: dates } : {}) },
                  take,
                  orderBy: { id: "asc" },
                  select: {
                    id: true,
                    meterId: true,
                    timestamp: true,
                    registerValue: true,
                    consumption: true,
                    measurementUnit: true,
                    source: true,
                    quality: true,
                    measurements: {
                      select: {
                        metric: true,
                        value: true,
                        unit: true,
                        quality: true,
                      },
                    },
                  },
                })
              : resource === "alarms"
                ? await db.alarm.findMany({
                    where: { ...base, ...(dates ? { createdAt: dates } : {}) },
                    take,
                    orderBy: { id: "asc" },
                    select: {
                      id: true,
                      meterId: true,
                      title: true,
                      severity: true,
                      status: true,
                      createdAt: true,
                      acknowledgedAt: true,
                      resolvedAt: true,
                    },
                  })
                : await db.report.findMany({
                    where: { ...base, ...(dates ? { createdAt: dates } : {}) },
                    take,
                    orderBy: { id: "asc" },
                    select: {
                      id: true,
                      type: true,
                      title: true,
                      periodFrom: true,
                      periodTo: true,
                      status: true,
                      content: true,
                      createdAt: true,
                    },
                  });
  const hasMore = rows.length > query.limit;
  const data = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    data,
    pagination: {
      limit: query.limit,
      nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null,
    },
  };
}
