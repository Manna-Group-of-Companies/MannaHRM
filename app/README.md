# Manna HR — the phone app

**One app for everybody** (21 October 2026 — Manna HR Admin merged into it).
Everybody signs in with the same ERPNext login they use on the website, and
what opens depends on who they are:

| Login | Opens on |
|---|---|
| An employee | **their own side** — Home (today, punch in/out, recent activity), Attendance (the month), Leave (history, balance, apply), More (profile, payslip, corrections, settings) |
| HR (**HR User** / **HR Manager** — the site lets it create an Employee) | **HR's side** — Home (counts), Employees, Leave Requests, Reports, and the drawer. When the login's User ID is on an Employee record, the same home and drawer also carry **everything an employee has**: Punch In / Punch Out, My Attendance, Apply Leave, My Leave, My Payslip, My Profile, My Corrections. One menu, no choosing a side (21 October 2026) |

Which side opens is `lib/core/landing.dart`, and it is **a menu, not the
security**: every read on HR's side returns whatever the login's roles let it
read on the site. The HR check is asked again on every start, so a login whose
HR role is taken away stops seeing everybody's day.

```
lib/core/punch_rules.dart   which way the next punch goes, the working window, a day's pair
lib/core/roster.dart        one person's month — the status priority order
lib/core/day.dart           one day, for everybody — HR's side (was admin/lib/core/day.dart)
lib/core/landing.dart       which side a login opens on
lib/core/leave_rules.dart   a leave request, and the balance
lib/core/money.dart         rupees, Indian grouping
lib/core/geo.dart           haversine, ported from manna_hr/geo.py
lib/core/server_clock.dart  the site's clock, learned off every response's Date header
lib/core/session.dart       the one connection, and the silent re-login behind it
lib/services/api.dart       sign-in, and every read and write of the employee's own
lib/services/admin_api.dart HR's reads — nothing but reads
lib/ui/brand.dart           the Manna orange and the pieces every screen is built from
lib/screens/                sign in · role · employee shell · punch · month · leave · profile · payslip · settings
lib/screens/admin/          HR shell · home · day · employees · leave requests · reports
```

```bash
flutter pub get
flutter test          # 118 tests, no site and no phone needed
flutter run           # a device or an emulator
flutter build apk --release
```

The APK is `com.mannagroup.manna_hr_app`, version 2.0.0, so it installs over
the employee app already on people's phones. **Uninstall Manna HR Admin**
(`com.mannagroup.manna_hr_admin`) from HR's phones; nothing replaces it but
this.

## Colour

