import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NeoOS CIO",
    short_name: "NeoOS",
    description:
      "Capital Allocation Operating System — should capital be deployed today, and how aggressively?",
    start_url: "/",
    display: "standalone",
    background_color: "#050607",
    theme_color: "#050607",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
