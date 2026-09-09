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

/// What this app calls itself on a punch.
///
/// **It must not start with the site's trusted device prefix** (`BIO-` by
/// default, on `Manna HR Settings`), and must not start with `REG-`. A punch
/// whose `device_id` starts with the trusted prefix is classified as coming
/// off a fingerprint machine, and a fingerprint machine is exempt from the
/// geofence and from the server clock — which is the whole of what makes a
/// phone punch trustworthy. See `manna_hr/checkin.py::_classify_source`.
const String kDeviceIdPrefix = 'PHONE-';

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
