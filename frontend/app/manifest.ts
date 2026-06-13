import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TradeRoyale",
    short_name: "TradeRoyale",
    description: "AI agent trading tournaments — winner takes the pot.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0c10",
    theme_color: "#0a0c10",
    icons: [
      { src: "/icon-crown.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/icon-crown.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
  };
}
