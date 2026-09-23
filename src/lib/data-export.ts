import { z } from "zod";

export const exportFilterSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    meterId: z.string().trim().min(1).max(160).optional(),
    propertyId: z.string().trim().min(1).max(160).optional(),
    medium: z.enum(["ELECTRICITY", "WATER", "GAS", "HEAT"]).optional(),
  })
  .refine((value) => new Date(value.from) < new Date(value.to), {
    message: "Beginn muss vor dem exklusiven Ende liegen.",
  });

// Quoting alone does not stop spreadsheet formula evaluation.
export function csvCell(value: string) {
  const safe =
    (/^[\s\uFEFF]*[=+\-@]/u.test(value) && !/^-\d+(?:\.\d+)?$/.test(value)) ||
    /^[\t\r\n]/u.test(value)
      ? `'${value}`
      : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function csvLine(values: string[]) {
  return values.map(csvCell).join(";") + "\r\n";
}
