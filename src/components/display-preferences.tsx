"use client";
import { useRouter } from "next/navigation";
export function DisplayPreferences({
  theme,
  timeZone,
}: {
  theme: string;
  timeZone: string;
}) {
  const router = useRouter();
  function change(name: string, value: string) {
    document.cookie = `meterwerk_${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    if (name === "theme") document.documentElement.dataset.theme = value;
    router.refresh();
  }
  return (
    <div className="display-preferences">
      <label>
        Darstellung
        <select
          aria-label="Darstellung"
          value={theme}
          onChange={(e) => change("theme", e.target.value)}
        >
          <option value="light">Hell</option>
          <option value="dark">Dunkel</option>
          <option value="system">System</option>
        </select>
      </label>
      <label>
        Anzeigezeitzone
        <select
          aria-label="Anzeigezeitzone"
          value={timeZone}
          onChange={(e) => change("timezone", e.target.value)}
        >
          {[
            ...new Set([
              timeZone,
              "Europe/Berlin",
              "Europe/Vienna",
              "Europe/Zurich",
              "UTC",
              "America/New_York",
            ]),
          ].map((zone) => (
            <option key={zone}>{zone}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
