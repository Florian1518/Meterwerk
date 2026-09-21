import { NextResponse, type NextRequest } from "next/server";
export function proxy(request: NextRequest) {
  const environment = process.env.METERWERK_ENV ?? "development";
  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    ""
  )
    .split(":")[0]
    .toLowerCase();
  const configured = (process.env.TRUSTED_HOSTS ?? "localhost,127.0.0.1")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const appHost = (() => {
    try {
      return new URL(process.env.APP_URL ?? "http://localhost:3000").hostname;
    } catch {
      return "localhost";
    }
  })();
  const trusted =
    configured.includes(host) ||
    host === appHost ||
    host.endsWith(`.${appHost}`);
  if (environment === "production" && !trusted)
    return new NextResponse("Invalid host", { status: 421 });
  if (
    environment === "production" &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
