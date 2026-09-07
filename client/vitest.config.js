import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/* ---------------------------------------------------------------------------
   Separate from vite.config.js on purpose.

   That file's job is the dev proxy onto the ERPNext site, and a test run has no
   business carrying an address for it — a suite that can reach the live site is
   a suite that can be made to write to it. Nothing here knows where the site
   is; `tests/setup.js` replaces axios outright, so a call that escapes a mock
   fails loudly rather than travelling.
   --------------------------------------------------------------------------- */

const HERE = import.meta.dirname;

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: { "@": path.resolve(HERE, "./src") },
		extensions: [".mjs", ".js", ".jsx", ".json"],
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./tests/setup.js"],
		include: ["tests/**/*.test.{js,jsx}"],
		/* Every file gets its own module registry, which is what makes the store
		   fresh per file. The store is module state — one `configureStore` at
		   import — so two files sharing a worker would share a signed-in user and
		   an employee list, and the second would pass because the first ran. */
		isolate: true,
		restoreMocks: true,
	},
});
