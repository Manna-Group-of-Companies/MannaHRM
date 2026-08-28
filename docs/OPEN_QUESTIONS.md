# What is blocking, and what we need

As of 22 August 2026. The top section stops work; the rest shapes it.

---

## Blocking

### 0. The site hit its daily compute limit — 22 Aug 2026, ~12:30

The API began returning **HTTP 429, "Daily Usage Limit Reached"**. The site is on
the ₹410 tier, which allows **0.5 compute hours a day**, and that is now spent.

**This affects the live sales app, not just this project.** Reps who try to punch
out this evening may not be able to. It resets daily.

Two honest notes:

- **Our own work contributed.** The site survey, the Factor HR reconciliation
  queries, and above all creating two Companies — each of which generates 94
  accounts, 5 warehouses and 2 cost centres — are not free.
- **One result is therefore wrong and has been discarded.** A check that reported
  "0 of 34 designations already exist" was a rate-limited response being read as
  an empty list, not a real answer. It has to be re-run. Any master-data counts
  taken after the limit hit should be treated the same way.

This moves the plan upgrade from "worth sizing" to "do it before installing
anything". Installing Frappe HR itself consumes compute, so it cannot be done
until the limit resets or the plan moves. See [ENFORCEMENT.md](ENFORCEMENT.md)
§3b for the capacity arithmetic.


### 1. ~~ERPNext API credentials are dead~~ — resolved 22 Aug 2026

A fresh key for `integration@mannarubber.com` was supplied and works. The site
has been surveyed: see [SITE_SURVEY.md](SITE_SURVEY.md).

The field-sales app was never affected — reps punched in on the morning of the
22nd. The dead key was a separate integration credential.

**The new key is in a chat transcript.** Rotate it once the project settles, and
keep it in an environment variable or `bridge/config.toml` (gitignored) — never
in a committed file.

### 2. ~~The hosting plan~~ — no longer blocking

Corrected 22 August 2026. Frappe HR installs on shared hosting; only `manna_hr`
needs a private bench. So the migration can start now and the hosting question
becomes a later decision about enforcement rather than a gate on everything.

Worth asking Frappe support whether Server Scripts can be re-enabled on the
current plan — that answer is free and may be the whole solution. See
[ENFORCEMENT.md](ENFORCEMENT.md).

### 3. Frappe HR is not installed

Confirmed first-hand on 22 August 2026: the site runs Frappe 16.31.0, ERPNext
16.32.3, India Compliance and Email Delivery Service. No `hrms`. Installing it
is a Frappe Cloud dashboard action. See [SETUP.md](SETUP.md) §2.

### 4. The UAE company needs a decision before the Employee master is loaded

`Manna Tyre UAE` sits on a site whose timezone is `Asia/Kolkata` and which has
`india_compliance` installed. A UAE punch already records 90 minutes off local
time. Day boundaries, punch windows, shift resolution, the weekend and the whole
of payroll are wrong for that company.

[SITE_SURVEY.md](SITE_SURVEY.md) §7 sets out the three options. This one cannot
be deferred past the Employee load, because Company follows a person into
payroll.

### 5. ~~HI-TECH PRETREADS is not a company in ERPNext~~ — resolved 22 Aug 2026

It is the same company as **Manna Treads**, and is not created separately. The
112 rows load into Manna Treads. See [COMPANIES.md](COMPANIES.md).

---

## Needed from Manna

### About the machines — decides whether the biometric leg is a week or a month

- Make and model of every fingerprint machine, per location.
- Whether each speaks the ZK protocol. ZKTeco, eSSL and most Indian clones do.
- IP address, port and comm key for each.
- Whether each is configured to send a punch direction (IN/OUT) or not.
- Whether there is an always-on machine at each site, or a VPN reaching them.

### About the group

- The list of companies, and which are **real employers** rather than trading
  names. An employee belongs to one Company and it follows them into payroll.
- Total headcount, per company. It decides the Frappe Cloud plan.
- How many people will use the **phone app**. Only they need a `User` record;
  a worker punching on a machine needs none.
- Whether payroll moves to ERPNext too, or stays in Factor HR for now.

