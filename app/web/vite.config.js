import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/* The page and the site have to look like one origin to the browser — Frappe
   pins its CORS header to its own, so a direct call from :5173 is refused
   before ERPNext ever sees it. In development Vite proxies /api to serve.py,
   which is the process that holds the token; in production serve.py serves
   `dist/` itself and the proxy is the same one. See app/README.md. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
    /* `.jsx` is not in Vite's default resolve list, and every component here is
       one. Without this an `import App from "./App"` resolves to nothing. */
    extensions: [".mjs", ".js", ".jsx", ".json"],
  },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8770", changeOrigin: true } },
  },
  build: { outDir: "dist", sourcemap: true },
});
