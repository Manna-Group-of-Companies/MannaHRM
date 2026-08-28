/** @type {import('tailwindcss').Config} */

/* Manna Group. Orange and charcoal off the logo; the neutrals are warmed a
   touch towards the orange so the greys read as chosen rather than default.

   Deliberately single-theme and light — no `darkMode`. The whole point of this
   build is a side-by-side comparison with Factor HR, which is light-only, and a
   dark variant would make the two harder to compare rather than easier. */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#EE6A24", dark: "#C9541A", soft: "#FDF1EA" },
        char: "#414042",
        nav: { DEFAULT: "#3A3A3D", 2: "#2E2E31", ink: "#B9B7B4" },
        page: "#F4F2F0",
        card: "#FFFFFF",
        line: { DEFAULT: "#E6E2DE", 2: "#CFC9C3" },
        ink: { DEFAULT: "#26252A", 2: "#5C5A60", 3: "#918D93" },
        accent: { DEFAULT: "#A8481A", wash: "#FDF1EA" },
        live: { DEFAULT: "#1F7A4D", wash: "#E4F3EB" },
        /* "Partial" is the brand orange on purpose — work in progress is the
           most common state on this page, and it is the one that should look
           like Manna. */
        part: { DEFAULT: "#A8481A", wash: "#FDF1EA" },
        none: { DEFAULT: "#A32F27", wash: "#FAE7E5" },
        skip: { DEFAULT: "#6E6A70", wash: "#EFECEA" },
        wash: "#FAF8F6",
        rule: "#F1EEEC",
      },
      fontFamily: {
        display: ['"Archivo"', '"Helvetica Neue"', "Arial", "sans-serif"],
        body: ['"IBM Plex Sans"', "-apple-system", '"Segoe UI"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
