export const metadata = { title: "Zählerdetails · Meterwerk" };
import { presentation } from "@/server/presentation";
import {
  dateTime,
  calendarDate,
  decimal,
  measurement,
  unitLabel,
} from "@/lib/format";
import { notFound } from "next/navigation";
import { RecentMeters } from "@/components/recent-meters";
import Link from "next/link";
import { getMeter } from "@/server/data";
import { pageContext } from "@/server/page-context";
import { AccessError } from "@/server/policy";
import { DataTable } from "@/components/data-table";
import { typeLabels } from "@/server/dashboard";
import { readModbus } from "@/server/modbus";
import { ModbusConsole, type ModbusView } from "@/components/modbus-console";
import { utilityDetail } from "@/server/utility";
import { UtilityOverview } from "@/components/utility-overview";
import { UtilitySettings } from "@/components/utility-settings";
import { meterCapability } from "@/server/device-profiles";
import { DeviceCapabilityPanel } from "@/components/device-capability-panel";
import { MeterReplacementForm } from "@/components/meter-replacement-form";
export default async function MeterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { timeZone } = await presentation();
  const ctx = await pageContext((await searchParams).tenantId);
  const meter = await getMeter(
    ctx.actor,
    (await params).id,
    ctx.tenantId,
  ).catch((error) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    throw error;
  });
  const detail = await utilityDetail(meter.id, ctx.tenantId);
  const capability = await meterCapability(meter.id, ctx.tenantId);
  const modbus = await readModbus(meter.id, ctx.tenantId);
  const to = new Date().toISOString();
  const from = new Date(new Date(to).getTime() - 30 * 86400000).toISOString();
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
        <RecentMeters
          key={`${ctx.actor.id}:${ctx.tenantId}:${meter.id}`}
          userId={ctx.actor.id}
          tenantId={ctx.tenantId}
          meterId={meter.id}
        />
        <dl className="meter-details">
          <div>
            <dt>Geräte-ID</dt>
            <dd>{meter.externalDeviceId ?? "—"}</dd>
          </div>
          <div>
            <dt>Einheit</dt>
            <dd>{unitLabel(meter.measurementUnit)}</dd>
          </div>
          <div>
            <dt>Installation</dt>
            <dd>{calendarDate(meter.installedAt, timeZone)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{meter.status}</dd>
          </div>
        </dl>
      </section>
      <h2 className="section-title">Letzte 48 Messwerte</h2>
      <UtilityOverview
        tenantId={ctx.tenantId}
        meterId={meter.id}
        report={detail.report}
      />
      <DeviceCapabilityPanel capability={capability} />
      {["SUPER_ADMIN", "TENANT_ADMIN"].includes(ctx.actor.role) && (
        <MeterReplacementForm oldMeterId={meter.id} tenantId={ctx.tenantId} />
      )}
      {["SUPER_ADMIN", "TENANT_ADMIN"].includes(ctx.actor.role) && (
        <UtilitySettings
          meterId={meter.id}
          tenantId={ctx.tenantId}
          utility={meter.type}
          config={detail.config}
        />
      )}
      <section className="panel">
        <h2>Tarifhistorie</h2>
        {detail.tariffs.length ? (
          detail.tariffs.map((t) => (
            <p key={t.id}>
              {t.scope}: {dateTime(t.from, timeZone)} bis{" "}
              {t.to ? dateTime(t.to, timeZone) : "offen"} ({timeZone}) ·{" "}
              {decimal(t.price, 6)} €/{unitLabel(t.unit)} +{" "}
              {decimal(t.basePerDay, 6)} €/Tag{" "}
              {t.condition
                ? `· Zustandszahl ${t.condition}, Brennwert ${t.calorific} kWh/m³`
                : ""}
            </p>
          ))
        ) : (
          <p>Keine Tarife hinterlegt.</p>
        )}
      </section>
      <section className="panel">
        <h2>Messgrößen · {typeLabels[meter.type]}</h2>
        <p>
          Letzter Messzeitpunkt ({timeZone}):{" "}
          {detail.timestamp
            ? dateTime(detail.timestamp, timeZone)
            : "Noch keine Messwerte"}
        </p>
        <dl className="meter-details">
          {detail.values.map((v) => (
            <div key={v.metric}>
              <dt>{v.label}</dt>
              <dd>
                {v.value !== null
                  ? measurement(v.value, v.unit)
                  : "Nicht verfügbar"}{" "}
                {v.value !== null ? `· ${v.quality}` : ""}
              </dd>
            </div>
          ))}
        </dl>
        {detail.alerts.map((a) => (
          <p key={a.kind}>
            {a.kind} · seit {dateTime(a.openedAt, timeZone)}
          </p>
        ))}
        <Link
          href={`/api/meters/${meter.id}/export?tenantId=${encodeURIComponent(ctx.tenantId)}&format=utility&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
        >
          Messgrößen als CSV exportieren (30 Tage)
        </Link>
      </section>
      {modbus.devices.length > 0 && (
        <ModbusConsole
          timeZone={timeZone}
          initial={JSON.parse(JSON.stringify(modbus)) as ModbusView}
        />
      )}
      <DataTable
        headers={[
          `Zeitpunkt (${timeZone})`,
          "Zählerstand",
          "Verbrauch",
          "Einheit",
          "Quelle",
          "Qualität",
        ]}
        rows={meter.readings.map((r) => ({
          id: r.id,
          cells: [
            dateTime(r.timestamp, timeZone),
            decimal(r.registerValue.toString()),
            decimal(r.consumption.toString()),
            unitLabel(r.measurementUnit),
            r.source,
            r.quality,
          ],
        }))}
      />
    </>
  );
}
