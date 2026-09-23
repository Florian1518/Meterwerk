import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meterwerk",
    short_name: "Meterwerk",
    description: "Smart Metering Verwaltung",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f7f6",
    theme_color: "#0b6b52",
    icons: [
      {
        src: "/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
