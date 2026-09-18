import { notFound } from "next/navigation";
import Link from "next/link";
import { getMeter } from "@/server/data";
import { pageContext } from "@/server/page-context";
import { AccessError } from "@/server/policy";
import { DataTable } from "@/components/data-table";
import { typeLabels } from "@/server/dashboard";
import { readModbus } from "@/server/modbus";
import { ModbusConsole, type ModbusView } from "@/components/modbus-console";
export default async function MeterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const ctx = await pageContext((await searchParams).tenantId);
  const meter = await getMeter(
    ctx.actor,
    (await params).id,
    ctx.tenantId,
  ).catch((error) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    throw error;
  });
  return (
    <>
      <Link className="text-link" href={`/meters?tenantId=${ctx.tenantId}`}>
        ← Zur Zählerübersicht
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{typeLabels[meter.type]}</div>
          <h1>{meter.serialNumber}</h1>
          <p>
            {meter.manufacturer} · {meter.model} · {meter.location}
          </p>
        </div>
      </div>
      <section className="panel">
        <dl className="meter-details">
          <div>
            <dt>Geräte-ID</dt>
            <dd>{meter.externalDeviceId ?? "—"}</dd>
          </div>
          <div>
            <dt>Einheit</dt>
            <dd>{meter.measurementUnit}</dd>
          </div>
          <div>
            <dt>Installation</dt>
            <dd>{meter.installedAt.toISOString().slice(0, 10)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{meter.status}</dd>
          </div>
        </dl>
      </section>
      <h2 className="section-title">Letzte 48 Messwerte</h2>
      <ModbusConsole
        initial={
          JSON.parse(
            JSON.stringify(
              await readModbus(meter.id, (await searchParams).tenantId),
            ),
          ) as ModbusView
        }
      />
      <DataTable
        headers={[
          "Zeitpunkt (UTC)",
          "Zählerstand",
          "Verbrauch",
          "Einheit",
          "Quelle",
          "Qualität",
        ]}
        rows={meter.readings.map((r) => ({
          id: r.id,
          cells: [
            r.timestamp.toISOString().replace("T", " ").slice(0, 16),
            r.registerValue.toString(),
            r.consumption.toString(),
            r.measurementUnit,
            r.source,
            r.quality,
          ],
        }))}
      />
    </>
  );
}
