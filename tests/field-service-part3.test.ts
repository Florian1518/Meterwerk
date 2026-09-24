import { describe, expect, it } from "vitest";
import {
  calendarQuerySchema,
  addendumSchema,
} from "../src/lib/field-service-planning";
import {
  signedAttachmentToken,
  verifyAttachmentToken,
} from "../src/server/storage";

describe("Field Service Teil 3 Verträge", () => {
  it("validiert Kalenderzeiträume und Filterwerte", () => {
    expect(
      calendarQuerySchema.safeParse({
        from: "2026-01-01T00:00:00Z",
        to: "2026-01-08T00:00:00Z",
        technicianId: "tech",
        status: "PLANNED",
        priority: "HIGH",
        propertyId: "property",
      }).success,
    ).toBe(true);
    expect(
      calendarQuerySchema.safeParse({
        from: "2026-01-08T00:00:00Z",
        to: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      calendarQuerySchema.safeParse({
        from: "2026-01-01T00:00:00",
        to: "2026-01-02T00:00:00Z",
      }).success,
    ).toBe(false);
  });
  it("validiert Nachträge ohne Preis-/Fakturalogik", () => {
    expect(
      addendumSchema.parse({
        title: "Zusatzprüfung",
        description: "Zusätzliche Messung",
        reason: "Mangel vor Ort",
        estimatedMinutes: 45,
        material: [{ description: "Dichtung", quantity: "2", unit: "Stück" }],
      }),
    ).toMatchObject({ title: "Zusatzprüfung" });
    expect(
      addendumSchema.safeParse({ title: "", description: "x", reason: "x" })
        .success,
    ).toBe(false);
    expect(
      addendumSchema.safeParse({
        title: "x",
        description: "x",
        reason: "x",
        material: [{ description: "x", quantity: "-1", unit: "Stück" }],
      }).success,
    ).toBe(false);
  });
  it("prüft signierte Download-Tokens mit Ablaufzeit", () => {
    const token = signedAttachmentToken(
      "attachment",
      new Date(Date.now() + 60_000),
    );
    expect(verifyAttachmentToken("attachment", token)).toBe(true);
    expect(verifyAttachmentToken("foreign", token)).toBe(false);
    expect(
      verifyAttachmentToken(
        "attachment",
        signedAttachmentToken("attachment", new Date(Date.now() - 1)),
      ),
    ).toBe(false);
  });
});
