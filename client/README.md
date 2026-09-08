# The HR dashboard

React 18 · JavaScript (JSX) · Redux Toolkit · axios · Vite · Tailwind.

Ninety-odd screens rebuilt from Factor HR's own, over the ERPNext site at
`mannarubber.m.frappe.cloud`.

```bash
cp .env.example .env
npm install
npm run dev            # http://localhost:5173
npm test               # 569, jsdom
npm run contrast       # the palette, every pairing, AA
npm run shots          # the app in Chrome, photographed — needs `npm run dev` up
```

`npm run shots` is the check jsdom cannot make: it renders every module *signed
in* against a stubbed site, at three widths, and fails if a page throws, the
document scrolls sideways, or `--brand` resolves to something other than the
palette. It holds no credential — the site
is intercepted in the browser. `npm run smoke` is the opposite bargain: the real
site, a deliberately wrong password, and no data.

Sign in with your own ERPNext user.

---

## ERPNext is the server

There is no API of ours in between, and that is the whole architecture in one
sentence. The doctypes are the schema, ERPNext's roles are the permissions, and
the rules that decide what somebody is paid are Server Scripts in `manna_hr/`
running on the site's own clock — see [CLAUDE.md](../CLAUDE.md) §1.

So this bundle holds no key and no allowlist. It holds the person's own Frappe
session, every read and write is logged on the site as *them*, and what they may
do is what their roles say. **Nothing in `src/` is a security boundary**, because
a rule enforced in a browser is a suggestion to anyone holding `curl`. If you
find yourself about to add one, the rule belongs on the site.

`src/api/client.js` is the only file that opens a connection. Everything else
goes through it.

| | |
|---|---|
| `GET /api/method/frappe.auth.get_logged_user` | who the session belongs to |
| `POST /api/method/login` · `/api/method/logout` | the session itself |
| `GET /api/resource/:doctype` | a page of a list, with `fields` and `filters` |
| `GET /api/resource/:doctype/:name` | one whole document, child tables included |
| `POST` · `PUT` · `DELETE /api/resource/…` | create as a draft, one field change, one delete |
| `POST /api/method/upload_file` | one scan, multipart, always private |
| `GET /files/…` · `/private/…` | the bytes behind a `File` row |

### One origin, and it has to be

Frappe pins its CORS header to its own origin, so a page anywhere else is
refused before ERPNext ever sees the request — and a cross-origin request would
not carry the session cookie anyway.

In development `vite.config.js` proxies `/api`, `/app`, `/files` and `/private`
to the site, sets the Host and Origin it expects, and strips `Secure` off the
session cookie so a browser on `http://localhost` will keep it. Get any of those
three wrong and the sign-in appears to succeed while every request after it is
Guest — which reads on screen as a company with no employees.

`baseURL` is `""` and always will be. An absolute URL in `src/` is that
arrangement coming undone.

### The CSRF token

Frappe refuses any session write that arrives without one, and it belongs to the
session rather than to the page — so it cannot be bundled. `fetchCsrf` in
`api/client.js` tries three sources in order: `window.frappe.csrf_token` (set
when the site itself serves this page), the whitelisted method, and the desk's
bootinfo at `/app`. On this site the middle one is **not** whitelisted — checked
5 September 2026 — so `/app` is what answers. A write refused for the token
refetches it and retries once, which is safe because Frappe raises that failure
before the request does anything.

---

## Deploying it is still open

`npm run build` writes `dist/` with `base` at `/`, and the pages route on the
path — `/employees/salary-master` is an address, see `routes/router.js`. So
whatever serves this has to answer **every unmatched path with `index.html`**.

Serving it from the site itself is the arrangement this app is written for: it
makes the page and the API one origin for real and removes the dev proxy from
the picture. That needs a `website_route_rules` hook in `manna_hr/hooks.py` and
a `base` to match, and neither has been decided — so the build stays
unopinionated rather than encoding half of a choice nobody has made.

---

## What is worth knowing before changing something