The Manna orange: `#C2410C` and `#9A3412`, the two shades white text clears AA
on (the logo's own `#EF6C29` does not). A **day** is never drawn in the brand
colour — the month and HR's day use the dashboard's status key, so the phone and
the website agree about what green means.

## HR's side only reads

No punch for anybody else, no correction, no Attendance, no leave decision.
What HR's side writes is HR's own — their punch, leave request and correction,
through the same screens an employee uses. A day that is wrong
is corrected on the website, and leave is approved there by `kLeaveApprover`,
where the approval rules are — a phone that could do it too would be a second
set of rules (CLAUDE.md §1). Employees → a person opens their record with their
month, leave and payslips, all read under the HR login's own permissions.

HR's day follows the same order as the website (`client/src/lib/rules.js`) and
an employee's own month (`core/roster.dart`): a punch beats a leave record;
approved leave is time off; then a holiday or weekly off on the person's own
calendar; a leave nobody has decided is not time off; otherwise absent, or for
today, not in yet. A night shift's punch-out after midnight counts towards the
day the shift started.

## What it may write, and what it must not

**It writes three doctypes and none of them is `Attendance`** — all three from
the employee's side, as the person they are for. HR's side writes nothing.

| It writes | Which is |
|---|---|
| `Employee Checkin` | the punch |
| `Employee Attendance Regularization` | a *request* for a punch that is missing |
| `Leave Application` | a *request* for leave — an Open draft, never submitted |

Settings → Change Password changes the login's own password through Frappe's
`update_password`, and keeps the new one for the silent re-login.

It also uploads one private `File` per punch: the photo taken at the press,
carried on the checkin as `custom_photo` and shown on the dashboard's App
Punches page. Backing out of the camera stops the punch; a camera that will not
open or an upload that fails does not — the punch goes without a photo and the
dashboard draws it as having none. See `lib/services/photo.dart`.

`Attendance` is generated from `Employee Checkin` by the shift job. A
hand-written row is invisible to the thing that would have created it, and the
two disagree the moment anything is reprocessed — what disagrees is somebody's
pay. So the app asks for the punch, and approving the request is what records
one. See CLAUDE.md §5.

**Never `Attendance Regularization` under the short name.** That doctype on this
site belongs to the sales system next door, is keyed to `Sales Person`, and uses
`Initiated` where this one uses `Pending Approval`. Writing to it puts an HR
correction into a queue nobody reads.

---

## Nothing in this app decides anything

Every rule it appears to enforce is enforced on the server, by
`manna_hr/checkin.py`, on the server's clock:

| The app | The site |
|---|---|
| refuses to offer a punch outside 05:00–21:30 | `_check_punch_window` throws, on its own clock |
| stamps the punch with the site's clock | `_apply_server_clock` overwrites it anyway |
| sends the coordinate, and shows no distance | `_check_geofence` refuses nothing — `enforce_geofence` is off by default since 29 September 2026 |
| labels the punch `PHONE-<employee>` | `_classify_source` derives the source from that id |

The app's copy exists so that somebody standing at a gate gets a sentence
*before* the press instead of a failure after it. That is a kindness, not a
rule: a rule enforced only in a client is a suggestion to anyone holding `curl`
(CLAUDE.md §1).

**The device id is the part to be careful with.** A `device_id` starting with
the site's trusted prefix (`BIO-`, on `Manna HR Settings`) is classified as a
fingerprint machine, and a machine is exempt from both the geofence and the
server clock. `deviceIdFor` must never produce one, and there is a test named
after it.

---

## Errors round in the safe direction

Refusing somebody who did turn up is the expensive mistake: it costs a person
their day's pay and an argument with HR, while letting a doubtful punch through
costs a flag on a report a human reads. So:

- A punch with **no location fix** is still offered. The site decides, under
  HR's own `require_location_for_mobile` setting — not the handset's.
- A **coarse fix** is sent, with its accuracy shown. Indoors against concrete,
  Android answers from cell towers; refusing that would strand people at gates.
- Every refusal — too early, too late, too far, no location — **offers the
  correction** rather than leaving somebody to find it, and seeds it with the
  site's own message so an approver reads what actually happened.
- A day with **no punches on it and no holiday list behind it** is drawn absent
  *and said out loud*, because "nobody punched" and "nothing here knows which
  days are Sundays" are opposite findings on a screen somebody is paid from.

---

## Known-incomplete

- **The server rules are not running yet.** `manna_hr/checkin.py` is a
  controller on doctypes the site currently holds as `custom: 1`, and a custom
  doctype is a table and a form — the `.py` beside it is not part of it
  (CLAUDE.md §7). Until the app is installed on the site, the window, the
  geofence and the server clock are *only* what this app does, which is the
  state §1 says a rule must never be left in. Installing the app is the fix, not
  a commit here.
- **The password is kept in app-private storage** so that a session expiring at
  two in the afternoon does not lose somebody their punch-out at five. It is not
  encrypted. The honest fix is a whitelisted server method that mints an API
  token for the caller's own user — Frappe's stock `generate_keys` is System
  Manager only, so an ordinary employee cannot mint one. See
  `core/auth_store.dart`.
- **Night shifts crossing midnight are not handled.** The correction sheet
  refuses an out that is not after the in, and says why. A night worker's day
  belongs to the day it started, and that has to be settled on the site's Shift
  Type window before anybody is paid from it.
- **Leave is asked for, never decided, from the phone.** Apply Leave raises an
  Open draft to `kLeaveApprover`; approving it is on the dashboard.
- **A payslip is read, not downloaded.** The screen shows the submitted slip's
  own figures; the PDF is on the website.
- **Android only.** iOS was not set up, matching the field-sales app next door.
