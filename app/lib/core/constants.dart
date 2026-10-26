/// The few values this app cannot derive, in one place.
///
/// Everything else it needs — the shift, the holiday list, the geofence radius,
/// the punch window — is on the site, because those are the numbers HR changes
/// and a number changed by a deploy is a number that does not get changed.
library;

/// The ERPNext site. There is no server of ours in between: this app holds the
/// person's own Frappe session and every read and write is logged on the site
/// as them (CLAUDE.md §1). It is overridable on the sign-in screen because a
/// test bench is a different host and nobody should have to rebuild an APK to
/// reach one.
const String kDefaultSiteUrl = 'https://mannarubber.m.frappe.cloud';

/// The punch. Generated `Attendance` is derived from these rows by the shift
/// job, and this app never writes that — CLAUDE.md §5.
const String kCheckinDoctype = 'Employee Checkin';

/// Ours, under its full name. **Never `Attendance Regularization`**, which on
/// this site belongs to the sales system next door, is keyed to `Sales Person`,
/// and would put an HR correction into a queue nobody reads.
const String kRegularizationDoctype = 'Employee Attendance Regularization';

/// The status a correction is raised in. `Employee Attendance Regularization`
/// says `Pending Approval` where the sales doctype says `Initiated`; writing
/// the wrong word leaves a request that no queue selects for.
const String kOpenStatus = 'Pending Approval';

/// Leave, applied for from the app (19 October 2026) — hrms's own doctype.
/// Raised as a draft with status [kLeaveOpen]; approving it on the dashboard
/// submits it, and hrms then marks the days On Leave by itself.
const String kLeaveDoctype = 'Leave Application';
const String kLeaveOpen = 'Open';

/// Who decides leave asked for from the app: the administrator, and nobody
/// else (asked for 19 October 2026). The dashboard shows the leave queue to
/// this login alone — `PAGE_ADMINS` in client/src/data/menus.js, which a
/// client test pins to this value.
const String kLeaveApprover = 'hr@mannarubber.com';

/// What this app calls itself on a punch.
///
/// **It must not start with the site's trusted device prefix** (`BIO-` by
/// default, on `Manna HR Settings`), and must not start with `REG-`. A punch
/// whose `device_id` starts with the trusted prefix is classified as coming
/// off a fingerprint machine, and a fingerprint machine is exempt from the
/// geofence and from the server clock — which is the whole of what makes a
/// phone punch trustworthy. See `manna_hr/checkin.py::_classify_source`.
const String kDeviceIdPrefix = 'PHONE-';

/// Where the punch photo lands on `Employee Checkin` — an Attach Image custom
/// field, declared in `manna_hr/install.py`. Read by the dashboard's App
/// Punches page under the same name.
const String kPhotoField = 'custom_photo';

/// What the phone said about the punch, beside the coordinate and the photo:
/// how good the fix claimed to be, and which handset sent it. Both are Data
/// custom fields in `manna_hr/install.py`, drawn in the dashboard's Punch Info
/// column. **They describe and decide nothing** — both are the punching
/// person's own phone talking, so the site never judges by either.
const String kAccuracyField = 'custom_location_accuracy';
const String kDeviceInfoField = 'custom_device_info';

/// The street the punch was made in, by the phone's own geocoder — see
/// `services/address.dart`. A caption beside the coordinate, never a verdict.
const String kAddressField = 'custom_punch_address';

/// The working window, repeated from `Manna HR Settings`' shipped defaults.
///
/// **This app is not what enforces it.** The server checks the same two numbers
/// on every punch, on its own clock, and refuses there. These exist so the app
/// can say "punching opens at 5:00, ask for a regularization instead" before
/// somebody stands at a gate pressing a button that is going to fail — which is
/// a kinder error, not a rule.
const int kPunchInFromMinute = 5 * 60;
const int kPunchOutUntilMinute = 21 * 60 + 30;

/// How long a page of a list read may be. Frappe's own default is 20, which
/// would silently return two thirds of a month.
const int kListPageLength = 500;

/// A punch-out after midnight belongs to the night shift that started the day
/// before (CLAUDE.md §5), so HR's day view reads this far into the next one and
/// places each punch by its shift's start. Past noon nobody is still leaving
/// yesterday's shift.
const int kNextDayHours = 14;

/// What the sign-in screen and Settings → About say. pubspec.yaml's `version`
/// is the store's; keep the two together.
const String kAppVersion = '2.0.0';
