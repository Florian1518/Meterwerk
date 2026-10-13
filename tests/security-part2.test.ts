import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { assertWorkflowSecurity } from "../scripts/workflow-security-policy.mjs";
import { attachmentError } from "@/lib/attachment-validation";
import { csvCell } from "@/lib/modbus/csv";
import { pdfText, downloadDisposition } from "@/lib/report-security";
import { downloadAllowed, scanUpload } from "@/server/malware";
import {
  isPrivateAddress,
  validateOutboundUrl,
  resolvePublicTarget,
} from "@/server/outbound-http";
import { signWebhook, verifyWebhookSignature } from "@/server/webhooks";
import { publicError } from "@/server/errors";
import { signedAttachmentToken, verifyAttachmentToken } from "@/server/storage";

afterEach(() => vi.unstubAllEnvs());
describe("Phase 5r part 2 security boundaries", () => {
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  it.each([
    "../photo.png",
    "folder/photo.png",
    "folder\\photo.png",
    "photo.exe.png",
    "photo.png.exe",
    "photo:evil.png",
    "photo\r\n.png",
    "photo\u202e.png",
  ])("rejects unsafe filename %s", (name) =>
    expect(attachmentError(name, "image/png", png)).not.toBeNull(),
  );
  it("rejects MIME spoofing and oversized files", () => {
    expect(
      attachmentError(
        "photo.png",
        "image/png",
        new TextEncoder().encode("<script>"),
      ),
    ).not.toBeNull();
    expect(attachmentError("photo.svg", "image/svg+xml", png)).not.toBeNull();
    expect(
      attachmentError(
        "photo.png",
        "image/png",
        new Uint8Array(10 * 1024 * 1024 + 1),
      ),
    ).not.toBeNull();
    expect(attachmentError("photo.png", "image/png", png)).toBeNull();
  });
  it("never reports an absent or failed scanner as clean", async () => {
    vi.stubEnv("CLAMAV_HOST", "");
    expect((await scanUpload(png)).status).toBe("SKIPPED");
    expect(
      (
        await scanUpload(png, {
          scan: async () => {
            throw new Error("private scanner details");
          },
        })
      ).status,
    ).toBe("FAILED");
    for (const status of ["PENDING", "INFECTED", "FAILED", "SKIPPED"])
      expect(downloadAllowed(status)).toBe(false);
    expect(
      downloadAllowed(
        (
          await scanUpload(png, {
            scan: async () => ({ status: "CLEAN", provider: "test-only" }),
          })
        ).status,
      ),
    ).toBe(true);
  });
  it.each([
    "https://localhost/",
    "https://127.1/",
    "https://2130706433/",
    "https://[::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://10.0.0.1/",
    "https://172.16.0.1/",
    "https://192.168.1.1/",
    "https://169.254.169.254/",
    "file:///etc/passwd",
    "ftp://example.com/",
    "https://metadata.internal/",
    "https://user:pass@example.com/",
  ])("blocks SSRF %s", (url) =>
    expect(() => validateOutboundUrl(url)).toThrow(),
  );
  it("requires HTTPS in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => validateOutboundUrl("http://example.com/")).toThrow();
  });
  it("rejects private addresses before opening sockets", async () => {
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    await expect(
      resolvePublicTarget(new URL("https://127.0.0.1")),
    ).rejects.toThrow();
  });
  it("rejects forged, stale and mismatched webhook signatures", () => {
    const now = 1_800_000_000_000,
      timestamp = String(now / 1000);
    const signed = signWebhook("old", "delivery", timestamp, "{}");
    expect(
      verifyWebhookSignature("old", "delivery", signed, "{}", now, timestamp),
    ).toBe(true);
    expect(verifyWebhookSignature("new", "delivery", signed, "{}", now)).toBe(
      false,
    );
    expect(verifyWebhookSignature("old", "other", signed, "{}", now)).toBe(
      false,
    );
    expect(
      verifyWebhookSignature("old", "delivery", signed, "{}", now + 301000),
    ).toBe(false);
    expect(
      verifyWebhookSignature("old", "delivery", signed, "changed", now),
    ).toBe(false);
  });
  it.each([
    "=CMD()",
    "+CMD()",
    "-CMD()",
    "@SUM(1)",
    " \t=CMD()",
    "\uFEFF=CMD()",
    "\nformula",
  ])("escapes spreadsheet formula %s", (value) =>
    expect(csvCell(value)).toBe(`"'${value}"`),
  );
  it("keeps exact negative decimals", () =>
    expect(csvCell("-123.456")).toBe('"-123.456"'));
  it("quotes PDF operands and safe download headers", () => {
    expect(pdfText(") /JavaScript (\\\n")).toBe("\\) /JavaScript \\(\\\\ ");
    expect(downloadDisposition('report"\r\nInjected: yes.pdf')).not.toMatch(
      /[\r\n]/,
    );
    expect(downloadDisposition("a'b.pdf")).toContain("a%27b.pdf");
  });
  it("binds short-lived download signatures to actor, tenant and attachment", () => {
    const token = signedAttachmentToken("t:u:a", new Date(Date.now() + 60000));
    expect(verifyAttachmentToken("t:u:a", token)).toBe(true);
    expect(verifyAttachmentToken("foreign:u:a", token)).toBe(false);
    expect(verifyAttachmentToken("t:u:a", token + ".extra")).toBe(false);
    expect(() =>
      signedAttachmentToken("t:u:a", new Date(Date.now() + 600000)),
    ).toThrow();
  });
  it("does not expose internal error secrets", () =>
    expect(
      JSON.stringify(publicError(new Error("password=do-not-return-this"))),
    ).not.toContain("do-not-return-this"));
  it("pins workflow actions and limits permissions", () => {
    for (const file of readdirSync(".github/workflows")) {
      const workflow = readFileSync(`.github/workflows/${file}`, "utf8");
      assertWorkflowSecurity(file, workflow);
    }
  });
  it.each(["push", "pull_request", "schedule", "workflow_run"])(
    "rejects automatic publish trigger %s",
    (trigger) => {
      const text = readFileSync(".github/workflows/publish-images.yml", "utf8");
      expect(() =>
        assertWorkflowSecurity(
          "publish-images.yml",
          text.replace(
            "  workflow_dispatch:",
            `  workflow_dispatch:\n  ${trigger}:`,
          ),
        ),
      ).toThrow();
    },
  );
  it.each(["ci.yml", "release.yml", "other.yml"])(
    "rejects package write outside publish-images.yml: %s",
    (file) => {
      const text = readFileSync(".github/workflows/publish-images.yml", "utf8");
      expect(() => assertWorkflowSecurity(file, text)).toThrow();
    },
  );
  it.each(["contents: write", "contents: write-all"])(
    "rejects publish permission escalation %s",
    (permission) => {
      const text = readFileSync(".github/workflows/publish-images.yml", "utf8");
      expect(() =>
        assertWorkflowSecurity(
          "publish-images.yml",
          text.replace("contents: read", permission),
        ),
      ).toThrow();
    },
  );
  it.each(["docker login ghcr.io", "docker push ghcr.io/example/image"])(
    "rejects registry mutations in release: %s",
    (command) => {
      const text = readFileSync(".github/workflows/release.yml", "utf8");
      expect(() =>
        assertWorkflowSecurity(
          "release.yml",
          `${text}\n      - run: ${command}\n`,
        ),
      ).toThrow();
    },
  );
  it.each([
    "kubectl apply -f deployment.yml",
    "helm upgrade app chart",
    "docker stack deploy app",
  ])("rejects deployment even in manual publish: %s", (command) => {
    const text = readFileSync(".github/workflows/publish-images.yml", "utf8");
    expect(() =>
      assertWorkflowSecurity(
        "publish-images.yml",
        `${text}\n      - run: ${command}\n`,
      ),
    ).toThrow();
  });
});
