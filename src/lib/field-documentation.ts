import { z } from "zod";
import { checklistSchema, fieldId, workOrderTypes } from "./field-service";
import { replacementSchema } from "./meter-replacement";

const note = z.string().trim().max(4000).default("");
const instant = z.iso.datetime({ offset: true });
export const categories = [
  "BEFORE",
  "AFTER",
  "DEFECT",
  "METER",
  "GATEWAY",
  "DOCUMENT",
  "OTHER",
] as const;
export const documentationSchema = z
  .object({
    report: note,
    workPerformed: note,
    defects: note,
    recommendations: note,
    internalNotes: note,
    customerNotes: note,
    actualStart: instant,
    actualEnd: instant,
  })
  .strict()
  .refine(
    (v) => Date.parse(v.actualEnd) > Date.parse(v.actualStart),
    "Ende muss nach Beginn liegen.",
  );
export const commissioningSchema = z
  .object({
    equipment: z.string().trim().min(1).max(200),
    serialNumber: z.string().trim().min(1).max(200),
    protocol: z.string().trim().min(1).max(200),
    deviceProfileId: fieldId.nullable().default(null),
    location: z.string().trim().min(1).max(500),
    communicationChecked: z.boolean(),
    readingsPlausible: z.boolean(),
    clockChecked: z.boolean(),
    mappingChecked: z.boolean(),
    gatewayChecked: z.boolean(),
    result: z.enum(["PASSED", "PASSED_WITH_NOTES", "FAILED"]),
    notes: note,
  })
  .strict()
  .refine(
    (v) =>
      v.result === "FAILED" ||
      (v.communicationChecked &&
        v.readingsPlausible &&
        v.clockChecked &&
        v.mappingChecked &&
        v.gatewayChecked),
    "Für eine erfolgreiche Abnahme müssen alle Prüfungen bestätigt sein.",
  )
  .refine(
    (v) => v.result !== "PASSED_WITH_NOTES" || v.notes.length > 0,
    "Bemerkungen erforderlich.",
  );
export const materialSchema = z
  .object({
    articleNumber: z.string().max(100).default(""),
    description: z.string().trim().min(1).max(300),
    quantity: z
      .string()
      .regex(/^\d{1,10}(\.\d{1,6})?$/)
      .refine((v) => /[1-9]/.test(v)),
    unit: z.string().trim().min(1).max(40),
    comment: note,
  })
  .strict();
export const timeSchema = z
  .object({
    technicianId: fieldId,
    start: instant,
    end: instant,
    pauseMinutes: z.number().int().min(0).max(1440),
    activity: z.string().trim().min(1).max(300),
    comment: note,
    entryId: fieldId.optional(),
    correctionReason: z.string().trim().max(1000).default(""),
  })
  .strict()
  .refine(
    (v) =>
      netMinutes(v) > 0 && Date.parse(v.end) - Date.parse(v.start) <= 86400000,
    "Zeitblock muss positiv und höchstens 24 Stunden lang sein.",
  )
  .refine(
    (v) => !v.entryId || v.correctionReason.length > 0,
    "Korrekturbegründung erforderlich.",
  );
export function netMinutes(v: {
  start: string;
  end: string;
  pauseMinutes: number;
}) {
  return (
    Math.floor((Date.parse(v.end) - Date.parse(v.start)) / 60000) -
    v.pauseMinutes
  );
}
export const signatureSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    role: z.enum(["TECHNICIAN", "CUSTOMER"]),
    // Bounded vector strokes, rendered by the application; never executable SVG/HTML.
    strokes: z
      .array(
        z
          .array(
            z.tuple([z.number().min(0).max(600), z.number().min(0).max(200)]),
          )
          .min(2)
          .max(150),
      )
      .min(1)
      .max(10),
    accepted: z.literal(true),
  })
  .strict();
export const templateSchema = checklistSchema.extend({
  type: z.enum(workOrderTypes),
  medium: z.enum(["ELECTRICITY", "WATER", "GAS", "HEAT"]),
  deviceProfileId: fieldId.nullable().default(null),
  requireTechnicianSignature: z.boolean().default(false),
  requireCustomerSignature: z.boolean().default(false),
});
export const replacementLinkSchema = z
  .object({
    replacementId: fieldId.optional(),
    replacement: replacementSchema.optional(),
    oldPhotoId: fieldId,
    newPhotoId: fieldId,
    customerContact: z.string().trim().min(1).max(300),
    notes: note,
  })
  .strict()
  .refine(
    (v) => Boolean(v.replacementId) !== Boolean(v.replacement),
    "Vorhandenes Protokoll oder neuer Zählerwechsel erforderlich.",
  );
export const fieldMutationSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("documentation"), value: documentationSchema })
    .strict(),
  z
    .object({ kind: z.literal("commissioning"), value: commissioningSchema })
    .strict(),
  z.object({ kind: z.literal("material"), value: materialSchema }).strict(),
  z.object({ kind: z.literal("time"), value: timeSchema }).strict(),
  z.object({ kind: z.literal("signature"), value: signatureSchema }).strict(),
  z
    .object({ kind: z.literal("replacement"), value: replacementLinkSchema })
    .strict(),
  z
    .object({
      kind: z.literal("template"),
      value: z.object({ templateId: fieldId }).strict(),
    })
    .strict(),
]);
export const fieldRequestSchema = z
  .object({
    requestId: z.uuid(),
    revision: z.number().int().min(0),
    mutation: fieldMutationSchema,
  })
  .strict();
