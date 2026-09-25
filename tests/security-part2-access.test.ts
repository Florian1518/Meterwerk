import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mock = vi.hoisted(() => ({
  actor: {
    id: "admin",
    tenantId: "tenant-a",
    role: "TENANT_ADMIN",
    name: "Test",
    email: "test@example.invalid",
  },
  db: {
    attachment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    property: { findFirst: vi.fn() },
    gateway: { findFirst: vi.fn() },
    auditEvent: { create: vi.fn() },
    publicApiKey: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    webhookEndpoint: { updateMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  storage: { putObject: vi.fn(), getObject: vi.fn(), deleteObject: vi.fn() },
  scan: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: mock.db }));
vi.mock("@/server/auth", () => ({ requireActor: async () => mock.actor }));
vi.mock("@/server/storage", () => mock.storage);
vi.mock("@/server/malware", () => ({
  scanUpload: mock.scan,
  downloadAllowed: (status: string) => status === "CLEAN",
}));
vi.mock("@/server/licensing", () => ({
  requireTenantFeature: vi.fn(),
  recordTenantUsage: vi.fn(),
}));
import {
  readAttachment,
  storeAttachment,
  rescanAttachment,
} from "@/server/attachments";
import {
  authenticatePublicApiKey,
  createPublicApiKey,
  readPublicResource,
  rotatePublicApiKey,
} from "@/server/public-api";
import { rotateWebhookSecret } from "@/server/webhooks";

const bytes = Buffer.from("plain text");
const row = {
  id: "attachment",
  tenantId: "tenant-a",
  targetType: "PROPERTY",
  entityId: "property",
  deletedAt: null,
  expiresAt: null,
  scanStatus: "CLEAN",
  storageKey: "tenant-a/blob",
  storageProvider: "local",
  sha256: createHash("sha256").update(bytes).digest("hex"),
  fileName: "note.txt",
  contentType: "text/plain",
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.actor.role = "TENANT_ADMIN";
  mock.db.$transaction.mockImplementation(
    (fn: (tx: typeof mock.db) => Promise<unknown>) => fn(mock.db),
  );
  mock.db.attachment.findFirst.mockResolvedValue({ ...row });
  mock.db.property.findFirst.mockResolvedValue({ id: "property" });
  mock.storage.getObject.mockResolvedValue(bytes);
  mock.storage.putObject.mockResolvedValue("local");
  mock.db.attachment.create.mockImplementation(({ data }) =>
    Promise.resolve({ ...data, id: "attachment" }),
  );
  mock.scan.mockResolvedValue({ status: "SKIPPED", provider: "none" });
});
describe("attachment authorization and quarantine", () => {
  it("uses tenant-scoped IDs and does not disclose missing or foreign objects", async () => {
    mock.db.attachment.findFirst.mockResolvedValue(null);
    await expect(readAttachment("foreign")).rejects.toMatchObject({
      status: 404,
    });
    expect(mock.db.attachment.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign", tenantId: "tenant-a" },
    });
    await expect(readAttachment("foreign", "tenant-b")).rejects.toMatchObject({
      status: 403,
    });
    expect(mock.storage.getObject).not.toHaveBeenCalled();
  });
  it("requires USER property grants", async () => {
    mock.actor.role = "USER";
    mock.db.property.findFirst.mockResolvedValue(null);
    await expect(readAttachment("attachment")).rejects.toMatchObject({
      status: 404,
    });
    expect(mock.db.property.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          grants: { some: { userId: "admin", tenantId: "tenant-a" } },
        }),
      }),
    );
    expect(mock.storage.getObject).not.toHaveBeenCalled();
  });
  it.each(["PENDING", "INFECTED", "FAILED", "SKIPPED"])(
    "quarantines %s before storage access",
    async (scanStatus) => {
      mock.db.attachment.findFirst.mockResolvedValue({ ...row, scanStatus });
      await expect(readAttachment("attachment")).rejects.toMatchObject({
        status: 423,
      });
      expect(mock.storage.getObject).not.toHaveBeenCalled();
    },
  );
  it("detects modification after scan and foreign storage paths", async () => {
    mock.storage.getObject.mockResolvedValue(Buffer.from("changed"));
    await expect(readAttachment("attachment")).rejects.toMatchObject({
      status: 423,
    });
    mock.db.attachment.findFirst.mockResolvedValue({
      ...row,
      storageKey: "tenant-b/blob",
    });
    await expect(readAttachment("attachment")).rejects.toMatchObject({
      status: 404,
    });
  });
  it("stores unscanned uploads quarantined with opaque tenant keys", async () => {
    const form = new FormData();
    form.set("file", new File([bytes], "note.txt", { type: "text/plain" }));
    form.set("targetType", "PROPERTY");
    form.set("entityId", "property");
    await storeAttachment(form);
    const data = mock.db.attachment.create.mock.calls[0][0].data;
    expect(data.scanStatus).toBe("SKIPPED");
    expect(data.storageKey).toMatch(/^tenant-a\/[0-9a-f-]{36}$/);
    expect(data.storageKey).not.toContain("note.txt");
  });
  it("records malware atomically and denies scan role escalation", async () => {
    mock.scan.mockResolvedValue({ status: "INFECTED", provider: "test" });
    expect(await rescanAttachment("attachment")).toEqual({
      id: "attachment",
      status: "INFECTED",
    });
    expect(mock.db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "security.malware.detected" }),
      }),
    );
    mock.actor.role = "USER";
    await expect(rescanAttachment("attachment")).rejects.toMatchObject({
      status: 403,
    });
  });
});
describe("public API security", () => {
  const token = "mwk_pub_" + "a".repeat(43);
  it.each([
    null,
    { revokedAt: new Date(), expiresAt: null },
    { revokedAt: null, expiresAt: new Date(0) },
  ])(
    "uses the same authentication error for invalid, revoked and expired keys",
    async (key) => {
      mock.db.publicApiKey.findUnique.mockResolvedValue(key);
      await expect(
        authenticatePublicApiKey(`Bearer ${token}`),
      ).rejects.toMatchObject({
        status: 401,
        message: "API-Key fehlt oder ist ungültig.",
      });
    },
  );
  it("accepts only Authorization bearer credentials", async () => {
    await expect(authenticatePublicApiKey(null)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      authenticatePublicApiKey(`?api_key=${token}`),
    ).rejects.toMatchObject({ status: 401 });
    expect(mock.db.publicApiKey.findUnique).not.toHaveBeenCalled();
  });
  it("denies scope escalation, foreign tenant queries and unknown query fields", async () => {
    const key = { id: "key", tenantId: "tenant-a", scopes: [] };
    await expect(readPublicResource(key, "meters", {})).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      readPublicResource(key, "meters", { tenantId: "tenant-b" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      readPublicResource(key, "meters", { api_key: token }),
    ).rejects.toThrow();
    await expect(
      createPublicApiKey(
        { ...mock.actor, role: "USER" },
        { scopes: ["meters:read"] },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createPublicApiKey(
        { ...mock.actor, role: "TENANT_ADMIN" },
        { name: "Escalate", scopes: ["users:write"] },
      ),
    ).rejects.toThrow();
  });
  it("rotates only the key hash without altering scopes, expiry or limits", async () => {
    mock.db.publicApiKey.updateMany.mockResolvedValue({ count: 1 });
    const result = await rotatePublicApiKey(
      { ...mock.actor, role: "TENANT_ADMIN" },
      "key",
    );
    const { where, data } = mock.db.publicApiKey.updateMany.mock.calls[0][0];
    expect(where.tenantId).toBe("tenant-a");
    expect(where.revokedAt).toBeNull();
    expect(Object.keys(data)).toEqual(["keyHash"]);
    expect(data.keyHash).toBe(
      createHash("sha256").update(result.token).digest("hex"),
    );
    expect(JSON.stringify(mock.db.auditEvent.create.mock.calls)).not.toContain(
      result.token,
    );
  });
  it("rotates webhook secrets encrypted at rest and rejects foreign IDs", async () => {
    mock.db.webhookEndpoint.updateMany.mockResolvedValue({ count: 1 });
    const result = await rotateWebhookSecret(
      { ...mock.actor, role: "TENANT_ADMIN" },
      "webhook",
    );
    expect(result.previousSecretExpired).toBe(true);
    const saved = mock.db.webhookEndpoint.updateMany.mock.calls[0][0];
    expect(saved.where.tenantId).toBe("tenant-a");
    expect(JSON.stringify(saved.data)).not.toContain(result.secret);
    mock.db.webhookEndpoint.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      rotateWebhookSecret({ ...mock.actor, role: "TENANT_ADMIN" }, "foreign"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      rotateWebhookSecret({ ...mock.actor, role: "USER" }, "webhook"),
    ).rejects.toMatchObject({ status: 403 });
  });
});
