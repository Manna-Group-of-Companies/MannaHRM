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
  /* Absolute, against this file rather than the shell's cwd. Tailwind resolves
     content globs from wherever it was started, and the build is started from
     the repo root (`vite build client`) — relative globs would match nothing
     there and quietly emit a stylesheet with no utilities in it, which looks
     like a broken page rather than a broken path. */
  content: [
    `${import.meta.dirname}/index.html`,
    `${import.meta.dirname}/src/**/*.{js,jsx}`,
  ],
  theme: {
    extend: {
      /* **The roles. The values are in `src/styles/themes.css`.**

         Every entry below resolves to a custom property, so this file names
         what a colour is *for* and the theme file decides what it is. Four
         palettes ship — harbour (the default blue), graphite, ember and iris
         — and a fifth is a block in that file and nothing here.

         `<alpha-value>` is what keeps `bg-brand-soft/60` and `text-bad/70`
         working; it is also why nothing may call `theme(colors.x)` in
         hand-written CSS any more. Use `rgb(var(--x))` there instead. */
      colors: {
        /* `deep` is for text on `soft`; `tint` is for a border on it. `dark` is
           the one that works both ways — text on white and white on it are the
           same ratio — so it is the fill of every primary button and the colour
           of every selected-tab label. `lift` is the only one for dark chrome. */
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          dark: "rgb(var(--brand-dark) / <alpha-value>)",
          deep: "rgb(var(--brand-deep) / <alpha-value>)",
          soft: "rgb(var(--brand-soft) / <alpha-value>)",
          tint: "rgb(var(--brand-tint) / <alpha-value>)",
          lift: "rgb(var(--brand-lift) / <alpha-value>)",
        },
        /* **The logo's own orange, and nothing else's.** The app is blue; the
           Manna wordmark is not, and was never meant to move with it. It is a
           separate token rather than a leftover `brand` step so that the next
           person restyling the interface changes `brand` and leaves the mark
           alone — which is the mistake this token exists to make impossible.

           It is a literal here rather than a themed variable for the same
           reason: a mark that changed colour with the interface would not be
           the mark. Used by `.mark .o` and by nothing else. Do not reach for it
           as a highlight, a warning or an accent: it is 3.1:1 on white — WCAG
           exempts brand marks from the contrast minimums — and not fine for
           anything a person has to read or press. */
        manna: "#EF6C29",
        char: "rgb(var(--char) / <alpha-value>)",
        nav: {
          DEFAULT: "rgb(var(--nav) / <alpha-value>)",
          2: "rgb(var(--nav-2) / <alpha-value>)",
          3: "rgb(var(--nav-3) / <alpha-value>)",
          ink: "rgb(var(--nav-ink) / <alpha-value>)",
        },
        page: "rgb(var(--page) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        /* `line` and `2` divide things; `ctl` is the edge of a control somebody
           has to find before they can use it, and that is a different job with
           a different bar. WCAG 1.4.11 asks 3:1 of anything drawing the
           boundary of a UI component. Dividers stay quiet; controls get the
           contrast. */
        line: {
          DEFAULT: "rgb(var(--line) / <alpha-value>)",
          2: "rgb(var(--line-2) / <alpha-value>)",
          ctl: "rgb(var(--line-ctl) / <alpha-value>)",
        },
        /* `ink-3` names every micro-label, column head and count in the app, so
           it is the neutral most at risk of being chosen for looks. Every step
           clears 4.5:1 on white, on `wash`, on `page` and on `rule` — in all
           four palettes, and `npm run contrast` is what proves it. */
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          2: "rgb(var(--ink-2) / <alpha-value>)",
          3: "rgb(var(--ink-3) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          wash: "rgb(var(--accent-wash) / <alpha-value>)",
        },
        live: {
          DEFAULT: "rgb(var(--live) / <alpha-value>)",
          /* The hover fill of a Generate button. It was a literal `#19643E`
             sitting on one rule, which is how a palette acquires a colour
             nobody can restyle. */
          dark: "rgb(var(--live-dark) / <alpha-value>)",
          wash: "rgb(var(--live-wash) / <alpha-value>)",
        },
        /* "Partial" is the brand on purpose — work in progress is the most
           common state on this page, and it is the one that should look like
           the product. */
        part: {
          DEFAULT: "rgb(var(--part) / <alpha-value>)",
          wash: "rgb(var(--part-wash) / <alpha-value>)",
        },
        /* `bad`, not `none`. Tailwind ships static `-none` utilities for fill,
           outline, border-style and box-shadow, and a colour by that name makes
           every one of them ambiguous — `fill-none` on the nav icons resolved
           to `fill: #A62F26` and drew them as solid red blobs. Do not name a
           colour after a CSS keyword.

           `tint`, `deep` and `faint` were three literals on two rules before:
           the border, the text and the fill of a refusal notice. */
        bad: {
          DEFAULT: "rgb(var(--bad) / <alpha-value>)",
          wash: "rgb(var(--bad-wash) / <alpha-value>)",
          tint: "rgb(var(--bad-tint) / <alpha-value>)",
          deep: "rgb(var(--bad-deep) / <alpha-value>)",
          faint: "rgb(var(--bad-faint) / <alpha-value>)",
        },
        skip: {
          DEFAULT: "rgb(var(--skip) / <alpha-value>)",
          wash: "rgb(var(--skip-wash) / <alpha-value>)",
        },
        /* The week-off bar on the calendar. A flat colour rather than a
           {DEFAULT, wash} pair: it is only ever a filled block with white text
           on it, and a wash half nothing draws is a token to keep in step for
           nothing. See `--rest` in themes.css for why the hue moves per
           palette. */
        rest: "rgb(var(--rest) / <alpha-value>)",
        wash: "rgb(var(--wash) / <alpha-value>)",
        rule: "rgb(var(--rule) / <alpha-value>)",
        /* Factor HR's own blue, and only the "All" dot on a status filter wears
           it. A flat colour rather than a `{DEFAULT, wash}` pair: the wash half
           had no user left, and it was the one pairing in this palette that
           missed AA at 4.43:1. As a dot it clears 1.4.11's 3:1 easily, which is
           the bar a dot actually has to meet. */
        info: "rgb(var(--info) / <alpha-value>)",
        /* The empty half of a coverage bar. */
        track: "rgb(var(--track) / <alpha-value>)",
        /* The connection dots in the top bar. They sit on dark chrome, so they
           are the bright end of each hue rather than the `live` / `bad` tokens,
           which are chosen to be read on white — and they move with the chrome,
           which is why they are tokens rather than the literals they were. */
        beacon: {
          DEFAULT: "rgb(var(--beacon) / <alpha-value>)",
          live: "rgb(var(--beacon-live) / <alpha-value>)",
          bad: "rgb(var(--beacon-bad) / <alpha-value>)",
        },
      },
      /* Tailwind's preflight gives every element `border-color: #E5E7EB`, so a
         bare `border` utility with no colour beside it draws in a grey that no
         palette here owns. Pointing the default at `line` means the handful of
         such places follow the theme like everything else. */
      borderColor: { DEFAULT: "rgb(var(--line))" },
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
      /* **The type scale.** Twelve steps, and every size in the app is one of
         them.

         It was forty-five before. Not forty-five deliberate sizes — forty-five
         values typed one screen at a time, of which `.80`, `.82`, `.83`, `.84`,
         `.85` and `.86` accounted for a hundred and thirty-six uses inside a
         single pixel of each other. At the 17px root below, `.80rem` is 13.6px
         and `.86rem` is 14.6px: a difference nobody chose, nobody can see on
         its own, and everybody can see when two of them sit in one row.

         So the sizes are named by the job rather than by the number, which is
         what stops the next one being typed: there is no honest way to want a
         thirteenth step, and `text-[.83rem]` in a review now reads as obviously
         wrong rather than as one more plausible decimal.

         No line-heights attached. A `fontSize` tuple sets leading too, and this
         file's classes already set `leading-none` and `leading-[1.05]` where
         they mean it — pairing the two here would decide it twice, in two
         places, with the winner depending on utility order.

           micro  10.5px  a status line, a mono stamp, a week number
           tiny   12.2px  a badge, a count, a legend
           mini   13.1px  dense table text, a chip
           fine   13.9px  the field label under a control
           read   14.6px  a row of values — the workhorse
           norm   15.6px  matches <body>; running prose
           sub    17.9px  a panel heading
           head   20.4px  a section heading, a modal's close glyph
           fig    22.4px  the number on a tile
           title  25.5px  avatar initials
           hero   28.9px  the big number on a dashboard tile
           mega   34.0px  the profile avatar */
      fontSize: {
        micro: ".62rem",
        tiny: ".72rem",
        mini: ".77rem",
        fine: ".82rem",
        read: ".86rem",
        norm: ".92rem",
        sub: "1.05rem",
        head: "1.2rem",
        fig: "1.32rem",
        title: "1.5rem",
        hero: "1.7rem",
        mega: "2rem",
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
