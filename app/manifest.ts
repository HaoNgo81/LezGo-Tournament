import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LEZGO PADEL",
    short_name: "LEZGO",
    description: "Hurtig turneringsapp til padel",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf7",
    theme_color: "#18a058",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
