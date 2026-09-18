export function csvCell(value: string) {
  const safe =
    /^[\s]*[=+@\t\r]/.test(value) ||
    (/^\s*-/.test(value) && !/^-[0-9]+(\.[0-9]+)?$/.test(value))
      ? `'${value}`
      : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function csvDocument(headers: string[], rows: string[][]) {
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n") +
    "\r\n"
  );
}
