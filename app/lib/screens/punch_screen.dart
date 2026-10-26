import 'dart:async';

import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/screens/correction_sheet.dart';
import 'package:manna_hr_app/services/address.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/services/device.dart';
import 'package:manna_hr_app/services/location.dart';
import 'package:manna_hr_app/services/photo.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// Punch in, punch out.
///
/// The whole screen is one button and the reason it says what it says. Which
/// way the button goes is read off the day's own punches — see [nextLogType] —
/// rather than kept as a flag, because a flag on a phone and a row on the site
/// disagree the first time somebody punches at a fingerprint machine and then
/// opens this.
class PunchScreen extends StatefulWidget {
  const PunchScreen({super.key, this.direction});

  /// `IN` or `OUT` when the person pressed one of the two buttons on a home
  /// screen — their word for which way this punch goes, as the key on a gate
  /// machine is. Left out, it is read off the day's punches.
  final String? direction;

  @override
  State<PunchScreen> createState() => _PunchScreenState();
}

class _PunchScreenState extends State<PunchScreen> {
  List<Map<String, dynamic>> _today = const [];
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

  String get _iso => isoDay(ServerClock.I.now());
  String get _next => widget.direction ?? nextLogType(_today);

  @override
  void initState() {
    super.initState();
    _load();
    // The clock on screen is the site's, so it has to move. One second is the
    // resolution somebody watching a punch land expects.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final day = _iso;
      if (_loadedFor.isNotEmpty && _loadedFor != day && _triedFor != day && !_loading && !_busy) {
        _load();
      }
      setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = '');
    final day = _iso;
    _triedFor = day;
    // A new day starts empty rather than carrying yesterday's punches forward
    // until the read lands. Which way the button points is read off this list,
    // and yesterday's IN would offer a punch-OUT to somebody arriving for work;
    // an empty list offers IN, the punch that cannot make a day worse.
    if (_loadedFor.isNotEmpty && _loadedFor != day) _today = const [];
    try {
      if (Session.I.employee == null) await Api.resolveEmployee();
      final punches = await Api.punchesOn(day);
      if (!mounted) return;
      setState(() {
        _today = punches;
        _loadedFor = day;
      });
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _say(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m), duration: const Duration(seconds: 4)));

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
      // The photo first, while the person is still looking at the phone. Backing
      // out of the camera is the only thing here that stops a punch, because it
      // is the person's own choice — see services/photo.dart.
      final snap = await takePunchPhoto();
      if (snap.cancelled) {
        if (mounted) _say('No photo taken, so the punch was not sent. Press again when ready.');
        return;
      }

      // The fix is asked for and never insisted on. A punch with no coordinate
      // is recorded or refused by the *site*, under HR's own
      // `require_location_for_mobile` setting — refusing it here would be this
      // app deciding somebody's pay, which is exactly what it must not do.
      // The upload runs beside it: both can take seconds at a gate, and neither
      // needs the other. The address is looked up off the fix, still beside the
      // upload, so on a slow photo it costs nothing.
      Fix? located;
      final got = await Future.wait<Object?>([
        currentFix().then((f) {
          located = f;
          return addressAt(f.latitude, f.longitude);
        }),
        snap.has ? Api.uploadPunchPhoto(snap.path!) : Future<String?>.value(null),
        deviceText(),
      ]);
      final fix = located!;
      final address = got[0] as String;
      final photoUrl = got[1] as String?;
      final device = got[2] as String;
      if (mounted) setState(() => _fix = fix);

      await Api.punch(
        logType: direction,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        address: address,
        photoUrl: photoUrl,
        device: device,
      );
      if (!mounted) return;
      final now = ServerClock.I.now();
      final photoNote = photoUrl != null
          ? ''
          : snap.problem.isNotEmpty
              ? snap.problem
              : 'The photo did not upload, so HR will see this punch without one.';
      Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => PunchDoneScreen(
          direction: direction,
          at: clockOf(stampOf(now)),
          iso: isoDay(now),
          where: address.isNotEmpty ? address : (fix.has ? 'Location sent' : fix.problem),
          note: photoNote,
        ),
      ));
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
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not now')),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Ask for a correction'),
          ),
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

  @override
  Widget build(BuildContext context) {
    final isIn = _next == kLogIn;
    final word = isIn ? 'Punch In' : 'Punch Out';
    final linked = Session.I.employee != null;
    final enabled = linked && !_busy && !_loading;
    return Scaffold(
      appBar: brandBar(_loading ? 'Punch' : word),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 28, 16, 32),
          children: [
            Center(
              child: GestureDetector(
                onTap: enabled ? _punch : null,
                child: Container(
                  width: 190,
                  height: 190,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: (isIn ? kGreen : kWarn).withValues(alpha: .14),
                  ),
                  alignment: Alignment.center,
                  child: Container(
                    width: 136,
                    height: 136,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      // Out is amber with navy on it: white on a pale amber
                      // is the one pairing here that fails contrast.
                      gradient: isIn
                          ? kPunchGradient
                          : const LinearGradient(colors: [kWarn, Color(0xFFE0A93A)]),
                      boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 18, offset: Offset(0, 8))],
                    ),
                    child: _busy || _loading
                        ? Center(
                            child: SizedBox(
                                width: 40, height: 40, child: CircularProgressIndicator(color: isIn ? Colors.white : kPage)))
                        : Icon(Icons.fingerprint, color: isIn ? Colors.white : kPage, size: 78),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(_busy ? 'Sending…' : 'Tap to $word',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: kInk)),
            const SizedBox(height: 22),
            if (!linked && !_loading)
              const Note(
                'Your login is not linked to an employee record, so there is nobody to punch for. '
                'Ask HR to set your user on your Employee record.',
                kind: NoteKind.warn,
              ),
            _detailsCard(),
            const SizedBox(height: 16),
            if (_error.isNotEmpty) Note(_error),
            FilledButton(
              style: isIn ? null : FilledButton.styleFrom(backgroundColor: kWarn, foregroundColor: kPage),
              onPressed: enabled ? _punch : null,
              child: Text(word),
            ),
            const SizedBox(height: 18),
            _todayCard(),
          ],
        ),
      ),
    );
  }

  Widget _detailsCard() {
    final now = ServerClock.I.now();
    final skew = ServerClock.I.skew;
    final drifted = skew.abs() > const Duration(minutes: 1);
    final hms = '${now.hour.toString().padLeft(2, '0')}:'
        '${now.minute.toString().padLeft(2, '0')}:'
        '${now.second.toString().padLeft(2, '0')}';
    return Panel(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        InfoRow(icon: Icons.location_on_outlined, label: 'Location', value: _locationText()),
        const Divider(height: 1, color: kLine),
        InfoRow(
          icon: Icons.access_time_rounded,
          label: ServerClock.I.synced ? 'Time · site clock' : 'Time · phone clock',
          value: hms,
        ),
        const Divider(height: 1, color: kLine),
        InfoRow(icon: Icons.calendar_today_outlined, label: 'Date', value: dmy(_iso)),
        // Said out loud because it is a real failure on these machines: a
        // device running eight minutes fast makes everybody at that gate late.
        // The punch is stamped by the site either way.
        if (drifted)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              'This phone is ${skew.inMinutes.abs()} min ${skew.isNegative ? 'ahead of' : 'behind'} the site. '
              'Your punch is stamped by the site, not by the phone.',
              style: const TextStyle(fontSize: 12.5, color: kWarn),
            ),
          ),
      ]),
    );
  }

  /// What the punch will carry, said before the press.
  ///
  /// No distance to a work location: the 1 km fence is off (29 September
  /// 2026), and a line saying somebody is "outside the fence" would warn them
  /// off a punch nothing refuses.
  String _locationText() {
    final fix = _fix;
    if (fix == null) return 'Taken with a photo when you punch';
    if (!fix.has) return fix.problem;
    // A fix can carry a coordinate *and* a caveat — the last place the phone
    // knew, when no fresh one came in time.
    final coarse = fix.isCoarse ? ' · good to about ${fix.accuracy!.round()} m' : '';
    return fix.problem.isEmpty ? 'Location sent$coarse' : '${fix.problem}$coarse';
  }

  Widget _todayCard() {
    final pair = dayPunches(_today);
    final hours = spanHours(pair.inAt, pair.outAt);
    return Panel(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Text('Today', style: TextStyle(fontWeight: FontWeight.w700, color: kInk)),
          const Spacer(),
          if (hours.isNotEmpty) Text('$hours worked', style: const TextStyle(color: kInk2)),
        ]),
        const SizedBox(height: 6),
        if (_today.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('No punch yet today.', style: TextStyle(color: kInk2)),
          )
        else
          // Every punch, not a pair. A gate that double-reads puts four rows
          // on a day, and a screen that showed two of them would look like
          // the machine was fine.
          ..._today.map((p) {
            final out = '${p['log_type']}'.toUpperCase() == kLogOut;
            return ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: Icon(out ? Icons.logout : Icons.login,
                  color: out ? kWarn : kGood),
              title: Text(clockOf(p['time']), style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(
                [
                  '${p['log_type'] ?? ''}'.isEmpty ? 'no direction recorded' : '${p['log_type']}',
                  if ('${p['device_id'] ?? ''}'.isNotEmpty) '${p['device_id']}',
                ].join(' · '),
                style: const TextStyle(fontSize: 12),
              ),
            );
          }),
        TextButton.icon(
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
      ]),
    );
  }
}

