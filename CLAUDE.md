# Working in this repo

Manna HRM — group-wide attendance and HR for the Manna companies, on the
ERPNext site at `mannarubber.m.frappe.cloud`. Replaces Factor HR.

Read [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) before starting anything.
Three things are blocking as of 22 August 2026 and none of them is code.

[docs/SITE_SURVEY.md](docs/SITE_SURVEY.md) is what the live site actually holds,
read on 22 August 2026. Trust it over anything inferred from the sales repo.

[docs/FACTOHR.md](docs/FACTOHR.md) is what we are replacing and what it costs to
match. Read it before estimating anything — about 70% of Factor HR is stock
Frappe HR, and essentially all of the remaining 30% is one attendance policy
engine that decides what people are paid.

---

## 1. The rule that everything else follows from

**Attendance is payroll.** A rule enforced only in a client is a suggestion to
anyone holding `curl`, and the consequence here is somebody's wages rather than
a wrong number on a dashboard.

**That rule is currently unenforced, and you have to know it.** The rules used
to run inside ERPNext, in a Frappe app written in Python. That app was removed
on 31 August 2026 when the repo was converted to one language; the rules
themselves came across to `client/src/lib/rules.js` and `client/src/lib/geo.js`, tests and
all, but they now run in a browser.

So what is true today: these rules decide what the site **draws** and what it
**warns about**. They do not decide what anybody is paid. Nothing here writes
attendance without a human, the proxy is read-only unless deliberately started
otherwise, and every write it does allow lands on the site, where the site's own
rules run.

Do not write a feature that treats a client-side check as enforcement. If a rule
has to bind, it belongs on the site — an ERPNext Server Script, or an app on a
private bench. That is still the open decision; see
[docs/ENFORCEMENT.md](docs/ENFORCEMENT.md) and [docs/SETUP.md](docs/SETUP.md) §1.

---

## 2. Layout

Everything is JavaScript. The browser half is `client/` and nothing else is —
the same split the sales repo next door uses, so the two read alike.

| Path | What |
|---|---|
| `client/` | The website. Vite's root: `index.html` and its three configs live here. |
| `client/index.html` | The one page. Vite's entry. |
| `client/src/routes/` | Which URL is which page — `paths.js` the grammar, `registry.jsx` the table |
| `client/src/layout/` | The chrome: rail, top bar, page strip, page outlet |
| `client/src/features/` | One directory per module, one file per page |
| `client/src/components/` | Shared UI |
| `client/src/api/` | The axios client and the loaders |
| `client/src/data/` | Static tables — Factor HR's menus, columns and screen notes |
| `client/src/lib/` | Pure helpers. `rules.js` and `geo.js` are the attendance rules. |
| `client/src/store/` | One store, read by the whole site |
| `server/` | `index.js` the proxy, `dev.js` the two-process launcher, `env.js` reads `.env` |
| `bridge/` | The on-premise agent that reads the fingerprint machines |
| `tools/` | One-off scripts that read the Factor HR exports |
| `tests/` | `npm test`. No browser, no site. |
| `docs/` | Runbook, schema, migration, open questions |

`lib/rules.js`, `lib/geo.js` and `routes/paths.js` under `client/src/` import
nothing at all. That is the point, and it is what makes them testable from
`tests/` in one command, with no browser and no site.

**Vite's root is `client/`, not the repo root.** `npm run build` is
`vite build client`, and the build lands in `dist/` at the repo root because
`server/index.js` is what serves it. Two things in `client/` are pinned to their
own directory rather than to the shell's cwd for that reason — Tailwind's
`content` globs, and the config `postcss.config.js` hands it. Neither failure
mode is loud: a wrong path there yields a stylesheet with no utilities in it,
which looks like a broken page.

---

## 3. Tests

```bash
npm test        # 27 tests, no browser and no site needed
```

They cover `lib/rules.js`, `lib/geo.js` and `routes/paths.js` only, and that is
the point: anything that can be a pure function should be one, so the rule can
be argued about without a running site.

**Tests state the rule in their name.** `"a punch beats an approved leave
record"`, not `"status 1"`. When one fails at midnight, the name is what tells
the reader what was supposed to be true.

---

## 4. Conventions

