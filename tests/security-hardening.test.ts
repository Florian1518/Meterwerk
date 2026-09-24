import { describe, expect, it } from "vitest";
import { isSafeStorageKey, sessionCookieSecure } from "@/lib/security";

describe("security hardening guards", () => {
  it("rejects traversal and absolute storage keys", () => {
    expect(isSafeStorageKey("tenant/file.pdf")).toBe(true);
    expect(isSafeStorageKey("../outside")).toBe(false);
    expect(isSafeStorageKey("/etc/passwd")).toBe(false);
    expect(isSafeStorageKey("C:\\temp\\secret")).toBe(false);
    expect(isSafeStorageKey("tenant/\0file")).toBe(false);
  });

  it("requires secure cookies in production-like environments", () => {
    expect(sessionCookieSecure("production", "development")).toBe(true);
    expect(sessionCookieSecure("pilot", "development")).toBe(true);
    expect(sessionCookieSecure("development", "production")).toBe(true);
    expect(sessionCookieSecure("development", "development")).toBe(false);
  });
});
