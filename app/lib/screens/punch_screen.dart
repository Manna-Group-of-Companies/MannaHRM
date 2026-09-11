import 'dart:async';

import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/geo.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/screens/calendar_screen.dart';
import 'package:manna_hr_app/screens/correction_sheet.dart';
import 'package:manna_hr_app/screens/corrections_screen.dart';
import 'package:manna_hr_app/screens/login_screen.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/services/location.dart';

/// The first letter of a name, for the avatar — or `?`.
///
/// `?? '?'` guarded null and not the empty string, and `.characters.first` on
/// an empty string is a `StateError`: an Employee saved with a blank name took
/// the whole punch screen down with it, button included.
String initialOf(Object? name) {
  final s = '${name ?? ''}'.trim();
  return s.isEmpty ? '?' : s.characters.first.toUpperCase();
}

/// Punch in, punch out.
///
/// The whole screen is one button and the reason it says what it says. Which
/// way the button goes is read off the day's own punches — see [nextLogType] —
/// rather than kept as a flag, because a flag on a phone and a row on the site
/// disagree the first time somebody punches at a fingerprint machine and then
/// opens this.
class PunchScreen extends StatefulWidget {
  const PunchScreen({super.key});

  @override
  State<PunchScreen> createState() => _PunchScreenState();
}

class _PunchScreenState extends State<PunchScreen> {
  List<Map<String, dynamic>> _today = const [];
  Map<String, dynamic>? _place;
  Fix? _fix;
  bool _loading = true;
  bool _busy = false;
  String _error = '';
  Timer? _tick;

  /// The day [_today] was read for. The screen stays open across midnight on a
  /// night shift, and without this the button would go on offering a punch-out
  /// against yesterday's punch-in.
  String _loadedFor = '';

  /// The day a read was last *attempted* for. Separate from [_loadedFor] so a
  /// read that fails at midnight — no signal on the night bus — is tried once
  /// rather than once a second for as long as the screen is open.
  String _triedFor = '';

  /// True only when the site *answered* that no Employee carries this user.
  /// A read that failed is not that answer, and must not draw the card that
  /// sends somebody to HR.
  bool _linkMissing = false;

  String get _iso => isoDay(ServerClock.I.now());
  String get _next => nextLogType(_today);

  @override
  void initState() {
    super.initState();
    _load();
    // The clock on screen is the site's, so it has to move. One second is the
    // resolution somebody watching a punch land expects.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final day = _iso;
      if (_loadedFor.isNotEmpty && _loadedFor != day && _triedFor != day &&
          !_loading && !_busy) {
        _load(quiet: true);
      }
      setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  /// [quiet] keeps what is on screen while the site is asked again — after a
  /// punch, the list growing by one row is the confirmation, and blanking the
  /// whole screen to a spinner first hides the very thing that just happened.
  Future<void> _load({bool quiet = false}) async {
    setState(() {
      if (!quiet) _loading = true;
      _error = '';
    });
    final day = _iso;
    _triedFor = day;
    // A new day starts empty rather than carrying yesterday's punches forward
    // until the read lands. Which way the button points is read off this list,
    // and yesterday's IN would offer a punch-OUT to somebody arriving for work;
    // an empty list offers IN, the punch that cannot make a day worse.
    if (_loadedFor.isNotEmpty && _loadedFor != day) _today = const [];
    try {
      if (Session.I.employee == null) {
        final found = await Api.resolveEmployee();
        _linkMissing = found == null;
      }
      final punches = await Api.punchesOn(day);
      final place = await Api.workLocation();
      if (!mounted) return;
      setState(() {
        _today = punches;
        _place = place;
        _loadedFor = day;
      });
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _say(String m) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(m), duration: const Duration(seconds: 4)));

  Future<void> _punch() async {
    final direction = _next;

    // The window, checked here only so the answer arrives before the press. The
    // site checks it again on its own clock and is what actually refuses.
    final refusal = punchRefusal(ServerClock.I.now());
    if (refusal != null) {
      await _refusedWithCorrection(refusal);
      return;
    }

    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      // The fix is asked for and never insisted on. A punch with no coordinate
      // is recorded or refused by the *site*, under HR's own
      // `require_location_for_mobile` setting — refusing it here would be this
      // app deciding somebody's pay, which is exactly what it must not do.
      final fix = await currentFix();
      if (mounted) setState(() => _fix = fix);

      await Api.punch(
        logType: direction,
        latitude: fix.latitude,
        longitude: fix.longitude,
      );
      if (!mounted) return;
      _say(direction == kLogIn
          ? 'Punched in at ${clockOf(stampOf(ServerClock.I.now()))} ✓'
          : 'Punched out at ${clockOf(stampOf(ServerClock.I.now()))} ✓');
      await _load(quiet: true);
    } catch (e) {
      if (!mounted) return;
      await _refusedWithCorrection(humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// A punch that did not happen, and the one thing that can still be done
  /// about it.
  ///
  /// Every refusal on this path — too early, too late, too far from the gate,
  /// no location — leaves somebody who did turn up with no record of it. The
  /// answer the site's own messages point at is a correction, so the offer is
  /// made here rather than left to be found.
  Future<void> _refusedWithCorrection(String message) async {
    if (!mounted) return;
    setState(() => _error = message);
    final take = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Not recorded'),
        content: Text('$message\n\nAsk for a correction for today instead?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Not now')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Ask for a correction')),
        ],
      ),
    );
    if (take != true || !mounted) return;
    final pair = dayPunches(_today);
    final made = await showCorrectionSheet(
      context,
      iso: _iso,
      seedIn: seedFrom(pair.inAt),
      seedOut: seedFrom(pair.outAt),
      note: message,
    );
    if (made && mounted) _say('Sent for approval ✓');
  }

