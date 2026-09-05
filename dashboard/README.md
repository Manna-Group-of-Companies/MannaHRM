# Manna HR

A React front end over an Express/MongoDB API. Two workspaces, one origin.

```
client/   React 18 · JavaScript (JSX) · Redux Toolkit · axios · Vite · Tailwind
server/   Node · Express · Mongoose/MongoDB · TypeScript
dist/     the built client, which the server serves in production
files/    the bytes behind a `File` row — document scans, served at /files
```

## Running it

You need Node 20.11 or newer and a MongoDB you can write to.

```bash
npm install                 # installs both workspaces
cp server/.env.example server/.env

npm run seed                # 62 people, a month of punches, two live queues
npm run dev                 # the API on :8770

# in a second terminal, the page on :5173 with hot reload
npm run dev:client
```

Open <http://localhost:5173>. Vite proxies `/api` to the API, so the browser
sees one origin in development just as it does in production.

For a production-shaped run, build the client and let the API serve it:

```bash
npm run build
npm start                   # everything on :8770
```

## The two halves

### The client talks to one origin, over relative URLs

`client/src/api/client.js` creates its axios instance with `baseURL: ""` and no
auth header, and that is deliberate rather than unfinished. The page and the API
are one origin — Vite proxies in development, the API serves `dist/` in
production — so there is no cross-origin call to authorise and no credential for
the browser to hold. **If an absolute URL or an `Authorization` header ever
appears on the client side, that arrangement has been broken** and everything it
was protecting needs reconsidering.

Five calls, and no others:

| | |
|---|---|
| `GET /api/site` | where this is pointed, and what it will let you do |
| `GET /api/resource/:doctype` | a page of a list, with `fields`, `filters`, `limit_start`, `limit_page_length` |
| `GET /api/resource/:doctype/:name` | one whole document, child tables included |
| `POST /api/resource/:doctype` | one draft |
| `PUT /api/resource/:doctype/:name` | one allowlisted field change |

A list answers `{data: [...]}`, a document answers `{data: {...}}`, and a refusal
answers `{error, hint}` — the client reads `hint` first. Those shapes are a
contract with ninety screens, not a preference.

Two more, for attachments — in the API's shape, because they are writes:

| | |
|---|---|
| `POST /api/files` | one scan, base64, filed against a record *and* a field |
| `DELETE /api/files/:name` | the File row and the bytes behind it |

`POST` takes base64 in JSON rather than multipart: a multipart parser is a
dependency and a temp-file lifecycle, and base64 is a string this process either
has whole or does not have at all. Five megabytes decoded, an extension
allowlist, and the target record and field are both checked to exist — an
attachment filed against a field that does not exist is one no screen will ever
ask for again.

One route is deliberately outside that shape:

| | |
|---|---|
| `GET /files/<name>` | the bytes behind a `File` row — `?download=1` saves rather than shows |

It is not under `/api` and it does not answer JSON, because the browser follows
it itself: an attachment is opened in a tab or saved to disk, and an envelope
around it would make it the one thing here nobody can use. It serves only from
`FILES_DIR`, refuses anything resolving outside it, and never caches — a
document scan is somebody’s passport. Every response carries
`Content-Security-Policy: sandbox`, which is what makes it safe to serve a file
somebody uploaded from the same origin as the page: an SVG can carry script, and
sandbox puts the response in an opaque origin where it cannot run.

### What writes, and what does not

Almost every control on this dashboard reads, and the ones that write are named
one at a time in `server/src/doctypes/registry.ts` — that table is the list, not
this paragraph. The shape of it:

| | |
|---|---|
| **Field changes** | Five document numbers on `Employee` (`passport_number`, `valid_upto`, `date_of_issue`, `place_of_issue`, `custom_pan_no`), the decision fields on the two correction queues and on `Leave Application`, and two fields on `Employee Onboarding` — the employee a pull created and the state that follows from it |
| **Creates** | `Employee`, `Asset`, `Asset Category`, `Employee Letter`, and the three payroll doctypes — every one of them as a draft, never submitted |
| **Deletes** | `Asset Category` and `Asset`, and only while nothing points at them |
| **Bytes** | The two `/api/files` routes, and nowhere else |

Each of those is an exception argued for where it is written down, and the
argument is the same shape every time: **the record is not maintained anywhere
else, or the screen that shows it wrong is the screen somebody would fix it
from.** A passport number is empty on almost every employee and the register is
where you see that; sending somebody to a desk to type the same number into the
same field by hand is the read-only rule protecting nothing. An onboarding
candidate marked as pulled is the same argument one step along — a candidate
whose record does not know an `Employee` was created from them is a candidate
the next person creates a second time.

