import "server-only";
import { cookies } from "next/headers";
import { validTimeZone } from "@/lib/format";
export async function presentation() {
  const store = await cookies();
  const theme = store.get("meterwerk_theme")?.value;
  return {
    theme: theme === "light" || theme === "dark" ? theme : "system",
    timeZone: validTimeZone(store.get("meterwerk_timezone")?.value),
  } as const;
}
