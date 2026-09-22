export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  delimiter: ";" | ",";
};

function countOutsideQuotes(line: string, delimiter: "," | ";") {
  let quoted = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && line[i + 1] === '"' && quoted) i++;
    else if (line[i] === '"') quoted = !quoted;
    else if (!quoted && line[i] === delimiter) count++;
  }
  return count;
}

export function parseCsv(text: string): ParsedCsv {
  const content = text.replace(/^\uFEFF/, "");
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    countOutsideQuotes(firstLine, ";") >= countOutsideQuotes(firstLine, ",")
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i]!;
    if (char === '"') {
      if (quoted && content[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && content[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted)
    throw new Error("CSV enthält ein nicht geschlossenes Anführungszeichen.");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  const headers = (rows.shift() ?? []).map((value) => value.trim());
  if (headers.length < 2)
    throw new Error("CSV benötigt eine Kopfzeile mit mindestens zwei Spalten.");
  if (headers.some((header) => !header))
    throw new Error("CSV-Spaltenüberschriften dürfen nicht leer sein.");
  if (
    new Set(headers.map((header) => header.toLocaleLowerCase("de-DE"))).size !==
    headers.length
  )
    throw new Error("CSV-Spaltenüberschriften müssen eindeutig sein.");
  if (rows.some((values) => values.length !== headers.length))
    throw new Error(
      "Mindestens eine CSV-Zeile hat eine andere Spaltenanzahl als die Kopfzeile.",
    );
  return { headers, rows, delimiter };
}

export function parseGermanDecimal(value: string): string | null {
  const normalized = value.trim().replace(/\s/g, "").replace(/[€]/g, "");
  if (!normalized) return null;
  let plain: string;
  if (normalized.includes(",")) {
    if (
      normalized.includes(".") &&
      !/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)
    )
      return null;
    plain = normalized.replace(/\./g, "").replace(",", ".");
  } else plain = normalized;
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(plain)) return null;
  return plain;
}

export function parseImportTimestamp(value: string): Date | null {
  const text = value.trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
    const [, day, month, year] = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)!;
    return validUtc(Number(year), Number(month), Number(day), 0, 0, 0)
      ? new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
      : null;
  }
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate)
    return validUtc(
      Number(isoDate[1]),
      Number(isoDate[2]),
      Number(isoDate[3]),
      0,
      0,
      0,
    )
      ? new Date(
          Date.UTC(
            Number(isoDate[1]),
            Number(isoDate[2]) - 1,
            Number(isoDate[3]),
          ),
        )
      : null;
  // German date/time is accepted only with an explicit UTC offset to avoid
  // ambiguous local times around daylight-saving transitions.
  const german = text.match(
    /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})$/i,
  );
  if (german) {
    const [, day, month, year, hour, minute, second = "0", zone] = german;
    if (
      !validUtc(
        Number(year),
        Number(month),
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ) ||
      !validOffset(zone!)
    )
      return null;
    const isoZone =
      zone!.toUpperCase() === "Z"
        ? "Z"
        : zone!.includes(":")
          ? zone
          : `${zone!.slice(0, 3)}:${zone!.slice(3)}`;
    const date = new Date(
      `${year}-${month}-${day}T${hour}:${minute}:${second}${isoZone}`,
    );
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) return null;
  const isoParts = text.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i,
  );
  if (
    !isoParts ||
    !validUtc(
      Number(isoParts[1]),
      Number(isoParts[2]),
      Number(isoParts[3]),
      Number(isoParts[4]),
      Number(isoParts[5]),
      Number(isoParts[6] ?? 0),
    ) ||
    !validOffset(isoParts[7]!)
  )
    return null;
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function validUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
) {
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  )
    return false;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validOffset(value: string) {
  if (/^Z$/i.test(value)) return true;
  const match = value.match(/^[+-](\d{2}):?(\d{2})$/);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}
