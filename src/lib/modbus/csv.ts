import { csvCell } from "../data-export";
export { csvCell } from "../data-export";
export function csvDocument(headers: string[], rows: string[][]) {
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n") +
    "\r\n"
  );
}