Carried over from the sales repo, where they were earned.

**Comments say why, never what.** The code says what it does. A comment earns
its place by recording a decision, a constraint, or a trap — usually one a
future reader would otherwise undo.

**Errors round in the safe direction, and the comment says which way.** The bias
throughout this project is that *refusing somebody who did turn up is the
expensive mistake*: it costs a person their day's pay and an argument with HR,
while letting a doubtful punch through costs a flag on a report a human reads.
So a punch that cannot be judged is recorded and marked, never refused.

**Tabs, not spaces.** Throughout, in JavaScript as it was in Python.

**Pages get URLs.** This is a website. Anything reachable has an address —
`/employees/salary` — and navigation goes through `client/src/routes/router.js`,
never a bare `set({ subtab })`. Use `go()` when a click both changes state and moves, and
`<Link>` when it is a link, so middle-click and Ctrl-click keep working.

---

## 5. Traps

**Never write `Attendance` directly.** It is generated from `Employee Checkin`
by the shift job. A hand-written row is invisible to the thing that would have
created it, and the two disagree the moment anything is reprocessed. A
correction writes the missing *punch*.

**`hrms.mark_attendance` returns quietly when a row already exists.** So a day
already marked Absent silently swallows a correction: the checkins land, the job
runs, the day stays Absent. Anything that regularizes a day has to cancel the
generated row first.

**The bridge must never clear a device's log.** `node-zklib` offers
`clearAttendanceLog()` and every tutorial calls it. The device's memory is the
last copy of a punch that failed to deliver.

**A `device_id` that does not start with the trusted prefix is a mobile punch** —
geofenced, because no fingerprint machine sends a coordinate. Renaming a device
in `bridge/config.toml` breaks its punches.

**Frappe replaces rather than merges permissions.** The moment one
`Custom DocPerm` row exists for a doctype, the standard rows stop applying. If
you add one, copy all the standard rows across in the same transaction.

**Per-company scoping is a User Permission on `Company`, not a role.** An
`HR User` with no Company permission sees every company. The default is open, so
an omission is a leak rather than a lockout, and it will not announce itself.

**Night shifts crossing midnight belong to the day they started.** Get the Shift
Type window wrong and a night worker is marked absent two days running. Test it
with real punches before anyone is paid from it.

**The proxy's allowlist is the security boundary.** `server/index.js` holds a
System Manager token. Adding a doctype to `ALLOWED` hands that doctype to
anything that can reach localhost — which is why no payroll doctype is on it.

---

## 6. The sales repo next door

`C:\SALES_DASHBOARD` — Flutter app plus React dashboard against the same site,
with an attendance system built on custom `Attendance Log` / `Attendance
Regularization` doctypes keyed to `Sales Person`. Frappe HR is not installed
there and `Employee` holds one disabled test row.

Worth reading before changing a rule here, because most of these rules came from
there and the reasoning is in its comments:

| File | What it holds |
|---|---|
| `client/src/domain/attendance.ts` | `rosterFor` — the status priority order, now in `client/src/lib/rules.js` |
| `app/lib/core/proximity.dart` | haversine and bounding boxes, now in `client/src/lib/geo.js` |
| `app/server/attendance_log_time_rules.py` | the server-clock argument |
| `app/CLAUDE.md` §4 | ERPNext landmines, all still true |

**Its data model was deliberately not carried over.** It is right for 40 reps and
wrong for a group with factory workers — it would mean hand-writing shifts,
holiday lists, leave ledgers and payroll that hrms already has. Whether the
existing `Attendance Log` history should be migrated is still open.

---

## 7. Known-incomplete

- **Nothing has been applied to the live site.** Everything here is a scaffold.
- **The rules do not bind.** They ran on the server and do not any more — see
  §1. This is the largest open item in the repo.
- **No phone app.**
- **Device clock drift is not handled.** These machines drift by minutes a
  month, and a gate running eight minutes fast makes everybody there late.
- **Leave, payroll and shift rosters are untouched** — attendance first.
- **The site builds as one 737 kB chunk.** Every page is imported eagerly by
  `routes/registry.jsx`. Splitting per module is one `lazy()` away and has not
  been done, because a loading flash on every tab click is a worse trade than
  the download on a factory office LAN.
