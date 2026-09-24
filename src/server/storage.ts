import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stableSecretKey } from "./security-config";
const provider = () =>
  process.env.ATTACHMENT_STORAGE === "s3"
    ? ("s3" as const)
    : ("local" as const);
const root = () => process.env.ATTACHMENT_LOCAL_ROOT ?? ".local/attachments";
function s3Config() {
  const endpoint = process.env.ATTACHMENT_S3_ENDPOINT;
  const bucket = process.env.ATTACHMENT_S3_BUCKET;
  const token = process.env.ATTACHMENT_S3_TOKEN;
  if (!endpoint || !bucket || !token)
    throw new Error("S3-kompatibler Storage ist unvollständig konfiguriert.");
  return { endpoint: endpoint.replace(/\/$/, ""), bucket, token };
}
export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
) {
  if (provider() === "local") {
    await mkdir(join(/* turbopackIgnore: true */ root(), key.split("/")[0]), {
      recursive: true,
    });
    await writeFile(join(/* turbopackIgnore: true */ root(), key), bytes, {
      flag: "wx",
      mode: 0o600,
    });
    return "local" as const;
  }
  const config = s3Config();
  const response = await fetch(
    `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": contentType,
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
export async function getObject(key: string) {
  if (provider() === "local")
    return readFile(join(/* turbopackIgnore: true */ root(), key));
  const config = s3Config();
  const response = await fetch(
    `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
    { headers: { Authorization: `Bearer ${config.token}` } },
  );
  if (!response.ok)
    throw new Error(
      `Object Storage Download fehlgeschlagen (${response.status}).`,
    );
  return Buffer.from(await response.arrayBuffer());
}
export async function deleteObject(key: string) {
  if (provider() === "local") {
    await unlink(join(/* turbopackIgnore: true */ root(), key)).catch(
      () => undefined,
    );
    return;
  }
  const config = s3Config();
  await fetch(
    `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${config.token}` } },
  );
}
export function signedAttachmentToken(id: string, expiresAt: Date) {
  const payload = `${id}.${expiresAt.getTime()}`;
  return `${expiresAt.getTime()}.${createHmac("sha256", stableSecretKey()).update(payload).digest("base64url")}`;
}
export function verifyAttachmentToken(id: string, token: string) {
  const [expiry, signature] = token.split(".");
  const timestamp = Number(expiry);
  if (!signature || !Number.isFinite(timestamp) || timestamp < Date.now())
    return false;
  const expected = createHmac("sha256", stableSecretKey())
    .update(`${id}.${timestamp}`)
    .digest("base64url");
  return (
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}
