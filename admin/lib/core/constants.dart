/// The few values this app cannot derive, in one place.
library;

/// The ERPNext site. There is no server of ours in between: this app holds
/// the HR login's own Frappe session, and every read is made as them — their
/// roles decide what they are shown (CLAUDE.md §1). Overridable on the sign-in
/// screen so a test bench can be reached without rebuilding the APK.
const String kDefaultSiteUrl = 'https://mannarubber.m.frappe.cloud';

/// How long a page of a list read may be. Frappe's own default is 20, which
/// would silently show a fifth of the group.
const int kListPageLength = 500;

/// A punch-out after midnight belongs to the night shift that started the day
/// before (CLAUDE.md §5), so the day's read runs this far into the next one
/// and each punch is placed by its shift's start. Past noon nobody is still
/// leaving yesterday's shift.
const int kNextDayHours = 14;
