// PDF text operands only: never interpret HTML, templates, URLs or file paths.
export function pdfText(value: string) {
  return value
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/[^\x20-\xff]/g, "?")
    .replace(/[()\\]/g, "\\$&");
}
export function downloadDisposition(name: string) {
  const safe = name
    .replace(/[\x00-\x1f\x7f/\\\u202a-\u202e\u2066-\u2069]/g, "_")
    .slice(0, 180);
  return `attachment; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
