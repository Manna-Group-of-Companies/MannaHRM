import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/screens/punch_screen.dart';
import 'package:manna_hr_app/services/api.dart';
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

class _TodayCardState extends State<TodayCard> {
  List<Map<String, dynamic>> _today = const [];
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final rows = await Api.punchesOn(isoDay(ServerClock.I.now()));
      if (mounted) setState(() => _today = rows);
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
    // around this card says so and names the fix.
    final canPunch = linked && !_loading;
    final pair = dayPunches(_today);
    final next = nextLogType(_today);
    final hours = spanHours(pair.inAt, pair.outAt);
    final punched = linked && _today.isNotEmpty;
    // The big line is the latest thing that happened; the small one under it
    // carries the rest of the day.
    final headline = !linked
        ? 'Not linked'
        : !punched
            ? 'Not marked'
            : pair.outAt.isEmpty
                ? 'In at ${clockOf(pair.inAt)}'
                : 'Out at ${clockOf(pair.outAt)}';
    final detail = !linked
        ? 'No employee record carries this login'
        : punched && pair.outAt.isNotEmpty
            ? 'In ${clockOf(pair.inAt)}${hours.isEmpty ? '' : '  ·  $hours h'}'
            : '';
    final status = _loading
        ? 'Reading…'
        : _error.isNotEmpty
            ? _error
            : headline;

    Widget button(String direction) {
      final isIn = direction == kLogIn;
      final label = Text(isIn ? 'Punch In' : 'Punch Out');
      final onPressed = canPunch ? () => _punch(direction) : null;
      // The way today's punches point is the white pill; the other is a dark
      // one, there for the day that needs it, the way a gate machine has both
      // keys.
      return linked && next != direction
          ? FilledButton(
              onPressed: onPressed,
              style: FilledButton.styleFrom(
                backgroundColor: kField,
                foregroundColor: kInk,
                side: const BorderSide(color: kCardLine),
                minimumSize: const Size.fromHeight(46),
              ),
              child: label,
            )
          : FilledButton(
              onPressed: onPressed,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
              child: label,
            );
    }

    final buttons = Row(children: [
      Expanded(child: button(kLogIn)),
      const SizedBox(width: 12),
      Expanded(child: button(kLogOut)),
    ]);
    final tone = _error.isNotEmpty ? kBad : (punched ? kGood : kInk2);

    if (widget.compact) {
      return Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: kRaised.withValues(alpha: .55),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: kCardLine),
        ),
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
          const SizedBox(height: 16),
          buttons,
        ]),
      );
    }

    return Panel(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Expanded(
            child: Text("Today's Attendance",
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: kInk2)),
          ),
          if (punched) const StatusTag('Present', color: kGood, icon: Icons.check_circle_rounded),
        ]),
        const SizedBox(height: 14),
        Text(status,
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: _error.isNotEmpty ? 14 : 28,
                fontWeight: FontWeight.w800,
                color: _error.isNotEmpty ? kBad : kInk)),
        if (detail.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(detail,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: kInk2)),
        ],
        const SizedBox(height: 18),
        buttons,
      ]),
    );
  }
}