/// The punch landed. Drawn only once the site has said so — the insert came
/// back 2xx — never on the press.
class PunchDoneScreen extends StatelessWidget {
  const PunchDoneScreen({
    super.key,
    required this.direction,
    required this.at,
    required this.iso,
    required this.where,
    this.note = '',
  });

  final String direction;
  final String at;
  final String iso;
  final String where;

  /// What went with the punch and is worth saying — a photo that did not
  /// upload.
  final String note;

  @override
  Widget build(BuildContext context) {
    final isIn = direction == kLogIn;
    return Scaffold(
      appBar: brandBar(isIn ? 'Punch In' : 'Punch Out'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 40, 16, 24),
        children: [
          Center(
            child: Container(
              width: 120,
              height: 120,
              decoration: const BoxDecoration(shape: BoxShape.circle, color: kGreen),
              child: const Icon(Icons.check_rounded, color: Colors.white, size: 76),
            ),
          ),
          const SizedBox(height: 18),
          Text(isIn ? 'Punched in successfully' : 'Punched out successfully',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: kGood)),
          const SizedBox(height: 28),
          Panel(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(children: [
              InfoRow(icon: Icons.access_time_rounded, label: 'Time', value: at),
              const Divider(height: 1, color: kLine),
              InfoRow(icon: Icons.calendar_today_outlined, label: 'Date', value: dmy(iso)),
              const Divider(height: 1, color: kLine),
              InfoRow(icon: Icons.location_on_outlined, label: 'Location', value: where),
            ]),
          ),
          const SizedBox(height: 14),
          if (note.isNotEmpty) Note(note, kind: NoteKind.warn),
          const SizedBox(height: 10),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
        ],
      ),
    );
  }
}
