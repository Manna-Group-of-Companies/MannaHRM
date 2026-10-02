import 'package:flutter/material.dart';

import 'package:manna_hr_admin/core/day.dart';

/// The colour a state is drawn in. Status colours, not the brand: a day in and
/// out is green everywhere HR looks, and an absence is red.
Color stateColor(BuildContext context, DayState s) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  Color pick(int light, int night) => Color(dark ? night : light);
  return switch (s) {
    DayState.inOut => pick(0xFF15803D, 0xFF4ADE80),
    DayState.inOnly => pick(0xFFB45309, 0xFFFBBF24),
    DayState.onLeave => pick(0xFF1D4ED8, 0xFF93C5FD),
    DayState.holiday || DayState.weekOff => pick(0xFF475569, 0xFFCBD5E1),
    DayState.leavePending => pick(0xFFB45309, 0xFFFBBF24),
    DayState.absent => pick(0xFFB91C1C, 0xFFFCA5A5),
    DayState.notYetIn => pick(0xFF64748B, 0xFFCBD5E1),
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

/// A person's initials in a circle.
class Initials extends StatelessWidget {
  const Initials(this.name, {super.key, this.color});

  final String name;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    final text = parts.isEmpty
        ? '?'
        : (parts.length == 1 ? parts.first.substring(0, 1) : '${parts.first[0]}${parts.last[0]}').toUpperCase();
    final c = color ?? Theme.of(context).colorScheme.primary;
    return CircleAvatar(
      radius: 20,
      backgroundColor: c.withValues(alpha: .12),
      child: Text(text, style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: 14)),
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

/// A message in the middle of a list that has nothing in it.
class EmptyNote extends StatelessWidget {
  const EmptyNote(this.title, this.body, {super.key, this.icon = Icons.inbox_outlined});

  final String title;
  final String body;
  final IconData icon;

  @override
  Widget build(BuildContext context) => ListView(
        // A list, so pull-to-refresh still works on an empty tab.
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(32, 64, 32, 32),
        children: [
          Icon(icon, size: 44, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(body, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium),
        ],
      );
}