`status`, `ctc` and everything that decides what a person is paid stay
unwritable, by name, in `registry.ts`, and nothing here submits anything.

### The server is the security model

`server/src/doctypes/registry.ts` is one table saying, per doctype, whether it is
served, whether it can be created, and which fields a `PUT` may set. A rule
enforced in a browser is a suggestion to anyone holding curl, so nothing is
enforced in the client. Three rules ride on top of the table:

1. **Nothing is written unless the process was started with `ERP_WRITE=1`.** The
   default run is read-only, so a dashboard opened to look at something cannot
   change it.
2. **Nothing is created except as a draft.** `docstatus` must be 0 or absent on
   a `POST`. Submitting decides what somebody is paid, and it does not happen
   from a dashboard. `Salary Slip` and `Payroll Entry` are not modelled at all.
3. **A `PUT` may only set the fields the table names.** An allowlist, so a field
   added to a schema tomorrow is unwritable until somebody says otherwise.

Submitted documents refuse to be edited through this API at all.

### Asking for a field that does not exist is an error, not a blank column

`GET /api/resource/Employee?fields=["name","custom_work_location"]` answers
**417**, and the whole read fails.

That is load-bearing. The client probes what this site carries by asking for a
long field list and falling back to a short one when the read is refused — it
does this three times in `client/src/api/load.js` alone. A server that quietly
returned the columns it recognised would turn every one of those probes into a
false positive: the dashboard would take the long branch, get a column of
blanks, and draw a Salary Master where every pay figure is empty —
indistinguishable, on screen, from a site where nobody has been paid. Filters get
the same treatment, for a sharper reason: a dropped filter does not return an
error, it returns everybody.

## State: one Redux Toolkit slice, read flat

`client/src/store/` is one slice holding one flat object, and fifty-three files
read all of it through `useApp()`.

That is not the shape a Redux Toolkit tutorial suggests, and the reason is the
one thing worth knowing before changing it: the selected count, the checkboxes
and the "N of M shown" line all come out of a single snapshot, so they cannot
disagree. A slice per feature would buy a rename of every read and nothing else.

The public API is four functions, unchanged from the hand-rolled store this
replaced, so the migration touched this directory and `main.jsx` and nothing
else:

```js
import { set, patch, getState, useApp } from "@/store";

const s = useApp();                          // the whole store, in a component
set({ q: "raghav", section: "employees" });  // shallow merge
patch("cal", { month: "2026-09" });          // one nested form object
getState().employees;                        // outside React — loaders, exports
```

`set` replaces nested objects rather than merging them, so a caller has to say
what it means: `set({ cal: { ...s.cal, month } })`.

Two deliberate configuration choices, both in `store/index.js`: `appsel` is a
`Set` and always will be — it is a selection, rebuilt whole on every tick — so
`enableMapSet` is on and the serialisability check is off. And every reducer
*returns* a new object rather than mutating the draft, which is exactly what the
old `set` did, so Immer never drafts a few hundred employee rows on a keystroke.

Reads are dispatched as `createAsyncThunk`s (`store/thunks.js`) so a failed load
leaves a `rejected` action on the devtools timeline. They wrap the loaders in
`api/load.js` rather than replacing them — those write several unrelated keys at
several points, and collapsing that into one `fulfilled` payload would make the
connection line arrive with the employee list instead of before it.

## Four palettes

`client/src/styles/themes.css` holds every colour value in the app. The Tailwind
config holds only the *names* — `brand`, `ink-3`, `line-ctl` — each resolving to
a custom property, so a new look is a block in that file and none of the four
hundred class names move.

| | |
|---|---|
| **Harbour** | Blue and white. The default, and what the screen copies were built against |
| **Graphite** | Neutral slate chrome, teal as the only accent — status colours read louder because they are the only other hues present |
| **Ember** | The warm charcoal and burnt orange the app started in, at full contrast |
| **Iris** | Indigo-violet on a plum-tinted stone — the one saturated hue no status token uses, so a control can never be mistaken for a state |

Pick one under **Settings → Appearance**. The choice is a `data-theme` attribute
on `<html>`, remembered per browser in `localStorage` and applied before the
first paint — deliberately outside the Redux store, because repainting the
interface because a filter changed is the one thing a theme switch must not do.

Tokens are stored as RGB channels (`234 242 253`) rather than finished colours,
which is what keeps Tailwind's opacity modifiers working — `bg-brand-soft/60` and
`text-bad/70` are both in use. The consequence, and the one trap: **`theme(colors.x)`
no longer works in hand-written CSS**, because it expands with `<alpha-value>`
still in it. Write `rgb(var(--x))`.

