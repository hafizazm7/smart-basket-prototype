import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Basket",
    short_name: "Smart Basket",
    description: "Compare the shops you use and build the cheapest practical basket.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#ffffff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
