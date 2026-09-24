import { z } from "zod";
export const replacementSchema = z
  .object({
    oldMeterId: z.string().min(1),
    newMeterId: z.string().min(1),
    removedAt: z.iso.datetime({ offset: true }),
    removedRegister: z.string().regex(/^\d+(\.\d{1,6})?$/),
    installedAt: z.iso.datetime({ offset: true }),
    installedRegister: z.string().regex(/^\d+(\.\d{1,6})?$/),
    reason: z.string().trim().min(1).max(240),
    documentation: z.string().max(2000).optional(),
  })
  .strict();
