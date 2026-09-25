import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, lstat, open, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { stableSecretKey } from "./security-config";
import { isSafeStorageKey } from "@/lib/security";
import { publicRequest, validateOutboundUrl } from "./outbound-http";
const provider = () =>
  process.env.ATTACHMENT_STORAGE === "s3"
    ? ("s3" as const)
    : ("local" as const);
const root = () => process.env.ATTACHMENT_LOCAL_ROOT ?? ".local/attachments";
function safeStorageKey(key: string) {
  if (!isSafeStorageKey(key)) throw new Error("Ungültiger Storage-Pfad.");
  return key;
}
async function checkTenantDirectory(key: string) {
  const directory = await lstat(
    join(/* turbopackIgnore: true */ root(), key.split("/")[0]),
  );
  if (!directory.isDirectory() || directory.isSymbolicLink())
    throw new Error("Ungültiger Storage-Pfad.");
}
function s3Config() {
  const endpoint = process.env.ATTACHMENT_S3_ENDPOINT;
  const bucket = process.env.ATTACHMENT_S3_BUCKET;
  const token = process.env.ATTACHMENT_S3_TOKEN;
  if (!endpoint || !bucket || !token)
    throw new Error("S3-kompatibler Storage ist unvollständig konfiguriert.");
  validateOutboundUrl(endpoint);
  return { endpoint: endpoint.replace(/\/$/, ""), bucket, token };
}
export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
) {
  key = safeStorageKey(key);
  if (provider() === "local") {
    await mkdir(join(/* turbopackIgnore: true */ root(), key.split("/")[0]), {
      recursive: true,
      mode: 0o700,
    });
    await checkTenantDirectory(key);
    await writeFile(join(/* turbopackIgnore: true */ root(), key), bytes, {
      flag: "wx",
      mode: 0o600,
    });
    return "local" as const;
  }
  const config = s3Config();
  const response = await publicRequest(
    `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": contentType,
        "If-None-Match": "*",
        "x-amz-acl": "private",
      },
      body: Buffer.from(bytes),
    },
  );
  if (!response.ok)
    throw new Error(
      `Object Storage Upload fehlgeschlagen (${response.status}).`,
    );
  return "s3" as const;
}
export async function getObject(
  key: string,
  selectedProvider: string = provider(),
) {
  key = safeStorageKey(key);
  if (selectedProvider === "local") {
    await checkTenantDirectory(key);
    const path = join(/* turbopackIgnore: true */ root(), key);
    if ((await lstat(path)).isSymbolicLink())
      throw new Error("Ungültiger Storage-Pfad.");
    const handle = await open(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 10 * 1024 * 1024)
        throw new Error("Ungültige Dateigröße.");
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }
  if (selectedProvider !== "s3")
    throw new Error("Unbekannter Storage-Provider.");
  const config = s3Config();
  const response = await publicRequest(
    `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
    {
      headers: { Authorization: `Bearer ${config.token}` },
      maxResponseBytes: 10 * 1024 * 1024,
    },
  );
  if (!response.ok)
    throw new Error(
      `Object Storage Download fehlgeschlagen (${response.status}).`,
    );
  return Buffer.from(await response.arrayBuffer());
}
export async function deleteObject(
  key: string,
  selectedProvider: string = provider(),
) {
  key = safeStorageKey(key);
  if (selectedProvider === "local") {
    await checkTenantDirectory(key);
    await unlink(join(/* turbopackIgnore: true */ root(), key)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      },
    );
    return;
  }
  if (selectedProvider !== "s3")
    throw new Error("Unbekannter Storage-Provider.");
  const config = s3Config();
  const response = await publicRequest(
    `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${config.token}` } },
  );
  if (!response.ok && response.status !== 404)
    throw new Error("Storage-Löschung fehlgeschlagen.");
}
export function signedAttachmentToken(id: string, expiresAt: Date) {
  if (
    expiresAt.getTime() <= Date.now() ||
    expiresAt.getTime() > Date.now() + 300_000
  )
    throw new Error("Download-Token maximal fünf Minuten gültig.");
  const payload = `${id}.${expiresAt.getTime()}`;
  return `${expiresAt.getTime()}.${createHmac("sha256", stableSecretKey()).update(payload).digest("base64url")}`;
}
export function verifyAttachmentToken(id: string, token: string) {
  const [expiry, signature] = token.split(".");
  const timestamp = Number(expiry);
  if (
    token.split(".").length !== 2 ||
    !signature ||
    !Number.isFinite(timestamp) ||
    timestamp < Date.now() ||
    timestamp > Date.now() + 300_000
  )
    return false;
  const expected = createHmac("sha256", stableSecretKey())
    .update(`${id}.${timestamp}`)
    .digest("base64url");
  return (
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}