### About the rules

These are currently set from the sales system's numbers, which were right for
40 reps and may not be right for a factory:

- **Punch window** — 05:00 to 21:30 today. Does any shift start earlier or end
  later?
- **Geofence radius** — 300 m default. Reasonable for a gate; wrong if a site
  is a large yard.
- **Weekly off** — the sales system assumes Sunday. Is that true for every
  company, and for factory shifts?
- **Who approves whose corrections.** Currently: a person's manager, and HR for
  anyone with no manager set. Is that the real escalation?

### From Factor HR

See [MIGRATION.md](MIGRATION.md) for the full list. The one that matters most:
**the biometric device user id for every employee.** Without it the machines
know a number and ERPNext knows a person, and nothing joins them.

### From Factor HR — the configuration, not just the data

Added 22 August 2026, after studying factoHR's public documentation. See
[FACTOHR.md](FACTOHR.md) for the full comparison. The product documentation says
what factoHR *can* do; only your tenant says what it *does*, and the
configuration is the thing we have to reproduce.

Screenshots of these three Setup screens would be enough to start, per company:

- **Setup > Manage Attendance Policy** — the real thresholds, grace periods,
  and the late/early forgiveness counts. This is the single most valuable
  screen; it is where roughly all of the build effort is.
- **Setup > Manage Shift** — the list itself has now been seen
  ([FACTOHR_SCREENS.md](FACTOHR_SCREENS.md) §20) and carries no timings at all.
  What is still needed is **start and end times, breaks, and which cross
  midnight** — plus the one click that says **which category type carries the
  shift**, because that is how people are assigned to one and there is no
  per-person column to export.
- The leave master and the salary component master.

Also worth knowing: **which licensed modules anybody actually uses.** The login
page advertises ticketing, surveys and a chatbot. Paying for them is not the
same as using them, and building replacements for unused modules is the easiest
way to double the scope of this project for nothing.

### Three decisions this raised

1. **Selfie punch — keep, drop, or narrow?** Your mobile punching photographs
   the person; this design records only coordinates. A coordinate proves a
   phone was near the gate; a photograph proves a person was. It also means
   roughly 500 images a day for 250 people, kept until somebody sets a
   retention policy. See [FACTOHR.md](FACTOHR.md) §4.

2. **Late/early forgiveness — is it really in use?** factoHR supports rules like
   *"3 lates a month forgiven, the 4th deducts a half day"*, optionally taken
   from paid leave rather than as LOP. Nothing in Frappe HR does this and it
   would have to be built. If Manna does not actually use it, that is a large
   piece of work avoided — so it is worth confirming before it is designed.

3. **The monthly attendance freeze.** factoHR makes HR generate and save a
   monthly summary, which payroll then runs from and which cannot be deleted
   once salary is processed. Frappe HR has no such gate — payroll reads
   attendance live. That is a control your HR team has today and would lose.
   Our recommendation is to rebuild it.

---

## Decisions we have taken, which you may want to overturn

Recorded here rather than buried in code, because each is a judgement call and
none is obviously right.

- **`Employee Checkin` is the single funnel**, and `Attendance` is never
  written by hand. Corrections write the missing punch instead. This makes
  every correction auditable and every hour computed by one code path, at the
  cost of the correction being one step less direct than editing a status.
- **A punch that cannot be judged is recorded, not refused.** No coordinate, no
  work location captured, a device that never reports direction — all are
  marked and let through. Refusing somebody who did turn up costs them a day's
  pay and an argument; a flag on a report costs an HR minute.
- **The server clock overwrites a phone's time**, rather than validating it.
  Comparing the two and complaining about a skew leaks the tolerance, and
  somebody finds its edge.
- **Machine punches keep their own timestamps.** They have to: the bridge
  replays punches from while it was offline, which after a power cut can be
  days.
- **We have not carried over the `Sales Person` attendance model.** It works
  for the reps, but building a group HR system on it would mean hand-writing
  shifts, holiday lists, leave ledgers and payroll that hrms already has.
  The existing `Attendance Log` data stays where it is; nothing in this project
  reads or migrates it yet — whether it should is an open question.
