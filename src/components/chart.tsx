"use client";
import { useState } from "react";
import { number } from "@/lib/utils";
export function ConsumptionChart({
  days,
  unit,
}: {
  days: { date: string; value: number }[];
  unit: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...days.map((day) => day.value), 1) * 1.15;
  const points = days
    .map(
      (day, i) =>
        `${40 + (i * 720) / (days.length - 1)},${210 - (day.value / max) * 175}`,
    )
    .join(" ");
  return (
    <div className="chart">
      <div className="chart-tooltip" aria-live="polite">
        {selected === null
          ? "Tageswerte · letzte 30 Tage"
          : `${new Date(days[selected].date).toLocaleDateString("de-DE", { timeZone: "UTC" })}: ${number(days[selected].value)} ${unit}`}
      </div>
      <svg
        viewBox="0 0 800 250"
        role="img"
        aria-label={`Verbrauchsverlauf der letzten 30 Tage in ${unit}`}
      >
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#10b981" stopOpacity=".2" />
            <stop offset="1" stopColor="#10b981" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="40"
              x2="775"
              y1={35 + (i * 175) / 3}
              y2={35 + (i * 175) / 3}
              stroke="#e8eeeb"
              strokeDasharray="4 5"
            />
            <text x="0" y={39 + (i * 175) / 3} fill="#87948d" fontSize="10">
              {number(max * (1 - i / 3), 0)}
            </text>
          </g>
        ))}
        <polygon points={`40,210 ${points} 760,210`} fill="url(#fill)" />
        <polyline
          points={points}
          fill="none"
          stroke="#07966f"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {days.map((day, i) => (
          <circle
            key={day.date}
            cx={40 + (i * 720) / (days.length - 1)}
            cy={210 - (day.value / max) * 175}
            r={selected === i ? 6 : 3}
            fill={selected === i ? "#065f46" : "#10b981"}
            onMouseEnter={() => setSelected(i)}
          >
            <title>{`${day.date}: ${number(day.value)} ${unit}`}</title>
          </circle>
        ))}
        {[0, 7, 14, 21, 29].map((i) => (
          <text
            key={i}
            x={40 + (i * 720) / 29}
            y="238"
            textAnchor="middle"
            fill="#87948d"
            fontSize="11"
          >
            {days[i].date.slice(8)}.{days[i].date.slice(5, 7)}.
          </text>
        ))}
      </svg>
      <details className="chart-data">
        <summary>Werte als Tabelle anzeigen</summary>
        <table>
          <caption>Täglicher Verbrauch ({unit})</caption>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <td>{day.date}</td>
                <td>{number(day.value, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
