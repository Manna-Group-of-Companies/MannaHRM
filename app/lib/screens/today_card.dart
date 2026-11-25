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
