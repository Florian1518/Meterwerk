import type { Metadata } from "next";
import "./globals.css";
import { presentation } from "@/server/presentation";
import { PwaRuntime } from "@/components/pwa-runtime";
export const metadata: Metadata = {
  title: "Meterwerk · Energie im Blick",
  description: "Zentrale Smart-Metering-Verwaltung",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme } = await presentation();
  return (
    <html lang="de" data-theme={theme}>
      <body>
        <PwaRuntime />
        {children}
      </body>
    </html>
  );
}
