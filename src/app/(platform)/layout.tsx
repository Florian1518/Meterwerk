import { requirePageActor } from "@/server/auth";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requirePageActor();
  return <Shell actor={actor}>{children}</Shell>;
}
