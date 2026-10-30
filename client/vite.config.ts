import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "D&D Web",
        short_name: "D&D",
        description: "Multiplayer D&D browser RPG",
        theme_color: "#1a0a00",
        background_color: "#1a0a00",
        display: "standalone",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@dnd/shared": path.resolve(__dirname, "../shared/src/index.ts")
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/colyseus": {
        target: "ws://localhost:2567",
        ws: true
      }
    }
  }
});
