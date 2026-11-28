import 'dart:async';

import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/auth_store.dart';
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/offline_punches.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/screens/punch_screen.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/services/punch_queue.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// Today's punches for this login, with a Punch In and a Punch Out button.
///
/// On the employee's home. HR punch from here too, after switching sides —
/// HR's own home has no punch (asked for 21 October 2026). The button today's
/// punches point at is filled; the other is there for the day that needs it,
/// the way a gate machine has both keys.
///
/// Reads its own punches. A parent that wants it read again gives it a new
/// key.
class TodayCard extends StatefulWidget {
  const TodayCard({super.key, this.onPunched, this.compact = false});

  /// After the punch screen closes, so the page around it can read again.
  final VoidCallback? onPunched;

  /// HR's home: the status and the time side by side on one line, inside the
  /// header band, rather than the time large and centred.
  final bool compact;

  @override
  State<TodayCard> createState() => _TodayCardState();
}

class _TodayCardState extends State<TodayCard> with WidgetsBindingObserver {
  List<Map<String, dynamic>> _today = const [];
  bool _loading = true;
  String _error = '';

  /// The day [_today] is for, and when it was read: the app comes back to the
  /// front the next morning with yesterday still on the card otherwise, and
  /// the bright button pointing yesterday's way.
  String _readFor = '';
  DateTime _readAt = DateTime.now();

  /// The day last seen on this phone is on the card while today is read, so
  /// the buttons need not wait for a slow read to point the right way.
  bool _haveDay = false;

  int _seenCount = 0;

  /// Last night's punch-in, while that shift is still running — the card then
  /// says so, and Punch Out is the bright button.
  Map<String, dynamic>? _night;

  /// What the site holds for today plus the punches kept on this phone and not
  /// sent yet. Somebody who punched IN with no signal is in, and the card must
  /// say so — or the bright button offers IN again and a second one is kept.
  List<Map<String, dynamic>> get _shown =>
      withPending(_today, PunchQueue.I.items, isoDay(ServerClock.I.now()), Session.I.employeeId);

