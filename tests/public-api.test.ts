import { describe, expect, it } from "vitest";
import {
  publicCorrelationId,
  publicApiRateLimit,
} from "../src/server/public-api";

describe("public API helpers", () => {
  it("retains safe correlation IDs and replaces malformed values", () => {
    expect(publicCorrelationId("support-ticket:123456")).toBe(
      "support-ticket:123456",
    );
    const generated = publicCorrelationId("bad value");
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sets a finite documented per-key request limit", () => {
    expect(publicApiRateLimit).toBe(120);
  });
});
