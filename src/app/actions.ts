"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActor, signIn, signOut } from "@/server/auth";
import { mutate } from "@/server/mutations";
import { publicError } from "@/server/errors";
export type ActionState = { error?: string; success?: string };
function message(error: unknown) {
  return publicError(error).message;
}
export async function loginAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { email, password, mfaToken } = z
      .object({
        email: z.email().toLowerCase(),
        password: z.string().min(1).max(128),
        mfaToken: z.string().trim().max(32).optional(),
      })
      .parse(Object.fromEntries(form));
    await signIn(email, password, mfaToken);
  } catch (error) {
    return { error: message(error) };
  }
  redirect("/dashboard");
}
export async function logoutAction() {
  await signOut();
  redirect("/login");
}
export async function createAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await mutate(
      await requireActor(),
      Object.fromEntries(form),
      form.get("tenantId")?.toString(),
    );
    revalidatePath("/", "layout");
    return { success: "Änderung gespeichert." };
  } catch (error) {
    return { error: message(error) };
  }
}
