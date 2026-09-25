import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertOrigin, readBody } from "@/server/http";
import { completeDrDrill, startDrDrill } from "@/server/disaster-recovery";

const startSchema = z.object({
  type: z.string().min(1).max(80),
  environment: z.enum(["test", "staging"]),
  plannedAt: z.coerce.date().optional(),
  nextDrillAt: z.coerce.date().optional(),
});
const completeSchema = z.object({
  id: z.string().min(1),
  checksPassed: z.boolean(),
  findings: z.number().int().nonnegative().optional(),
  incidentStartedAt: z.coerce.date().optional(),
  recoveryStartedAt: z.coerce.date().optional(),
  rpoTargetSeconds: z.number().int().positive().optional(),
  rpoObservedSeconds: z.number().int().nonnegative().optional(),
  rtoTargetSeconds: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  assertOrigin(request);
  const body = await readBody(request);
  if (body && typeof body === "object" && "id" in body)
    return NextResponse.json(await completeDrDrill(completeSchema.parse(body)));
  return NextResponse.json(await startDrDrill(startSchema.parse(body)));
}
