import { NextRequest } from "next/server";
import { failure, readBody } from "@/server/http";
import { requireActor } from "@/server/auth";
import { beginMfaSetup, confirmMfaSetup, disableMfa } from "@/server/mfa";
export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    if (body.action === "begin")
      return Response.json(await beginMfaSetup(actor));
    if (body.action === "confirm")
      return Response.json({
        recoveryCodes: await confirmMfaSetup(actor, String(body.token)),
      });
    if (body.action === "disable") {
      await disableMfa(actor, String(body.password), String(body.token));
      return Response.json({ ok: true });
    }
    throw new Error("Ungültige MFA-Aktion.");
  } catch (e) {
    return failure(e);
  }
}
