export const attachmentMaxBytes = 10 * 1024 * 1024;
export function attachmentError(
  name: string,
  mime: string,
  bytes: Uint8Array,
): string | null {
  if (!bytes.length || bytes.length > attachmentMaxBytes)
    return "Datei leer oder größer als 10 MiB.";
  const extension = name.toLowerCase().split(".").pop();
  const allowed: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "application/pdf": ["pdf"],
    "text/plain": ["txt"],
  };
  if (!allowed[mime]?.includes(extension ?? ""))
    return "Dateityp oder Dateiendung nicht erlaubt.";
  const prefix = Array.from(bytes.slice(0, 8));
  if (mime === "image/png" && prefix.join() !== "137,80,78,71,13,10,26,10")
    return "Ungültige PNG-Datei.";
  if (
    mime === "image/jpeg" &&
    !(prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255)
  )
    return "Ungültige JPEG-Datei.";
  if (
    mime === "application/pdf" &&
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  )
    return "Ungültige PDF-Datei.";
  if (mime === "text/plain") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return "Text muss UTF-8 sein.";
    }
    if (
      bytes.includes(0) ||
      (bytes[0] === 77 && bytes[1] === 90) ||
      (bytes[0] === 127 && bytes[1] === 69)
    )
      return "Ausführbare oder binäre Datei nicht erlaubt.";
  }
  return null;
}
