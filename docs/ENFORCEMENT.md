# Why a server-side rule, and what a private bench is for

Written because the question was asked directly and deserves a plain answer
rather than a design principle.

> **Read this one first, and know that the answer is currently "no rule".** The
> `manna_hr` app this document argues for was removed on 31 August 2026, when
> the repo was converted to one language. The rules themselves survive as
> `client/src/lib/rules.js` and `client/src/lib/geo.js` and are tested by `npm test` — but
> they run in a browser, which is exactly the arrangement §1 below explains is
> not enforcement. Nothing writes attendance unattended today, so nothing is
> being decided wrongly; the moment something does, one of the options in §4 has
> to be chosen first.


---

## 1. What a "rule in the app" actually is

The Flutter app runs on the employee's own phone. The rule *"you may only punch
within 300 m of the gate"* is a few lines of Dart on that phone, which decide
whether to send the punch.

Two ways past it, and neither needs any skill:

**Change the phone's clock.** Android settings, thirty seconds. The app then
believes it is 09:00 and stamps the punch accordingly.

**Skip the app.** The app talks to ERPNext over the ordinary REST API using a
token stored on the phone. Anyone who extracts that token — or who simply logs
in with their own ERPNext password — can write a punch directly with a tool like
Postman, from anywhere, at any time. The rule never runs, because the rule lives
in an app that was never opened.

This is not theoretical on your site. **The 05:00–21:30 punch window exists only
in the Dart app.** The server script written for it was never installed. Today a
punch can be written for any hour of any day by anyone with a login.

## 2. What "server-side" means

Code that runs on ERPNext's own machine, every time a record is saved, whatever
saved it — the phone app, the dashboard, a Postman request, an import.

The difference is a lock versus a sign asking people not to.

It also gets you the **server's clock**, which no phone can change. That matters
more than it sounds: see the UAE finding in [SITE_SURVEY.md](SITE_SURVEY.md) §7,
where three phones disagree with the server by exactly 90 minutes and nothing
currently notices.

## 3. Why the hosting plan comes into it

Frappe Cloud offers two shapes of hosting:

| | Shared | Private bench |
|---|---|---|
| Your site runs on | a server shared with other customers | your own |
| Custom app (`manna_hr`) | ✗ | ✓ |
| Server Scripts | usually ✗ | ✓ |
| Managed backups and updates | ✓ | ✓ |

They do not allow custom Python on shared hosting, and that is a reasonable
policy rather than an upsell — your code would be running on hardware shared
with other companies.

**Server Scripts** are the in-between: Python typed into the ERPNext UI, running
in a sandbox, no deployment needed. Your site has eight of them and **all eight
are disabled**, with the site-wide switch off. Whether that switch can be turned
back on is a question for Frappe support and is worth asking before paying for
anything — it may be the cheapest answer available.

So the ladder is:

1. Ask Frappe to enable Server Scripts on the current plan. Cheapest. Enough for
   punch windows and geofences.
2. Private bench, and install `manna_hr`. More capable, more expensive.
3. Self-host. Cheapest in licence, dearest in attention.

## 3b. What the Frappe Cloud plans actually buy

Checked 22 August 2026 against Frappe's own documentation.

**Frappe HR needs none of this.** It is one of the ~20 Frappe-maintained apps
included with shared hosting. Install it today, on the current plan.

**Server Scripts need a private bench.** Shared benches do not permit them, and
that is stated policy rather than a plan detail. To put a site on a private
bench, Frappe requires the *site plan* to be **USD $25/month or higher**.

Two things follow that are easy to get wrong:

- **The Change Plan dialog is not where a private bench is bought.** It resizes
  the site — compute, database, disk. The bench group is created separately, and
  the site is then migrated onto it. Upgrading the plan alone changes nothing
  about scripts.
- **$25 is the floor, not the purchase.** At Frappe's INR rate that is around
  **₹2,050/month**, the tier that also gains offsite backups. Confirm the exact
  figure with Frappe support before paying — it is a one-line question and the
  rate is theirs, not ours.

### Capacity is a separate reason to move

The site is on the ₹410 tier: **0.5 compute hours a day, 250 MB database,
2.5 GB disk.** Adding HR to an ERPNext site already carrying sales:

- 160 people at 2–4 punches a day is roughly **180,000 `Employee Checkin` rows a
  year**, plus an `Attendance` row per person per day.
- Selfies, if kept, are on the order of **5 MB a day** — about 1.8 GB a year,
  which alone approaches the whole 2.5 GB disk.

So a plan move may be needed on capacity grounds whether or not Server Scripts
are ever wanted. Worth sizing once, deliberately, rather than twice.

## 4. What you can have **without** any of it

This is the part worth knowing before spending money. A good deal of enforcement
is available on the current plan, because **the server records some things
itself no matter what the client says**.

### `creation` cannot be forged

Frappe stamps `creation` server-side on every document. A phone can lie about
`punch_in_time`; it cannot touch `creation`.

So a report comparing the two catches clock tampering, and catches it exactly.
It already works — that is precisely how the UAE 90-minute drift was found, on
your live data, with no custom code at all.

### Coordinates are recorded whether or not they are checked

The app already writes `punch_in_latitude` / `punch_in_longitude`. A **Query
Report** — plain SQL, created through the ERPNext UI, no custom app — can
compute the haversine distance from a gate and list every punch outside it.

### So the achievable position today is

- Rules in the phone and the dashboard, giving a fast, clear refusal for the
  99% of cases that are honest mistakes.
- The raw evidence stored on every punch: coordinates, device time, server time.
- Reports that flag anything inconsistent, for HR to look at the next morning.

**What you do not get is prevention.** A determined person can still write a
false punch; they just cannot hide that they did.

## 5. How to decide

The honest question is not "is client-side enough" in the abstract. It is:

> If somebody writes a false punch and we find it the next morning on a report
> rather than refusing it at the moment, what has it cost us?

For 160 people on a monthly payroll, with a report somebody actually reads, the
answer may well be "not much" — and detection is a great deal cheaper than
prevention.

The answer changes if attendance feeds overtime payments, or if the group grows,
or if nobody reads the report. Detection only works when somebody is looking.

**Recommended order:** ask Frappe whether Server Scripts can be enabled — the
answer is free. Build the client-side rules regardless, because they are what
staff actually experience. Add the drift and geofence reports, which need
nothing. Then decide about a private bench with real numbers in front of you
rather than in advance.