  void _onQueue() {
    if (!mounted) return;
    final n = PunchQueue.I.count.value;
    final fewer = n < _seenCount;
    _seenCount = n;
    setState(() {});
    // A kept punch has gone to the site. The card's own copy of the day was
    // read before it, so read again — or it says "You haven't punched in".
    if (fewer && !_loading) unawaited(_load());
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _seenCount = PunchQueue.I.count.value;
    PunchQueue.I.changed.addListener(_onQueue);
    PunchQueue.I.load().then((_) => _onQueue(), onError: (_) {});
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    PunchQueue.I.changed.removeListener(_onQueue);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || _loading) return;
    final stale = _readFor != isoDay(ServerClock.I.now()) ||
        DateTime.now().difference(_readAt) > const Duration(minutes: 5);
    if (stale) unawaited(_load());
  }

  Future<void> _load() async {
    final day = isoDay(ServerClock.I.now());
    setState(() {
      _loading = true;
      _error = '';
      // A new day starts empty, never with yesterday's punches.
      if (_readFor != day) {
        _today = const [];
        _haveDay = false;
      }
    });
    if (!_haveDay && Session.I.employeeId.isNotEmpty) {
      final seen = await AuthStore.loadDayPunches(day, employee: Session.I.employeeId);
      if (mounted && seen != null && _loading) {
        setState(() {
          _today = seen;
          _haveDay = true;
          _readFor = day;
        });
      }
    }
    try {
      final got = await Future.wait<Object?>([Api.punchesOn(day), Api.nightArrival(day)]);
      final rows = got[0] as List<Map<String, dynamic>>;
      if (mounted) {
        setState(() {
          _today = rows;
          _night = got[1] as Map<String, dynamic>?;
          _haveDay = true;
          _readFor = day;
          _readAt = DateTime.now();
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _punch(String direction) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PunchScreen(direction: direction)));
    if (!mounted) return;
    _load();
    widget.onPunched?.call();
  }

  @override
  Widget build(BuildContext context) {
    final linked = Session.I.employee != null;
    // A login no Employee record carries has nobody to punch for; the home
    // around this card says so and names the fix. Each button says which way
    // its punch goes, so a slow read never holds them once the day last seen
    // is on the card.
    final canPunch = linked && (!_loading || _haveDay);
    final shown = _shown;
    // Still on last night's shift: nothing yet today, and an evening IN
    // yesterday not yet followed by its OUT.
    final night = linked && shown.isEmpty ? _night : null;
    final pair = night != null ? (inAt: '${night['time']}', outAt: '') : dayPunches(shown);
    final next = night != null ? kLogOut : nextLogType(shown);
    final hours = spanHours(pair.inAt, pair.outAt);
    final punched = linked && (shown.isNotEmpty || night != null);
    // The big line is the latest thing that happened; the small one under it
    // carries the rest of the day.
    final headline = !linked
        ? 'Not linked'
        : !punched
            ? 'Not marked'
            : night != null
                ? 'In since ${clockOf(pair.inAt)} yesterday'
                : pair.outAt.isEmpty
                    ? 'In at ${clockOf(pair.inAt)}'
                    : 'Out at ${clockOf(pair.outAt)}';
    final detail = !linked
        ? 'No employee record carries this login'
        : night != null
            ? 'On last night\'s shift, in at ${clockOf(pair.inAt)}'
            // An OUT with no IN today (the end of a night) has no "In" to show.
            : punched && pair.outAt.isNotEmpty && pair.inAt.isNotEmpty
                ? 'In ${clockOf(pair.inAt)}${hours.isEmpty ? '' : '  ·  $hours h'}'
                : '';

    Widget button(String direction) {
      final isIn = direction == kLogIn;
      // One line always, shrunk on a narrow phone rather than broken in two.
      final label = FittedBox(fit: BoxFit.scaleDown, child: Text(isIn ? 'Punch In' : 'Punch Out', maxLines: 1));
      final onPressed = canPunch ? () => _punch(direction) : null;
      final main = !linked || next == direction;
      // The way today's punches point is the bright button; the other is
      // there for the day that needs it, the way a gate machine has both keys.
      if (widget.compact) {
        return main
            ? FilledButton(
                onPressed: onPressed, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)), child: label)
            : FilledButton(
                onPressed: onPressed,
                style: FilledButton.styleFrom(
                  backgroundColor: kGreenSoft,
                  foregroundColor: kAccent,
                  minimumSize: const Size.fromHeight(46),
                ),
                child: label,
              );
      }
      return FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: main ? kLime : Colors.white.withValues(alpha: .10),
          foregroundColor: main ? kOnLime : Colors.white,
          disabledBackgroundColor: Colors.white.withValues(alpha: .08),
          disabledForegroundColor: Colors.white38,
          minimumSize: const Size.fromHeight(48),
          side: main ? null : BorderSide(color: Colors.white.withValues(alpha: .18)),
        ),
        child: label,
      );
    }

    // The punch most people are about to press goes first and widest.
    final first = next == kLogOut ? kLogOut : kLogIn;
    final second = first == kLogIn ? kLogOut : kLogIn;
    final buttons = Row(children: [
      Expanded(child: button(first)),
      const SizedBox(width: 10),
      Expanded(child: button(second)),
    ]);
    final tone = _error.isNotEmpty ? kBad : (punched ? kGood : kInk2);

    if (widget.compact) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: kPage, borderRadius: BorderRadius.circular(18)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Your Attendance',
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: kInk2)),
                const SizedBox(height: 6),
                Row(children: [
                  Icon(Icons.circle, size: 8, color: tone),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(punched ? 'Present' : (_loading ? 'Reading…' : 'Not marked'),
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: tone)),
                  ),
                ]),
              ]),
            ),
            if (punched)
              Text(headline, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: kInk)),
          ]),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(_error, style: const TextStyle(color: kBad, fontSize: 12.5)),
          ],
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: button(kLogIn)),
            const SizedBox(width: 10),
            Expanded(child: button(kLogOut)),
          ]),
        ]),
      );
    }

    // The dark green card: what happened last, large, and the button for
    // what comes next in lime.
    final title = !linked
        ? 'Not linked yet'
        : _loading
            ? 'Reading today…'
            : !punched
                ? "You haven't punched in"
                : pair.outAt.isEmpty
                    ? "You're punched in"
                    : "You're punched out";
    final time = !punched ? '--:--' : clockOf(pair.outAt.isEmpty ? pair.inAt : pair.outAt);
    const soft = Color(0xB3FFFFFF);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: kBrandGradient,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Stack(children: [
        // Two faint rings in the corner, as the picture has them.
        Positioned(
          right: -60,
          top: -70,
          child: Container(
            width: 200,
            height: 200,
            decoration: BoxDecoration(
                shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: .07), width: 26)),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text("Today's attendance",
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: soft)),
            const SizedBox(height: 6),
            Text(title, style: serif(22, color: Colors.white)),
            const SizedBox(height: 12),
            // The time shrinks before anything spills: a 320-wide phone with
            // large text still gets the whole of it and the tag beside it.
            Row(children: [
              Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(time, style: serif(34, color: Colors.white, weight: FontWeight.w800)),
                ),
              ),
              const SizedBox(width: 12),
              if (punched)
                StatusTag('Present',
                    color: kLime, icon: Icons.circle, background: Colors.white.withValues(alpha: .12)),
            ]),
            if (detail.isNotEmpty || !linked) ...[
              const SizedBox(height: 4),
              Text(detail.isNotEmpty ? detail : 'No employee record carries this login',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: soft)),
            ],
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(_error, style: const TextStyle(color: Color(0xFFFFB4A8), fontSize: 13)),
            ],
            const SizedBox(height: 16),
            buttons,
          ]),
        ),
      ]),
    );
  }
}
