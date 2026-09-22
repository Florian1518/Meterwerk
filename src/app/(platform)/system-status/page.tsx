export const metadata = { title: "Systemstatus · Meterwerk" };
import { presentation } from "@/server/presentation";
import { systemStatus } from "@/server/system-status";
import { SystemConsole } from "@/components/system-console";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const status = await systemStatus((await searchParams).tenantId);
  return (
    <>
      <h1>Systemstatus</h1>
      <SystemConsole
        timeZone={(await presentation()).timeZone}
        initial={JSON.parse(JSON.stringify(status))}
      />
    </>
  );
}
