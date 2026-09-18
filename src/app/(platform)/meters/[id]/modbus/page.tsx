import Link from "next/link";
import { readModbus } from "@/server/modbus";
import { ModbusConsole, type ModbusView } from "@/components/modbus-console";
export default async function ModbusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { id } = await params;
  const { tenantId } = await searchParams;
  let data = await readModbus(id, tenantId);
  if (data.canManage) data = await readModbus(id, tenantId, true);
  return (
    <>
      <Link
        className="text-link"
        href={`/meters/${id}?tenantId=${data.tenantId}`}
      >
        ← Zählerdetail
      </Link>
      <h1>Modbus-Diagnose · {data.meter.serialNumber}</h1>
      <ModbusConsole
        diagnosis
        initial={JSON.parse(JSON.stringify(data)) as ModbusView}
      />
    </>
  );
}
