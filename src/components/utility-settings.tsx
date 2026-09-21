"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { UtilityType } from "@/lib/utility";
type Config = {
  offlineMinutes: number;
  highConsumption?: string;
  continuousHours: number;
  minimumFlow: string;
  maxDeltaT: number;
  returnTolerance: number;
  allowReverse: boolean;
};
export function UtilitySettings({
  meterId,
  tenantId,
  utility,
  config,
}: {
  meterId: string;
  tenantId: string;
  utility: UtilityType;
  config: Config;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function send(url: string, method: string, body: unknown) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      setMessage(
        response.ok
          ? "Gespeichert. Seite neu laden, um die aktualisierten Daten zu sehen."
          : (result.error ?? "Speichern fehlgeschlagen."),
      );
    } catch {
      setMessage("Verbindung fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel">
      <h2>Messprofil und Tarife verwalten</h2>
      <p role="status">{message}</p>
      <details>
        <summary>Alarmschwellen</summary>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void send(
              `/api/meters/${meterId}/utility?tenantId=${encodeURIComponent(tenantId)}`,
              "PUT",
              {
                offlineMinutes: Number(f.get("offlineMinutes")),
                continuousHours: Number(
                  f.get("continuousHours") ?? config.continuousHours,
                ),
                minimumFlow: String(f.get("minimumFlow") ?? config.minimumFlow),
                maxDeltaT: Number(f.get("maxDeltaT") ?? config.maxDeltaT),
                returnTolerance: Number(
                  f.get("returnTolerance") ?? config.returnTolerance,
                ),
                allowReverse: f.get("allowReverse") === "on",
                ...(f.get("highConsumption")
                  ? { highConsumption: String(f.get("highConsumption")) }
                  : {}),
              },
            );
          }}
        >
          <label>
            Offline nach Minuten{" "}
            <input
              required
              type="number"
              name="offlineMinutes"
              min="1"
              max="10080"
              defaultValue={config.offlineMinutes}
            />
          </label>
          <label>
            Hoher Intervallverbrauch (
            {["WATER", "GAS"].includes(utility) ? "m3" : "kWh"}; leer =
            deaktiviert){" "}
            <input
              name="highConsumption"
              inputMode="decimal"
              defaultValue={config.highConsumption}
            />
          </label>
          {utility === "WATER" && (
            <>
              <label>
                Dauerverbrauch ab Stunden{" "}
                <input
                  name="continuousHours"
                  type="number"
                  min="1"
                  max="168"
                  defaultValue={config.continuousHours}
                />
              </label>
              <label>
                Mindestdurchfluss m3/h{" "}
                <input
                  name="minimumFlow"
                  inputMode="decimal"
                  defaultValue={config.minimumFlow}
                />
              </label>
            </>
          )}
          {utility === "HEAT" && (
            <>
              <label>
                Maximales Delta-T (K){" "}
                <input
                  name="maxDeltaT"
                  type="number"
                  min="1"
                  max="200"
                  defaultValue={config.maxDeltaT}
                />
              </label>
              <label>
                Rücklauftoleranz (K){" "}
                <input
                  name="returnTolerance"
                  type="number"
                  min="0"
                  max="50"
                  defaultValue={config.returnTolerance}
                />
              </label>
            </>
          )}
          {utility !== "ELECTRICITY" && (
            <label>
              <input
                type="checkbox"
                name="allowReverse"
                defaultChecked={config.allowReverse}
              />{" "}
              Rückfluss zulässig
            </label>
          )}
          <Button type="submit" disabled={pending}>
            Schwellen speichern
          </Button>
        </form>
      </details>
      <details>
        <summary>Tarif hinzufügen / zukünftigen Tarifwechsel planen</summary>
        <p>
          Preise in EUR, Dezimalpunkt verwenden. Zeitangaben UTC. Historische
          Preise sind unveränderlich. Ein offener Vorgängertarif endet zum
          zukünftigen Wechselzeitpunkt.
        </p>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void send(
              `/api/utility/tariffs?tenantId=${encodeURIComponent(tenantId)}`,
              "POST",
              {
                ...(f.get("scope") === "meter" ? { meterId } : {}),
                utility,
                unit: f.get("unit"),
                price: f.get("price"),
                basePerDay: f.get("basePerDay"),
                validFrom: new Date(`${f.get("from")}:00Z`).toISOString(),
                ...(f.get("to")
                  ? { validTo: new Date(`${f.get("to")}:00Z`).toISOString() }
                  : {}),
                ...(f.get("condition")
                  ? { condition: f.get("condition") }
                  : {}),
                ...(f.get("calorific")
                  ? { calorific: f.get("calorific") }
                  : {}),
              },
            );
          }}
        >
          <label>
            Geltungsbereich{" "}
            <select name="scope">
              <option value="meter">Dieser Zähler</option>
              <option value="tenant">Mandant · dieses Medium</option>
            </select>
          </label>
          <label>
            Ab (UTC) <input required name="from" type="datetime-local" />
          </label>
          <label>
            Bis (UTC, optional) <input name="to" type="datetime-local" />
          </label>
          <label>
            Preiseinheit{" "}
            <select name="unit">
              {(utility === "WATER"
                ? ["m3"]
                : utility === "GAS"
                  ? ["m3", "kWh"]
                  : utility === "HEAT"
                    ? ["kWh", "MWh"]
                    : ["kWh"]
              ).map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <label>
            Arbeitspreis €/Einheit{" "}
            <input required name="price" inputMode="decimal" />
          </label>
          <label>
            Grundpreis €/Tag{" "}
            <input
              required
              name="basePerDay"
              inputMode="decimal"
              defaultValue="0"
            />
          </label>
          {utility === "GAS" && (
            <>
              <label>
                Zustandszahl (für €/kWh erforderlich){" "}
                <input name="condition" inputMode="decimal" />
              </label>
              <label>
                Brennwert kWh/m3 (für €/kWh erforderlich){" "}
                <input name="calorific" inputMode="decimal" />
              </label>
            </>
          )}
          <Button type="submit" disabled={pending}>
            Tarif speichern
          </Button>
        </form>
      </details>
    </section>
  );
}
