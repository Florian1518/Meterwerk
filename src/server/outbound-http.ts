import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";

export function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 2 || b === 168)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const normalized = address.toLowerCase();
  // Public global unicast only; exclude transition mechanisms and documentation.
  return (
    isIP(address) !== 6 ||
    !/^[23]/.test(normalized) ||
    normalized.startsWith("2001:") ||
    normalized.startsWith("2002:")
  );
}

export function validateOutboundUrl(raw: string) {
  const url = new URL(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    url.username ||
    url.password ||
    url.hash ||
    ![
      "https:",
      ...(process.env.NODE_ENV !== "production" ? ["http:"] : []),
    ].includes(url.protocol) ||
    (!isIP(host) &&
      (!host.includes(".") ||
        /\.(localhost|local|internal|lan|home|test|invalid)\.?$/.test(host))) ||
    (isIP(host) && isPrivateAddress(host))
  )
    throw new Error("Outbound destination blocked");
  return url;
}

export async function resolvePublicTarget(url: URL) {
  validateOutboundUrl(url.toString());
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateAddress(address))
  )
    throw new Error("Outbound destination blocked");
  return addresses[0];
}

// Resolve exactly once and pin the socket. Host header, TLS SNI and certificate
// validation retain the original hostname. Redirects are never followed.
export async function publicRequest(
  raw: string | URL,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: Uint8Array | string;
    maxResponseBytes?: number;
    timeoutMs?: number;
  } = {},
) {
  const url = validateOutboundUrl(String(raw));
  const timeoutMs = options.timeoutMs ?? 8000;
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const address = await Promise.race([
    resolvePublicTarget(url),
    new Promise<never>((_, reject) => {
      dnsTimer = setTimeout(
        () => reject(new Error("Outbound timeout")),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(dnsTimer));
  return new Promise<Response>((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: options.method ?? "GET",
        headers: options.headers,
        agent: false,
        family: address.family,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("error", reject);
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > (options.maxResponseBytes ?? 65536))
            req.destroy(new Error("Outbound response too large"));
          else chunks.push(chunk);
        });
        res.on("end", () => {
          const status = res.statusCode ?? 502;
          if (status >= 300 && status < 400) {
            reject(new Error("Outbound redirect blocked"));
            return;
          }
          resolve(
            new Response(
              [204, 205, 304].includes(status) ? null : Buffer.concat(chunks),
              { status },
            ),
          );
        });
      },
    );
    const deadline = setTimeout(
      () => req.destroy(new Error("Outbound timeout")),
      timeoutMs,
    );
    req.on("error", reject);
    req.on("close", () => clearTimeout(deadline));
    req.end(options.body);
  });
}
