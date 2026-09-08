# Manna HRM

Group-wide HR and attendance for the Manna group of companies, on one ERPNext
site. Replaces Factor HR.

One site, every company. Factory workers punch on fingerprint machines; staff
and field people punch on their phones. Both land in the same place and produce
one attendance record per person per day.

| Directory | What it is |
|---|---|
| `manna_hr/` | The Frappe custom app — server-side rules. This is the backstop. |
| `client/` | The React HR dashboard. Talks to the ERPNext site, as the signed-in user |
| `bridge/` | The on-premise agent that pulls fingerprint punches off the machines |
| `shared/fixtures/` | Rule cases both the server and any client must agree on |
| `tools/` | One-off scripts: the imports, the exports, and the schema installers |
| `docs/` | Setup runbook, schema, migration, and what Factor HR does today |

**[docs/DOCTYPES.md](docs/DOCTYPES.md) is the map.** Every page in the dashboard,
the doctype behind it, and whether that doctype comes from Frappe HR or from
here. ERPNext is the server *and* the database — there is no store of ours
anywhere else, and a screen with no doctype under it is a screen that cannot
save.

**Start with [docs/SETUP.md](docs/SETUP.md).** Nothing here works until the
steps in it are done, and the first two are not ours to do.

---

## The shape of it

```
  fingerprint machine ─┐
   (ZK protocol, LAN)  │
                       ├──►  Employee Checkin  ──►  Attendance  ──►  Salary Slip
  phone app ───────────┘     (raw punches)          (one per            (payroll)
   (GPS, geofenced)                                  person/day)
                                  ▲
                                  │
                          manna_hr validates:
                          geofence, punch window,
                          server clock, device trust
```

`Employee Checkin` is the single funnel. A machine punch and a phone punch
differ only by `device_id`. One `Shift Type` job folds both into `Attendance`.

---

## Why a custom app and not client-side rules

The sales system this grew out of enforces every rule in its clients, because
Server Scripts are not available on that site's plan. For sales that is
uncomfortable. For HR it is not survivable: **attendance is payroll**, and a
geofence enforced only in a phone app is a suggestion to anyone with `curl`.

So the rules live in `manna_hr/`, on the server, running on the server's clock.
A client may check the same rule to give a fast, kind error message. It is never
the thing that decides.

---

## The schema

Twenty-one doctypes, and every one of them fills a hole rather than duplicating
one. About 70% of Factor HR is stock Frappe HR, so leave, payroll, shifts and
attendance are hrms' and are left alone; what `manna_hr` adds is the rest —
corrections, letters, documents, asset handovers, staff loans, surveys, the
category master, the device register and the settings.

```bash
python tools/install_all.py            # what it would do
python tools/install_all.py --apply    # do it
```

Or, with no Python and no API key: sign in to the site, open `/app`, and paste
[tools/install_all.console.js](tools/install_all.console.js) into the browser
console. Both are a **way in, not the destination** — they create custom
doctypes, which the site owns and whose controllers do not run. The destination
is `bench get-app` + `bench install-app`. See
[docs/DOCTYPES.md](docs/DOCTYPES.md).

## Status

Frappe HR **is** installed on the site — the `HR` and `Payroll` modules are
there, and so are the roles. Nine of the twenty-one doctypes are on it as custom
doctypes; the rest are in this repo and go up with the installer above. None of
the server-side *rules* are live, because a custom doctype carries no controller.

Read [docs/DOCTYPES.md](docs/DOCTYPES.md) §14 for what that means in practice,
and [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) for what is still needed
from Manna.
