# Manna HR Admin — the phone app for HR

One day, for everybody: who punched and when, who is absent, who is on leave,
and whose leave is still waiting for a decision. Sign in with the same ERPNext
login used on the website; the app is for logins that are **HR User** or
**HR Manager** on the site, and tells anybody else so.

```
lib/core/day.dart        one day, for everybody — the only place a day is decided here
lib/services/api.dart    every read, and nothing but reads
lib/screens/             sign in · the day (Punches / Absent / Leave) · one person's punches
lib/core/session.dart    the connection and the silent re-login — the employee app's
```

```bash
flutter pub get
flutter test               # 24 tests, no site and no phone needed
flutter build apk --release
```

The APK lands in `build/app/outputs/flutter-apk/app-release.apk`. It installs
beside the employee app (`app/`): a different package,
`com.mannagroup.manna_hr_admin`.

## It only reads

No punch, no correction, no Attendance. A day that is wrong is corrected on the
website, where the approval rules are — a phone that could do it too would be a
second set of rules (CLAUDE.md §1). What the app shows is whatever the signed-in
login's roles let it read.

## How a day is decided

The same order as the website (`client/src/lib/rules.js`) and the employee app
(`app/lib/core/roster.dart`), so the three never disagree about one person:

1. **A punch beats a leave record.**
2. **Approved leave** is time off.
3. **A holiday or weekly off** on the person's calendar — their Holiday List,
   else their company's default.
4. **A leave nobody has decided is not time off.** It is listed under Absent,
   marked, and under Leave → Waiting for approval.
5. Otherwise **absent** — or, for today, **not in yet**.

A night shift's punch-out after midnight counts towards the day the shift
started (`shift_start` on the checkin). A punch the site has **set aside**
(`skip_auto_attendance`) still shows the person was there; it is marked, so a
day that looks wrong on the website can be explained from the phone.

## Signing

`flutter build apk --release` signs with this PC's debug key, as `flutter create`
sets it up. An update installs over the old app only when it is signed with the
same key, so build updates on the same PC — or set up a release key before the
app goes to more than a few phones.
