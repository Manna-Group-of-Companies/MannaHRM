# Manna HRM

Group-wide HR and attendance for the Manna group of companies, on one ERPNext
site. Replaces Factor HR.

One site, every company. Factory workers punch on fingerprint machines; staff
and field people punch on their phones. Both land in the same place and produce
one attendance record per person per day.

```bash
npm install                 # once
cp .env.example .env        # once, then put the key in it
npm run dev                 # the site, with the proxy behind it
npm test                    # the rules and the URL grammar
```

| Directory | What it is |
|---|---|
| `client/` | The website — React, Vite, Tailwind. One directory per module under `src/features/`. |
| `server/` | The proxy that holds the API token and serves the built site |
| `bridge/` | The on-premise agent that pulls fingerprint punches off the machines |
| `tools/` | One-off scripts that read the Factor HR exports |
| `tests/` | The rules that need no browser |
| `docs/` | Setup runbook, schema, migration, and what Factor HR does today |

**Start with [docs/SETUP.md](docs/SETUP.md).** Nothing here works against the
live site until the steps in it are done, and the first two are not ours to do.
For the site itself — how to run it, what each page shows — see
[docs/DASHBOARD.md](docs/DASHBOARD.md).

---

## The shape of it

```
  fingerprint machine ─┐
   (ZK protocol, LAN)  │
                       ├──►  Employee Checkin  ──►  Attendance  ──►  Salary Slip
  phone app ───────────┘     (raw punches)          (one per            (payroll)
   (GPS, geofenced)                                  person/day)
```

`Employee Checkin` is the single funnel. A machine punch and a phone punch
differ only by `device_id`. One `Shift Type` job folds both into `Attendance`.

---

## One language

Everything in this repo is JavaScript — the site, the proxy, the bridge, the
tools and the tests. That was not always true: the rules used to live in a
Frappe app, `manna_hr/`, written in Python because Frappe's own runtime is
Python. That app was removed on 31 August 2026.

**What came across, and what did not.** The pure rules did: the day-status
priority order and the geofence arithmetic are `client/src/lib/rules.js` and
`client/src/lib/geo.js`, with all seventeen of their tests. The Frappe-shaped half did
not, because it could not exist without a bench — the hooks, the doctypes, the
install script and the scheduled jobs.

**What that costs is where the rules run**, and it is worth being plain about
it. Attendance is payroll, and a rule enforced only in a browser is a
suggestion to anybody holding `curl`. So today these rules decide what this
site *draws* and what it *warns about*; they do not decide what anybody is
paid. Nothing writes attendance without a human, and the proxy is read-only by
default for exactly this reason.

Putting the same rules back on the server — as ERPNext Server Scripts, or as an
app on a private bench — is still the thing that makes attendance enforceable.
See [docs/ENFORCEMENT.md](docs/ENFORCEMENT.md) and
[docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md).

---

## Status

Scaffold. No live site changes have been made — see
[docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) for what is blocking and what
is needed from Manna.
