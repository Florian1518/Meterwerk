import { z } from "zod";
import { fieldId } from "./field-service";

export const calendarQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    technicianId: fieldId.nullable().optional(),
    status: z.string().max(40).optional(),
    priority: z.string().max(40).optional(),
    propertyId: fieldId.nullable().optional(),
  })
  .strict()
  .refine(
    (v) => Date.parse(v.to) > Date.parse(v.from),
    "Zeitraum ist ungültig.",
  );

export const addendumSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(6000),
    reason: z.string().trim().min(1).max(2000),
    estimatedMinutes: z
      .number()
      .int()
      .min(1)
      .max(100000)
      .nullable()
      .default(null),
    material: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(300),
            quantity: z.string().regex(/^\d{1,10}(\.\d{1,6})?$/),
            unit: z.string().trim().min(1).max(40),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();

export const addendumStatusSchema = z
  .object({
    status: z.enum(["DRAFT", "REQUESTED", "APPROVED", "REJECTED", "COMPLETED"]),
  })
  .strict();