**Asking for a field the site has not got fails the whole read.** Frappe answers
417 and returns nothing rather than dropping the column it did not recognise,
and `api/load.js` depends on that: it asks for a rich field list and falls back
to a short one eight times over. A server that quietly returned what it
recognised would turn every one of those probes into a false positive — the
dashboard would take the long branch, get a column of blanks, and draw a Salary
Master where every pay figure is empty, which is indistinguishable on screen
from a site where nobody has been paid.

**Employee Profile edits the record here now.** Every pencil on that page used
to be a link to `…/app/employee/HR-EMP-…`, which answered "where do I change
this" with "somewhere else" and left whoever followed it reading a Frappe form
laid out nothing like the pane they had been looking at. It opens the boxes on
the page instead. Four things follow, and each is in
`lib/profedit.js` where it can be argued about without a browser.

*One record, one Save.* The thirteen panes are one document, so the draft spans
all of them and the bar above the pane carries a count — a change made on Salary
is still pending while somebody is looking at Personal Details, and the count is
the only thing on screen that says so. A Save per card would be thirteen writes
to one record and thirteen chances for the ninth to be refused.

*The write is a patch and never the document.* `patchFrom` reduces it to the
fields that differ. A document sent back whole re-sends every column the read
returned — including ones this reader may not write, so a corrected phone number
is refused over a salary field nobody touched; and values that were current when
the page loaded, so the second of two people saving quietly undoes the first
everywhere they did not type.

*A field the site has no column for gets no box at all.* This is what the
screen's "not set" / "no such field here" distinction was always for: Frappe
accepts a key its doctype has not got and drops it without a word, so a box for
one would take a value, save, report success, and be gone on reload.

*Nothing here is enforcement.* The write is made as the signed-in person under
their own roles, so what may be changed is what the site says — a refusal
arrives from there and is printed in its own words, because "a Link that names
nothing" and "you may not write this record" are different things to do next.
The record is then read back rather than patched locally: the site names the
document, composes `employee_name` from the three name parts, resolves the
fetch-froms, and normalises what it was sent.

**One write on this dashboard changes the site's schema, and it is + Add on
Employees → Categories.** A Factor HR *Category Type* is a Frappe `Custom Field`
on Employee under another name — the mapping is at the top of
`data/categorytype.js` — so that button creates one, as the signed-in person,
and Frappe refuses it to anybody without System Manager. Two things follow. The
whole document is printed on the dialog before it is sent, because adding a
field changes the shape of every Employee record on the site. And the field it
creates is **not** read onto the employee records this page has loaded:
`EMP_FIELDS` is a fixed list, deliberately, so a category created a minute ago
carries no count off the people and the screen says so rather than printing a
zero. Category types created this way are marked by their fieldname prefix,
`custom_cat_`, which is the only thing separating them from the seven custom
fields Employee already carries for the passport block.

**The ↑ beside it writes too, and only ever creates.** *Data import from file*
reads a CSV in the browser, says what every row would do against what the site
already holds, and then creates the new ones — one `Department` or `Designation`
per row, as the signed-in person. Three rules keep it small enough to trust, and
all three are in `lib/catsheet.js` where they can be tested without a site:
nothing is ever **updated** (renaming a master renames it for everybody carrying
it, so a mistyped cell would move people, and Frappe's own *Update Existing
Records* import is the deliberate way to do that); a `Company` is read and never
written (creating one writes a chart of accounts with it); and a value already
on the site is skipped rather than duplicated, matched on the id **and** on the
tidied name, because "Production" and "Production - MR" are one department under
two names. *Download template* is the other direction of the same file, filled
with what the site holds — so adding a value is a row typed at the bottom of it
and dropped back on the picker.

**A lapsed session is a 403, not a 401.** Frappe falls back to Guest and then
refuses on permissions, so the sign-in screen has to be reached by asking
`whoami()` rather than by reading the status code — see the catch in `load()`.

