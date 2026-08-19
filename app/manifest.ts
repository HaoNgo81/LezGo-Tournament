import type { MetadataRoute } from "next";

const basePath = process.env.GITHUB_PAGES === "true" ? "/LezGo-Tournament" : "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LEZGO PADEL",
    short_name: "LEZGO",
    description: "Hurtig turneringsapp til padel",
    start_url: `${basePath}/`,
    display: "standalone",
    background_color: "#f7f1e5",
    theme_color: "#d8aa20",
    orientation: "any",
    icons: [
      {
        src: `${basePath}/app-icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/app-icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
