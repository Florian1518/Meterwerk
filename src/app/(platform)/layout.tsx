import { requirePageActor } from "@/server/auth";
import { Shell } from "@/components/shell";
import { presentation } from "@/server/presentation";
export const dynamic = "force-dynamic";
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requirePageActor();
  return (
    <Shell
      actor={actor}
      preferences={await presentation()}
      environment={
        process.env.METERWERK_ENV === "demo"
          ? "demo"
          : process.env.METERWERK_ENV === "staging"
            ? "staging"
            : "production"
      }
    >
      {children}
    </Shell>
  );
}
