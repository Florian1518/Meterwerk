import { describe, expect, it } from "vitest";
import manifest from "../src/app/manifest";
import { readFileSync } from "node:fs";
describe("PWA-Grundlage", () => {
  it("liefert installierbares Manifest", () => {
    const value = manifest();
    expect(value.name).toBe("Meterwerk");
    expect(value.display).toBe("standalone");
    expect(value.start_url).toBe("/dashboard");
  });
  it("cacht keine geschützten API-Antworten", () => {
    const worker = readFileSync("public/sw.js", "utf8");
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
    expect(worker).not.toContain('request.destination === "image"');
    expect(worker).not.toContain("Authorization");
  });
});
