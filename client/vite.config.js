import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/* The page and the site have to look like one origin to the browser — Frappe
   pins its CORS header to its own, so a direct call from :5173 is refused
   before ERPNext ever sees it. In development Vite proxies /api to
   server/index.js, which is the process that holds the token; in production
   that same process serves `dist/` itself and the proxy is the same one.
   See docs/DASHBOARD.md. */
/* server/dev.js starts the proxy and passes the port it settled on, because it
   steps past a busy 8770 the way Vite steps past a busy 5173. 8770 is the
   fallback, for a hand-started `npm start`. */
const PROXY_PORT = process.env.MANNA_PROXY_PORT || 8770;

/* This directory, not the shell's. Everything below is resolved against the
   file so `vite build client` from the repo root and `vite` from inside
   `client/` mean the same thing. */
const HERE = import.meta.dirname;

export default defineConfig({
  root: HERE,
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(HERE, "./src") },
    /* `.jsx` is not in Vite's default resolve list, and every component here is
       one. Without this an `import App from "./App"` resolves to nothing. */
    extensions: [".mjs", ".js", ".jsx", ".json"],
  },
  server: {
    port: 5173,
    proxy: { "/api": { target: `http://localhost:${PROXY_PORT}`, changeOrigin: true } },
  },
  build: {
    /* Out of `client/` and up to the repo root, because `server/index.js` is
       what serves it and the two halves should not have to know each other's
       shape beyond one agreed directory. `emptyOutDir` because Vite refuses to
       clear a directory outside its own root without being told to. */
    outDir: path.resolve(HERE, "../dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
