import { describe, expect, it } from "vitest";
import { readingPayload } from "../src/server/ingestion";
describe("REST ingestion contract", () => {
  const valid = {
    messageId: "msg-1",
    timestamp: "2026-09-17T12:00:00Z",
    value: 12853.42,
    consumption: 2.38,
    unit: "kWh",
    quality: "VALID",
    source: "REST",
  };
  it("accepts the documented payload", () =>
    expect(readingPayload.parse(valid)).toMatchObject(valid));
  it.each(["", " "])("requires messageId (%s)", (messageId) =>
    expect(() => readingPayload.parse({ ...valid, messageId })).toThrow(),
  );
  it("rejects negative meter values and unknown units", () => {
    expect(() => readingPayload.parse({ ...valid, value: -1 })).toThrow();
    expect(() => readingPayload.parse({ ...valid, unit: "liter" })).toThrow();
  });
  it("rejects malformed timestamps and unknown fields", () => {
    expect(() =>
      readingPayload.parse({ ...valid, timestamp: "yesterday" }),
    ).toThrow();
    expect(() =>
      readingPayload.parse({ ...valid, tenantId: "other-tenant" }),
    ).toThrow();
  });
  it("supports quality states", () => {
    for (const quality of ["VALID", "ESTIMATED", "INVALID", "SUSPECT"]) {
      expect(readingPayload.parse({ ...valid, quality }).quality).toBe(quality);
    }
  });
});
