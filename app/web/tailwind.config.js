/** @type {import('tailwindcss').Config} */

/* Blue and white.

   Asked for on 29 Aug 2026, replacing the orange and charcoal that came off the
   Manna logo. Worth writing down that it *was* the logo's palette, because the
   next person to open this file will otherwise reintroduce it from the letterhead.

   Every token name below is unchanged from that palette — `brand.deep` is still
   "text on `brand.soft`", `nav.2` is still "the darkest of the three chrome
   greys". Only the values moved. That is the whole reason the restyle was a
   token change and not four hundred edits: the stylesheet names roles, so a
   palette swap is this file.

   What the change actually forced, beyond the hues:

   1. **`brand.lift` is new, and the rail needs it.** The old orange sat on a
      plum charcoal at 4.3:1 — a warm accent against its own complement. A blue
      brand on a blue chrome is the same hue twice, and the active-rail marker
      fell to 2.9:1, under the 3:1 a non-text indicator has to clear. `lift` is
      the brand's lit end and reads at 5:1 on the rail. Use it *only* on the
      dark chrome; on white it is 2.9:1 and fails.
   2. **The neutrals turned cool.** They were warm greys chosen to sit under an
      orange. Left warm they read as dirty next to a blue, so `page`, `wash`,
      `rule`, the `line` ramp and the `ink` ramp all carry a little blue now.
      Contrast was re-checked pairing by pairing, not eyeballed: every neutral
      still clears 4.5:1 on the surface it is used on, and `line.ctl` still
      clears 3:1.
   3. **`info` stopped being an exception.** It is Factor HR's own blue, kept
      as a literal copy because on their screens the colour is the thing being
      read. Against an orange app it was unmistakably "theirs"; against a blue
      one it is 1.2:1 from `brand.dark` — indistinguishable. So the Salary
      Master button that used it moved to the brand ramp, and `info` now names
      one thing only: the blue "All" dot in a status filter, where it still
      separates from the green and the red beside it.

   Still deliberately single-theme and light — no `darkMode`. The whole point of
   this build is a side-by-side comparison with Factor HR, which is light-only,
   and a dark variant would make the two harder to compare rather than easier. */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        /* `deep` is for text on `soft`; `tint` is for a border on it. `dark` is
           the one that works both ways — text on white and white on it are the
           same ratio — so it is the fill of every primary button and the colour
           of every selected-tab label. `lift` is the only one for dark chrome. */
        brand: {
          DEFAULT: "#2C6FD1", dark: "#175FC4", deep: "#0E3F86",
          soft: "#EAF2FD", tint: "#C3DAF7", lift: "#5B9BEE",
        },
        /* **The logo's own orange, and nothing else's.** The app is blue; the
           Manna wordmark is not, and was never meant to move with it. It is a
           separate token rather than a leftover `brand` step so that the next
           person restyling the interface changes `brand` and leaves the mark
           alone — which is the mistake this token exists to make impossible.

           Used by `.mark .o` and by nothing else. Do not reach for it as a
           highlight, a warning or an accent: it is 3.1:1 on white and 2.3:1 on
           the rail, which is fine for a logotype — WCAG exempts brand marks
           from the contrast minimums — and not fine for anything a person has
           to read or press. */
        manna: "#EF6C29",
        char: "#16233A",
        nav: { DEFAULT: "#1B2B47", 2: "#132038", 3: "#263A5C", ink: "#B9C7DD" },
        page: "#F3F6FA",
        card: "#FFFFFF",
        /* `line` and `2` divide things; `ctl` is the edge of a control somebody
           has to find before they can use it, and that is a different job with
           a different bar. WCAG 1.4.11 asks 3:1 of anything drawing the
           boundary of a UI component, and `2` is 1.6:1 on white — so every
           input, select and toolbar button in this app had an edge a reader
           has to already know is there. `ctl` is 3.5:1 on white, 3.3:1 on
           `wash` and 3.2:1 on `page`, which are the three surfaces a control
           actually sits on here.

           It is the ink ramp lightened rather than `2` darkened, on purpose:
           darkening `2` would also darken every panel divider and fieldset,
           and a screen of forty boxes with heavy edges reads worse, not
           better. Dividers stay quiet; controls get the contrast. */
        line: { DEFAULT: "#E0E7F1", 2: "#C7D2E2", ctl: "#7C8AA3" },
        /* `ink-3` names every micro-label, column head and count in the app,
           so it is the neutral most at risk of being chosen for looks. Every
           step here clears 4.5:1 on white, on `wash`, on `page` and on `rule`. */
        ink: { DEFAULT: "#141D2B", 2: "#465468", 3: "#5F6C82" },
        accent: { DEFAULT: "#155BB5", wash: "#EAF2FD" },
        live: { DEFAULT: "#15733F", wash: "#E1F2E8" },
        /* "Partial" is the brand on purpose — work in progress is the most
           common state on this page, and it is the one that should look like
           the product. It was the brand orange; it is the brand blue now, and
           still the same colour as `accent` as it was before. */
        part: { DEFAULT: "#155BB5", wash: "#EAF2FD" },
        /* `bad`, not `none`. Tailwind ships static `-none` utilities for
           fill, outline, border-style and box-shadow, and a colour by that
           name makes every one of them ambiguous — `fill-none` on the nav
           icons resolved to `fill: #A62F26` and drew them as solid red
           blobs. Do not name a colour after a CSS keyword. */
        bad: { DEFAULT: "#B02A21", wash: "#FBE8E6" },
        skip: { DEFAULT: "#5F6C82", wash: "#EDF1F7" },
        wash: "#F8FAFD",
        rule: "#EEF2F8",
        /* Factor HR's own blue, and now only the "All" dot on a status filter
           wears it — see §3 of the note at the head of this file. */
        info: { DEFAULT: "#2E6BD1", wash: "#E9F0FC" },
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        md: "10px",
        lg: "14px",
      },
      boxShadow: {
        /* Four steps and no more. A screen that needs a fifth is a screen with
           something floating that should have been beside rather than above. */
        /* `raise`, not `card` — same trap as `bad` above, one step along: a
           `card` colour already exists, so `shadow-card` read as a shadow
           *colour* and painted the panel shadow white. */
        raise: "0 1px 2px rgba(20, 29, 43, .05), 0 1px 3px rgba(20, 29, 43, .04)",
        lift: "0 2px 4px rgba(20, 29, 43, .06), 0 6px 16px rgba(20, 29, 43, .07)",
        pop: "0 6px 20px rgba(20, 29, 43, .13), 0 1px 3px rgba(20, 29, 43, .08)",
        modal: "0 24px 56px rgba(0, 0, 0, .26)",
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
