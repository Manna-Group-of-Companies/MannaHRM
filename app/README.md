# Manna HR — the phone app

Punch in, punch out, the month behind them, and the correction that fixes a day
the machines missed. Four screens, and every one of them writes straight to the
ERPNext site as the person signed in.

```
lib/core/punch_rules.dart   which way the next punch goes, the working window, a day's pair
lib/core/roster.dart        one person's month — the status priority order
lib/core/geo.dart           haversine, ported from manna_hr/geo.py
lib/core/server_clock.dart  the site's clock, learned off every response's Date header
lib/core/session.dart       the one connection, and the silent re-login behind it
lib/services/api.dart       every read and write, in one file
lib/screens/               login · punch · calendar · corrections · the correction sheet
```

```bash
flutter pub get
flutter test          # 48 tests, no site and no phone needed
flutter run           # a device or an emulator
flutter build apk --release
```

---

## What it may write, and what it must not

**It writes two doctypes and neither of them is `Attendance`.**

| It writes | Which is |
|---|---|
| `Employee Checkin` | the punch |
| `Employee Attendance Regularization` | a *request* for a punch that is missing |

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
| shows the distance to the work location | `_check_geofence` measures it and refuses |
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
- **No leave screen.** Applying for leave is on the dashboard and on the desk;
  the calendar reads leave and draws it, and does not write it.
- **Android only.** iOS was not set up, matching the field-sales app next door.
