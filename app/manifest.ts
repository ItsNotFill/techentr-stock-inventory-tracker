import type { MetadataRoute } from "next";

/**
 * The web app manifest, served at /manifest.webmanifest. A manifest cannot read
 * CSS variables, so the two colours are literal hex: the one place besides
 * `viewport.themeColor` in app/layout.tsx where a hex value is allowed.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Restaurant Inventory",
    short_name: "Inventory",
    description: "Stock, recipes and unexplained usage for restaurants",
    id: "/",
    // Signed-out visitors are sent on to /login by proxy.ts.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F5F0", // --background in app/globals.css (the page)
    theme_color: "#FFFFFF", // --card in app/globals.css: the phone's top bar (components/shell/app-nav.tsx)
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
