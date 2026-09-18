import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Meterwerk · Energie im Blick",
  description: "Zentrale Smart-Metering-Verwaltung",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
