import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/day.dart';

export 'package:manna_hr_app/ui/brand.dart' show Avatar, EmptyNote;

/// The colour a state is drawn in. Status colours, not the brand: a day in and
/// out is green everywhere HR looks, and an absence is red. The website's
/// status text shades, light and dark (`client/src/styles/themes.css`).
Color stateColor(BuildContext context, DayState s) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  Color pick(int light, int night) => Color(dark ? night : light);
  return switch (s) {
    DayState.inOut => pick(0xFF117B42, 0xFF4FD58A),
    DayState.inOnly => pick(0xFF856800, 0xFFF5C518),
    DayState.onLeave => pick(0xFF2459C4, 0xFF7EA6FF),
    DayState.holiday || DayState.weekOff => pick(0xFF666C7A, 0xFF9AA3B2),
    DayState.leavePending => pick(0xFF856800, 0xFFF5C518),
    DayState.absent => pick(0xFFC73439, 0xFFFF7A7E),
    DayState.notYetIn => pick(0xFF666C7A, 0xFF8991A0),
  };
}

/// A state, as a small pill.
class StateChip extends StatelessWidget {
  const StateChip(this.state, {super.key, this.today = false, this.text});

  final DayState state;
  final bool today;
  final String? text;

  @override
  Widget build(BuildContext context) {
    final c = stateColor(context, state);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: c.withValues(alpha: .12), borderRadius: BorderRadius.circular(20)),
      child: Text(text ?? stateLabel(state, today: today),
          style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

/// Code and department under a name, whichever of them the record has.
String subline(Person p) =>
    [p.number, p.department.isEmpty ? p.designation : p.department].where((s) => s.isNotEmpty).join(' · ');

/// `2026-09-16` → `16 Sep`.
String shortDate(String iso) {
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (iso.length < 10) return iso;
  final m = int.tryParse(iso.substring(5, 7)) ?? 1;
  return '${int.parse(iso.substring(8, 10))} ${mon[m - 1]}';
}