**Dates are strings.** Every calendar date is `YYYY-MM-DD`; a joining date has
no time and no timezone, and round-tripped as an instant it becomes 2026-03-31
for anyone reading 2026-04-01 after half past five in Chennai. Punch times are
`YYYY-MM-DD HH:MM:SS` for a second reason: today's punches are filtered with a
lexicographic `>=` against exactly that shape.

**One Redux slice, read flat.** `src/store/` holds one object and fifty-odd
files read all of it through `useApp()`. The selected count, the checkboxes and
the "N of M shown" line all come out of one snapshot, so they cannot disagree.

**One palette, dark, and no switch.** It is `:root` in
`src/styles/themes.css`; the Tailwind config holds only the names. There is no
`data-theme`, no `data-mode` and no picker.

It had two axes and lost both on 5 September 2026 — six palettes first, then the
light mode. **Nothing about the mechanism changed:** every rule in `index.css`
names a role rather than a colour, so a second palette or a light mode is a
block in that file and something to write an attribute with, and no component,
class or page would have to move. The note at the top of `themes.css` says how,
and why source order is the whole cascade there.

The one thing that goes with having no switch is that nothing has to be applied
before the first paint — there is no window in which the page is drawn in one
scheme and flipped to another. `color-scheme: dark` on `:root` is what makes the
browser's own furniture — scrollbars, native selects, the caret — follow.

`npm run contrast` checks the palette against every pairing these screens
actually put together and exits non-zero on a failure.

**The one thing a token cannot do in dark mode** is be body text on a card *and*
a fill with white text on it. Text on `#141922` needs a luminance around .23;
white on a fill needs it under .18. So the tokens that did both jobs in light
mode pick text, and the handful of rules that filled with one moved to the
neighbouring fill step — `live` fills became `live-dark`, `accent` fills became
`brand-dark`, and `bad` gained `--bad-fill`, which is `--bad` in all six light
palettes. The checker's `WHITE_ON` list is the contract.

**Charts do not use the brand ramp.** `--chart-1..3` are three fixed hues that
do not belong to the brand, because slices have to be told apart from each other
and a brand has to be told apart from everything else — tie the two together and
"still in" and "on leave" end up two shades of the same orange. Both sets were
run through a colourblindness validator; the note over `--chart-1` records what
was checked.

---

## Two traps that cost an afternoon each

**Never name a component class after a Tailwind utility.** Utilities are emitted
after components, so the utility wins — silently, by drawing something. `.ring`
is Tailwind's box-shadow ring, and every donut on the dashboard came out inside
a blue halo that looked like a focus ring nobody could dismiss. Same family as
the `bad` / `none` note in `tailwind.config.js`.

**And never name one after a class this app already has.** The rail's coverage
marker was `<span className={"cdot " + cov}>`, and one of the four states is
`skip` — which is also the skip-to-content link, a fixed padded pill parked off
the top of the screen. Payroll's dot drew as a grey capsule. It is `data-cov`
now, and an attribute cannot collide with a class.

---

## The one thing a dark palette cannot do

A colour cannot be both body text on a dark card and a fill with white text on
it. Text on `#141922` needs a luminance of about .23; white on a fill needs it
under .18, and there is no value in both windows. So every token that would do
both jobs picks **text**, and the handful of rules that filled with one use the
neighbouring fill step: `live` fills are `live-dark`, `accent` fills are
`brand-dark`, and `--bad-fill` exists beside `--bad` for the one destructive
button. `WHITE_ON` in `scripts/contrast.mjs` is the contract, and it is checked.

The same trap catches literals rather than tokens: `bg-white` was 63 of them and
they are all `bg-card` now.

---

## The rail

Two keys, and they are two keys on purpose. `rail` is `"wide"` or `"slim"` and
outlives the tab; `drawer` is whether the rail is open *over* the page and only
means anything below 900px. Folding them into one is what made a tablet open on
a menu covering a grey screen — a rail remembered as "wide" from a desktop, read
at a width where wide means "over the page" rather than "beside it".

Below 720px it is a bar along the bottom instead: bottom because that is the
part of a phone a thumb reaches without regripping, and a bar rather than a
drawer because a drawer costs a tap to open before the tap that navigates.
