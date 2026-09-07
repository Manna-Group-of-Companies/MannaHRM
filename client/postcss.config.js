/* The Tailwind config is imported rather than discovered.
 *
 * Tailwind looks for `tailwind.config.js` from the shell's cwd, and the build
 * runs from the repo root (`vite build client`) — where there is no such file.
 * Not finding one is not an error to Tailwind: it falls back to its defaults
 * and emits a stylesheet missing every custom colour this site is drawn in,
 * which reads as a broken page rather than a broken path.
 *
 * Handing it the object skips path resolution altogether. The obvious fix —
 * passing a `config:` path built from `import.meta.url` — is the one that does
 * not survive Windows: `new URL(...).pathname` yields `/C:/MANNA%20DEVELOPES/…`,
 * with a leading slash and the space still escaped, and Tailwind loads nothing.
 */
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

import tailwindConfig from "./tailwind.config.js";

export default {
  plugins: [tailwindcss(tailwindConfig), autoprefixer()],
};
