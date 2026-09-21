import { describe, expect, it } from "vitest";
import { hostTenantHint } from "@/server/security-config";
import { totpCode, verifyTotp } from "@/server/mfa";
describe("production security primitives", () => {
  it("supports TOTP windows without accepting wrong codes", () => {
    const now = 1_700_000_000_000;
    const secret = "JBSWY3DPEHPK3PXP";
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, "000000", now)).toBe(false);
  });
  it("treats subdomains as routing hints only", () => {
    expect(hostTenantHint("kunde-a.meterwerk.de")).toBe("kunde-a");
    expect(hostTenantHint("evil.example.net")).toBeNull();
  });
});