  Future<void> _signOut() async {
    await Api.logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final emp = Session.I.employee;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Manna HR'),
        actions: [
          IconButton(
            tooltip: 'My month',
            icon: const Icon(Icons.calendar_month),
            onPressed: () async {
              await Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => const CalendarScreen()));
              if (mounted) _load();
            },
          ),
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'corrections') {
                await Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const CorrectionsScreen()));
              }
              if (v == 'refresh') await _load();
              if (v == 'signout') await _signOut();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'corrections', child: Text('My corrections')),
              PopupMenuItem(value: 'refresh', child: Text('Refresh')),
              PopupMenuItem(value: 'signout', child: Text('Sign out')),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            if (emp != null)
              _whoCard(emp)
            else if (_linkMissing)
              _noEmployeeCard(),
            const SizedBox(height: 6),
            _clockCard(),
            const SizedBox(height: 10),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 36),
                child: Center(child: CircularProgressIndicator()),
              )
            else ...[
              _punchButton(enabled: emp != null),
              const SizedBox(height: 10),
              _locationLine(),
              const SizedBox(height: 14),
              _todayCard(),
            ],
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFFECACA)),
                ),
                child: Text(_error,
                    style: const TextStyle(color: Color(0xFF991B1B))),
              ),
            ],
            // At the foot, small, and out of the way of the one control that
            // matters. A mark over the punch button would be a logo somebody
            // has to look past every morning.
            const SizedBox(height: 28),
            Center(
              child: Image.asset('assets/manna_logo.png',
                  height: 26, fit: BoxFit.contain),
            ),
          ],
        ),
      ),
    );
  }

  Widget _whoCard(Map<String, dynamic> emp) {
    final bits = [
      '${emp['employee_number'] ?? ''}',
      '${emp['designation'] ?? ''}',
      '${emp['company'] ?? ''}',
    ].where((s) => s.isNotEmpty).join(' · ');
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: const Color(0xFFEA580C),
          child: Text(
            initialOf(emp['employee_name']),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
          ),
        ),
        title: Text('${emp['employee_name'] ?? ''}',
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text([
          bits,
          if ('${emp['default_shift'] ?? ''}'.isNotEmpty)
            'Shift: ${emp['default_shift']}'
          else
            'No shift on your record — ask HR',
        ].join('\n')),
        isThreeLine: true,
      ),
    );
  }

  /// Signed in, and nothing to punch against.
  ///
  /// A real state, and one worth naming rather than drawing as an empty month:
  /// the link between a Frappe user and an employee is `user_id` on the
  /// Employee record, and only HR can set it.
  Widget _noEmployeeCard() {
    return Card(
      color: const Color(0xFFFFF7ED),
      child: const Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('No employee record is linked to this login',
                style: TextStyle(fontWeight: FontWeight.w700)),
            SizedBox(height: 8),
            Text(
              'You are signed in, but nothing here knows who you are on the '
              'attendance side, so there is nobody to punch for. Ask HR to put '
              'your user id on your Employee record — the field is User ID.',
            ),
          ],
        ),
      ),
    );
  }

  Widget _clockCard() {
    final now = ServerClock.I.now();
    final skew = ServerClock.I.skew;
    final drifted = skew.abs() > const Duration(minutes: 1);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  '${now.hour.toString().padLeft(2, '0')}:'
                  '${now.minute.toString().padLeft(2, '0')}:'
                  '${now.second.toString().padLeft(2, '0')}',
                  style: const TextStyle(
                      fontSize: 34, fontWeight: FontWeight.w700, height: 1),
                ),
                const SizedBox(width: 10),
                Text(
                  ServerClock.I.synced ? 'site time' : 'phone time',
                  style: TextStyle(
                      fontSize: 12,
                      color: Colors.black.withValues(alpha: .5)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(dmy(_iso),
                style: TextStyle(color: Colors.black.withValues(alpha: .6))),
            if (drifted) ...[
              const SizedBox(height: 8),
              // Said out loud because it is a real failure on these machines:
              // a device running eight minutes fast makes everybody at that
              // gate late. The punch is stamped by the site either way.
              Text(
                'This phone is ${skew.inMinutes.abs()} min '
                '${skew.isNegative ? 'ahead of' : 'behind'} the site. Your punch '
                'is stamped by the site, not by the phone.',
                style: const TextStyle(fontSize: 12.5, color: Color(0xFF92400E)),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _punchButton({required bool enabled}) {
    final isIn = _next == kLogIn;
    return SizedBox(
      height: 96,
      child: FilledButton.icon(
        style: FilledButton.styleFrom(
          backgroundColor: isIn ? const Color(0xFF0EA372) : const Color(0xFFB45309),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        ),
        onPressed: enabled && !_busy ? _punch : null,
        icon: _busy
            ? const SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Icon(isIn ? Icons.login : Icons.logout, size: 30),
        label: Text(
          isIn ? 'Punch in' : 'Punch out',
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  /// What the punch will carry, said before the press.
  ///
  /// The distance is shown where the site names a work location, because "you
  /// are 1.4 km from Keezhillam" before the button is the difference between
  /// walking fifty metres and arguing with HR afterwards. It is a reading and
  /// not a gate — the server measures the same thing and decides.
  Widget _locationLine() {
    final fix = _fix;
    final reading = _locationReading();
    // A fix can carry a coordinate *and* a caveat — the last place the phone
    // knew, when no fresh one came in time. The reading alone would present an
    // old position as where somebody is standing.
    if (fix == null || !fix.has || fix.problem.isEmpty) return reading;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      reading,
      const SizedBox(height: 3),
      Text(fix.problem,
          style: const TextStyle(fontSize: 12.5, color: Color(0xFF92400E))),
    ]);
  }

  Widget _locationReading() {
    final fix = _fix;
    final place = _place;
    final style = TextStyle(fontSize: 12.5, color: Colors.black.withValues(alpha: .6));

    if (fix == null) {
      return Text('Your location is read when you punch, and sent with it.',
          style: style);
    }
    if (!fix.has) {
      return Text(fix.problem, style: const TextStyle(fontSize: 12.5, color: Color(0xFF92400E)));
    }
    if (place != null &&
        isRealCoordinate(place['latitude'] as num?, place['longitude'] as num?)) {
      final metres = metresBetween(
        fix.latitude!,
        fix.longitude!,
        (place['latitude'] as num).toDouble(),
        (place['longitude'] as num).toDouble(),
      );
      final radius = (place['radius_metres'] as num?)?.toDouble() ?? 300;
      final inside = metres <= radius;
      return Text(
        '${formatDistance(metres)} from ${place['location_name']} '
        '${inside ? '· inside the fence' : '· outside the fence, so the site may refuse it'}',
        style: TextStyle(
            fontSize: 12.5,
            color: inside ? const Color(0xFF166534) : const Color(0xFF92400E)),
      );
    }
    return Text(
      'Location sent${fix.isCoarse ? ' · the fix is only good to about ${fix.accuracy!.round()} m' : ''}.',
      style: style,
    );
  }

  Widget _todayCard() {
    final pair = dayPunches(_today);
    final hours = spanHours(pair.inAt, pair.outAt);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Text('Today', style: TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              if (hours.isNotEmpty)
                Text('$hours worked',
                    style: TextStyle(color: Colors.black.withValues(alpha: .6))),
            ]),
            const SizedBox(height: 10),
            if (_today.isEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text('No punch yet today.',
                    style: TextStyle(color: Colors.black.withValues(alpha: .6))),
              )
            else
              // Every punch, not a pair. A gate that double-reads puts four rows
              // on a day, and a screen that showed two of them would look like
              // the machine was fine.
              ...(_today.map((p) => ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      '${p['log_type']}'.toUpperCase() == kLogOut
                          ? Icons.logout
                          : Icons.login,
                      color: '${p['log_type']}'.toUpperCase() == kLogOut
                          ? const Color(0xFFB45309)
                          : const Color(0xFF0EA372),
                    ),
                    title: Text(clockOf(p['time']),
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      [
                        '${p['log_type'] ?? ''}'.isEmpty
                            ? 'no direction recorded'
                            : '${p['log_type']}',
                        if ('${p['device_id'] ?? ''}'.isNotEmpty) '${p['device_id']}',
                      ].join(' · '),
                      style: const TextStyle(fontSize: 12),
                    ),
                  ))),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                icon: const Icon(Icons.edit_calendar_outlined, size: 18),
                label: const Text('Something missing? Ask for a correction'),
                onPressed: () async {
                  final made = await showCorrectionSheet(
                    context,
                    iso: _iso,
                    seedIn: seedFrom(pair.inAt),
                    seedOut: seedFrom(pair.outAt),
                  );
                  if (made && mounted) _say('Sent for approval ✓');
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
