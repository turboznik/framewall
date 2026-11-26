import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { framewall } from "./plugins/framewall.ts"

const boardDir = resolve(import.meta.dirname, process.env.BOARD_DIR ?? "example-board")
const port = Number(process.env.PORT ?? 5173)
// Extra host names the server answers to (comma-separated), e.g. when it sits behind a reverse proxy.
const allowedHosts = (process.env.ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean)
// Set when the server sits behind an HTTPS reverse proxy on another port,
// so the HMR client in the browser connects to wss://<host>:<that port>.
const hmrClientPort = process.env.HMR_CLIENT_PORT ? Number(process.env.HMR_CLIENT_PORT) : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [framewall({ boardDir }), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    allowedHosts,
    hmr: {
      // Frames show build errors themselves; the overlay would also cover the canvas.
      overlay: false,
      ...(hmrClientPort ? { clientPort: hmrClientPort } : {}),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        frame: resolve(import.meta.dirname, "frame.html"),
      },
    },
  },
})
