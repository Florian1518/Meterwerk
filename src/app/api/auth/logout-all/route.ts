import { failure } from "@/server/http";
import { requireActor, signOutAll } from "@/server/auth";
export async function POST() {
  try {
    const actor = await requireActor();
    await signOutAll(actor.id);
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
