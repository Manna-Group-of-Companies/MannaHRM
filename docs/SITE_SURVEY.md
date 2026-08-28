# Site survey — `mannarubber.m.frappe.cloud`

Read directly from the live site on 22 August 2026 as
`integration@mannarubber.com`. Facts, not inference. Anything derived from these
facts is marked as such.

---

## 1. Platform

| | |
|---|---|
| Frappe Framework | 16.31.0 |
| ERPNext | 16.32.3 |
| India Compliance | 16.8.4 |
| Email Delivery Service | 0.0.1 |
| **Frappe HR (`hrms`)** | **not installed** |

Version 16 throughout, which is current. `hrms` being absent is confirmed
first-hand now rather than inferred from the sales repo's notes.

## 2. System settings

| Setting | Value |
|---|---|
| Time zone | `Asia/Kolkata` |
| Country | India |
| Currency | INR |
| Date format | dd-mm-yyyy |
| First day of week | Sunday |
| Server scripts enabled | no |

## 3. Companies

| Name | Abbr | Country |
|---|---|---|
| Manna Rubber Products Private Limited | MRPPL | India |
| Manna Treads | MT | India |
| Manna Tyre Retreads | MTR | India |
| **Manna Tyre UAE** | MRU | **United Arab Emirates** |

**HI-TECH PRETREADS — the factoHR tenant — is not among them.** Either it is a
fifth entity that has never been in ERPNext, or it trades under one of these
four names. This has to be resolved before the Employee master is loaded,
because an employee belongs to exactly one Company and that choice follows them
into payroll.

## 4. People, as things stand

| Doctype | Rows | Note |
|---|---|---|
| `Employee` | 1 | `HR-EMP-00001`, "Test Rep". No `user_id`, no `attendance_device_id`. The HR master is empty. |
| `Sales Person` | 17 | 16 real people plus the `Sales Team` group node |
| `User` (enabled) | 26 | 6 of them on `@mannauae.com` |
| `Department` | 53 | |
| `Designation` | 31 | |
| `Branch` | 0 | |
| **`Holiday List`** | **0** | None exist. Nothing can compute a working day yet. |

Sales people carry a `custom_company` business unit — Manna Treads, Manna Tyre
Retreads, and *"Manna Tyres UAE"*. Note the spelling: the Company record is
**Manna Tyre UAE**, the Sales Person field says **Manna Tyres UAE**. They will
not join on a string match.

## 5. The existing attendance system

Live and in use. Six reps had punched in on the morning of 22 August 2026 while
this survey ran.

| Doctype | Rows |
|---|---|
| `Attendance Log` | 114 |
| `Attendance Regularization` | 9 |
| `Leave Request` | 3 |

`Attendance Log` fields: `attendance_date`, `sales_person`, `status`, `sb_in`,
`punch_in_time`, `punch_in_latitude`, `punch_in_longitude`, `cb_out`,
`punch_out_time`, `punch_out_latitude`, `punch_out_longitude`, `sb_summary`,
`working_hours`, `remarks`.

So the field-sales punches **do** carry coordinates, and carry **no photograph**
— the selfie capture is Factor HR's, on the other system, not this one.

## 6. Server scripts — all eight are disabled

| Name | Type | On | Disabled |
|---|---|---|---|
| `manna_aging_stock` | API | — | yes |
| `manna_attendance_regularization_apply` | DocType Event | Attendance Regularization | yes |
| `manna_minimum_stock` | API | — | yes |
| `manna_place_order` | API | — | yes |
| `manna_release_reservations` | API | — | yes |
| `manna_reserve_min_stock` | API | — | yes |
| `manna_sales_order_timestamp` | DocType Event | Sales Order | yes |
| `manna_stock_reservation_rules` | DocType Event | Manna Stock Reservation | yes |

Two things follow, and both matter:

- **The sales repo's `attendance_log_time_rules.py` was never installed at all.**
  It is not in this list under any name. The 05:00–21:30 punch window is
  therefore enforced only in the Dart client today, and a raw REST call can
  write a punch at any hour. That answers the open question from the first
  session: the document and the site disagreed, and the site is right.
