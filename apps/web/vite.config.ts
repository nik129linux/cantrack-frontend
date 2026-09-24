import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "CanTrack",
        short_name: "CanTrack",
        description: "Operations software for neighbourhood dog walkers.",
        theme_color: "#20b957",
        background_color: "#20b957",
        display: "standalone",
        icons: [],
      },
    }),
  ],
});