Nine colours stay literal and must not be themed: the seven `.lvdot` legend
fills, the leave calendar's today-fill, and the mandatory-field yellow on the
loan form are pixel copies of Factor HR's own screens, and the point of them is
that they match. The Manna orange is literal too — it is the logotype, it is
3.1:1 on white, and WCAG exempts brand marks from contrast minimums but nothing
else here is exempt.

```bash
npm run contrast --workspace @manna/hrm-client
```

checks every palette against every pairing these screens actually put together —
text on each of the four surfaces, status text on its own wash, white on each
filled control, the control edge, the rail marker — and exits non-zero on a
failure. It reads the theme file rather than a copy of the values, so it cannot
pass because somebody edited the palette and forgot the checker. It also fails a
palette that is missing a token the others carry, which is the commonest way one
of these breaks: the app falls back to another palette's colour and the result is
usually legible enough that nobody notices.

## Dates are strings

Every calendar date in the schema is a `YYYY-MM-DD` string, not a `Date`. A
joining date has no time and no timezone; round-tripped as an instant it becomes
2026-03-31 for anyone reading 2026-04-01 after half past five in the evening in
Chennai. Punch times are `YYYY-MM-DD HH:MM:SS` strings for a second reason: the
client filters today's punches with a lexicographic `>=` against exactly that
shape.

`creation` and `modified` *are* `Date`s. Those are instants.

## Holidays out to Google Calendar

**Employees → Calendar** hands the holiday list over two ways, both in
`client/src/lib/gcal.js` and neither of them a sync:

| | |
|---|---|
| **＋ Google**, per row | Google's `render?action=TEMPLATE` link. Opens their compose screen with the day filled in; nothing is added until the person presses Save, in their own account |
| **⭳ Google Calendar**, on the toolbar | The whole list as RFC 5545 `.ics`, for *Settings → Import & export*. Outlook and Apple Calendar read the same file |

Nothing here calls Google — no key, no OAuth, no server leg. The link is a URL
the browser opens and the file is a Blob it saves, which is why the export stays
live when every Desk button beside it is dead for want of a `SITE_URL`.

Three things the file gets right and a hand-rolled one usually does not. Events
are **all-day and date-valued** (`DTSTART;VALUE=DATE`), because a holiday given
a time lands on the 14th for anyone whose calendar is set west of here, and the
end date is **exclusive** — same day twice is an event Google drops. `UID` is
**stable**, derived from the date, the holiday and the list, so re-importing a
corrected list updates the days already there instead of laying a second copy
over them. Lines fold at **75 octets, not 75 characters**, so a holiday named in
Devanagari does not produce a line a strict parser rejects.

Weekly offs are left out on purpose: fifty-two Sundays in a personal calendar is
fifty-two rows of noise on top of a weekend it already draws. The festival list
is the part nobody can guess, and it is what goes.

## Seeding

```bash
npm run seed
```

Deterministic — the generator is seeded, so two runs produce the same 62 people
with the same codes, and a bug found on `HR-EMP-00023` is still there after a
reseed. It writes gaps on purpose: some people have no PAN, some assets have no
custodian, one department is disabled, one letter type is retired. The screens
that report on those exist to find the gap, and a seed without one makes every
such report look broken.

**It drops the collections it writes** and refuses to run against a URI that
does not read as a development one unless `SEED_FORCE=1` is set.

## Environment

See `server/.env.example`. The four that matter:

| | |
|---|---|
| `MONGODB_URI` | where the data lives |
| `ERP_WRITE` | exactly `1` enables the allowlisted writes. Anything else is read-only |
| `PORT` | the API's port. `client/vite.config.js` proxies to `MANNA_PROXY_PORT`, defaulting to the same 8770 |
| `SITE_URL` | the Frappe desk that New / Edit / Delete / Data Import open. **A real desk, never this server** — see below |

Every control on this dashboard that would write is an anchor to `SITE_URL`
instead (`client/src/lib/desk.js`), so `SITE_URL=http://localhost:8770` — the
API itself — is the one value that breaks all of them at once and looks like
nothing at all: the client builds `<SITE_URL>/app/holiday-list/new`, this server
answers any path it does not recognise with the client bundle, and the button
opens a new tab containing the dashboard again. `/api/site` drops a value naming
this server and reports it back as `urlIgnored`; unset, the controls sit
disabled with the reason on them, which is the honest state when there is
nowhere to go.
