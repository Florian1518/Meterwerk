import "server-only";
import { createHash } from "node:crypto";
import { getObject, putObject } from "./storage";
import { isSafeStorageKey } from "@/lib/security";

export type BackupObject = {
  key: string;
  sizeBytes: number;
  sha256: string;
  versionId?: string;
  etag?: string;
  private: true;
};
export interface BackupStorageProvider {
  put(key: string, bytes: Uint8Array): Promise<BackupObject>;
  head(
    key: string,
    expectedSha256?: string,
  ): Promise<{
    exists: boolean;
    sizeBytes?: number;
    sha256?: string;
    versionId?: string;
  }>;
}
export class MeterwerkBackupStorage implements BackupStorageProvider {
  async put(key: string, bytes: Uint8Array) {
    if (!isSafeStorageKey(key) || !key.startsWith("backups/"))
      throw new Error("Ungültiger Backup-Storage-Key.");
    await putObject(key, bytes, "application/octet-stream");
    return {
      key,
      sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      private: true as const,
    };
  }
  async head(key: string, expectedSha256?: string) {
    if (!isSafeStorageKey(key) || !key.startsWith("backups/"))
      return { exists: false };
    try {
      const bytes = await getObject(key);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return {
        exists: !expectedSha256 || sha256 === expectedSha256,
        sizeBytes: bytes.length,
        sha256,
      };
    } catch {
      return { exists: false };
    }
  }
}
