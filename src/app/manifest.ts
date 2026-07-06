import type { MetadataRoute } from "next";

/** Web app manifest — makes Clarity installable as a home-screen app.
 *  Served at /manifest.webmanifest and linked automatically by Next. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clarity — financial rescue, in focus",
    short_name: "Clarity",
    description:
      "A calm, honest view of your money and the plan to get back to solid ground.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
