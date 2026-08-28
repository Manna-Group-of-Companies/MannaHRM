# Manna HRM

Group-wide HR and attendance for the Manna group of companies, on one ERPNext
site. Replaces Factor HR.

One site, every company. Factory workers punch on fingerprint machines; staff
and field people punch on their phones. Both land in the same place and produce
one attendance record per person per day.

| Directory | What it is |
|---|---|
| `manna_hr/` | The Frappe custom app — server-side rules. This is the backstop. |
| `bridge/` | The on-premise agent that pulls fingerprint punches off the machines |
| `shared/fixtures/` | Rule cases both the server and any client must agree on |
| `docs/` | Setup runbook, schema, migration, and what Factor HR does today |

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

## Status

Scaffold. No live site changes have been made — see
[docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) for what is blocking and what
is needed from Manna.