- Server scripts are *disabled*, not *absent*. The documents exist, so the
  feature was available at some point. Whether it can be switched back on is a
  Frappe Cloud plan question and cannot be read from the API.

---

## 7. What this changes

### The UAE company is the biggest finding

A Frappe site has **one** system timezone, and this one is `Asia/Kolkata`. Manna
Tyre UAE is in the UAE, which is UTC+4 — an hour and a half behind.

It is already visible in the data. A UAE rep's punch recorded at `06:58` on 22
August is `05:28` in his own morning. Every UAE punch is currently stamped, and
displayed, in Indian time.

For sales that is untidy. For attendance and payroll it is not survivable:

- The **day boundary** is wrong. A punch after 22:30 UAE lands on the next day.
- The **punch window** is wrong. 05:00–21:30 IST is 03:30–20:00 in the UAE.
- The **shift** is wrong, because auto-attendance resolves shifts by local time.
- The **weekend** is different — and `first_day_of_the_week` is one global
  setting.
- **Payroll is entirely different.** No PF, no ESI, no TDS, no gratuity on the
  Indian formula. `india_compliance` is installed site-wide.


### Measured: the UAE punches are already 90 minutes out

Not a prediction. Measured across all 114 `Attendance Log` rows on 22 August
2026, comparing the `punch_in_time` the phone sent against `creation`, which the
server stamps itself and no client can set.

| Rep | Punches | Median drift |
|---|---|---|
| Manikandan | 7 | **+90 min** |
| Rajeev S | 6 | **+90 min** |
| Shihab K | 3 | **+90 min** |
| Subhash, Pareeth, Bibin, Prasad, Jaimon, Sirajudheen, Prashanth, Amjad, Nikhil | 3–12 each | **0 min** |

Every Indian rep agrees with the server to the second. All three UAE reps are
out by exactly the India/UAE offset.

**The cause is in the app, not the site.** The Flutter app formats its timestamp
in the *device's* local timezone and Frappe stores it naively as if it were site
time. An Indian handset happens to match; a UAE handset is 90 minutes early.

Working hours survive it — both punches shift equally — but the time of day is
wrong on every UAE record, any rule that looks at the clock is wrong for them,
and a late-evening punch can roll onto the wrong date.

**This is also the clearest demonstration of why a server-side rule matters.**
`creation` is written by the server and cannot be forged; `punch_in_time` came
from a phone and demonstrably disagrees with it. Today nothing compares the two.

### Per-company timezones are not a thing in Frappe

Checked on this site: `User` has a `time_zone` field, `Company` has none, and
`System Settings.time_zone` is a single site-wide value.

So a per-user timezone can fix **display** for the UAE staff. It cannot fix
storage, day boundaries, shift resolution or any scheduled job — all of those
run on the site timezone.

### Options

This needs a decision before the Employee master is loaded:

1. **Separate site for the UAE company.** Cleanest, and correct on every count
   above. Costs a second Frappe Cloud site and gives up group-wide reporting in
   one query.
2. **One site, and carry an offset per company.** Every timestamp is stored IST
   and converted at the edges. Cheap to start and wrong in a hundred small ways
   afterwards — this is the option that looks fine for six months.
3. **One site, UAE stays on Factor HR.** Defer it. Honest, if the UAE headcount
   is small.

Recommendation: **(1) if UAE payroll moves too, (3) if it does not.** Option 2
is the one to refuse.

### Everything else

- **No Holiday Lists exist.** Nothing can compute a working day, a weekly off,
  or LOP until they do — one per company, and the UAE's is not India's.
- **The Employee master is empty.** All 16 working people exist only as
  `Sales Person`. The Factor HR export is the whole HR master.
- **`Department` has 53 rows** from the ERPNext defaults plus company suffixes.
  Worth pruning against the Factor HR list rather than mapping onto.
- **The field-sales app is healthy.** Reps punched in this morning. The earlier
  concern that dead API credentials might have broken it was wrong — that key
  was a separate integration credential, not the one the app uses.
