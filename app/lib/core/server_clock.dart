import 'dart:io' show HttpDate;

/// The clock this app judges time-of-day by.
///
/// The phone's clock belongs to the person being measured. Android hands an app
/// whatever time the owner sets, so somebody who wants an 08:00 punch at 10:00
/// need only change one setting — which is why `manna_hr/checkin.py` overwrites
/// `time` with the server's own clock on every self-service punch rather than
/// comparing the two and complaining about a skew.
///
/// Every Frappe response carries a `Date` header, so the app learns the site's
/// skew for free. It uses it for two things and neither of them is a rule:
/// deciding what to *offer* (a punch the server is going to refuse is better
/// refused here, with a sentence), and printing a time next to a button.
///
/// Ported from the field-sales app's `core/server_clock.dart`, where it has run
/// against real phones since June 2026.
class ServerClock {
  static final ServerClock I = ServerClock._();
  ServerClock._();

  Duration _skew = Duration.zero;
  bool _synced = false;

  /// Whether the site has ever answered. Until it has, [now] is the phone's own
  /// clock and screens that care say so rather than implying otherwise.
  bool get synced => _synced;

  /// How far out the phone is. Worth showing when it is minutes rather than
  /// seconds: a device eight minutes fast makes everybody at that gate late,
  /// and that is a real failure on these machines (CLAUDE.md §7).
  Duration get skew => _skew;

  /// Feeds in the `Date` header of any response. Cheap, so the session
  /// interceptor calls it on every single one.
  void syncFromHeader(String? httpDate) {
    if (httpDate == null || httpDate.isEmpty) return;
    try {
      _skew = HttpDate.parse(httpDate).difference(DateTime.now().toUtc());
      _synced = true;
    } catch (_) {
      // Unparseable header — keep whatever skew we already had. A bad header is
      // not a reason to fall back to a clock we trust less.
    }
  }

  /// Now, as the site sees it, in the phone's own timezone.
  ///
  /// The site runs on Asia/Kolkata and so do the phones, so this is the same
  /// wall clock. It would not be for somebody travelling, and the server is
  /// what stamps the punch either way.
  DateTime now() => DateTime.now().add(_skew);
}
