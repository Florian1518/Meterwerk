/** Presentation only; financial arithmetic stays in Decimal on the server. */
export function decimal(value: string | number, digits = 3): string {
  // Intl accepts exact decimal strings at runtime (ES2023); never coerce money to Number.
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: digits,
  }).format(value as number);
}
export function currency(value: string | number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value as number);
}
export function unitLabel(unit: string): string {
  return (
    ({ m3: "m³", "m3/h": "m³/h", C: "°C" } as Record<string, string>)[unit] ??
    unit
  );
}
export function measurement(value: string | number, unit: string): string {
  return `${decimal(value)}\u00a0${unitLabel(unit)}`;
}
export function validTimeZone(value?: string): string {
  try {
    if (value)
      return new Intl.DateTimeFormat("de-DE", {
        timeZone: value,
      }).resolvedOptions().timeZone;
  } catch {
    /* Untrusted presentation preference. */
  }
  return "Europe/Berlin";
}
export function dateTime(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: validTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "shortOffset",
  }).format(new Date(value));
}
export function calendarDate(value: string | Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: validTimeZone(timeZone),
    dateStyle: "medium",
  }).format(new Date(value));
}
/** datetime-local fields explicitly labelled UTC must not use the browser zone. */
export function utcInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value))
    throw new Error("Ungültiger UTC-Zeitpunkt");
  return new Date(`${value}Z`).toISOString();
}
