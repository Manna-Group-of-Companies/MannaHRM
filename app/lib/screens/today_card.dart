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
  const TodayCard({super.key, this.onPunched});

  /// After the punch screen closes, so the page around it can read again.
  final VoidCallback? onPunched;

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
    final (dot, line) = !linked
        ? (kInk2, 'Not linked to an employee record yet')
        : _today.isEmpty
            ? (kInk2, 'Not marked')
            : pair.outAt.isEmpty
                ? (kTileGreen, 'In at ${clockOf(pair.inAt)}')
                : (kTileGreen,
                    'In ${clockOf(pair.inAt)}  ·  Out ${clockOf(pair.outAt)}${hours.isEmpty ? '' : '  ·  $hours h'}');

    Widget button(String direction) {
      final isIn = direction == kLogIn;
      final label = Text(isIn ? 'Punch In' : 'Punch Out');
      final icon = Icon(isIn ? Icons.login_rounded : Icons.logout_rounded);
      final onPressed = canPunch ? () => _punch(direction) : null;
      return linked && next != direction
          ? OutlinedButton.icon(
              onPressed: onPressed,
              icon: icon,
              label: label,
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
                foregroundColor: kInk,
                side: const BorderSide(color: kFieldLine),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                textStyle: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700),
              ),
            )
          : FilledButton.icon(onPressed: onPressed, icon: icon, label: label);
    }

    return Material(
      color: kCard,
      elevation: 3,
      shadowColor: Colors.black26,
      borderRadius: BorderRadius.circular(18),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text("Today's Attendance", style: TextStyle(fontWeight: FontWeight.w700, color: kInk)),
          const SizedBox(height: 6),
          Row(children: [
            Icon(Icons.circle, size: 8, color: dot),
            const SizedBox(width: 6),
            Expanded(
              child: Text(_loading ? 'Reading…' : (_error.isNotEmpty ? _error : line),
                  style: TextStyle(color: _error.isNotEmpty ? kBad : kInk2)),
            ),
          ]),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: button(kLogIn)),
            const SizedBox(width: 12),
            Expanded(child: button(kLogOut)),
          ]),
        ]),
      ),
    );
  }
}
