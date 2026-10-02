import 'package:flutter/material.dart';

import 'package:manna_hr_admin/core/day.dart';
import 'package:manna_hr_admin/screens/widgets.dart';

/// Every punch behind one person's day, to the second, with where each came
/// from — the question somebody asks when the website shows a day they say is
/// wrong.
Future<void> showPunchSheet(BuildContext context, PersonDay d, String date) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: .5,
        maxChildSize: .9,
        builder: (context, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [
            Text(d.person.name, style: Theme.of(context).textTheme.titleLarge),
            Text([subline(d.person), shortDate(date)].where((s) => s.isNotEmpty).join(' · '),
                style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 12),
            for (final p in d.punches) _PunchRow(p),
            if (d.punches.any((p) => p.setAside)) ...[
              const SizedBox(height: 12),
              Text(
                'A set-aside punch is on the site but left out of the day\'s attendance — replaced by an HR '
                'correction, or arrived after the day was already built. It still shows the person was here.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );

class _PunchRow extends StatelessWidget {
  const _PunchRow(this.p);

  final Punch p;

  @override
  Widget build(BuildContext context) {
    final out = p.logType == 'OUT';
    final tone = out ? DayState.onLeave : DayState.inOut;
    final where = p.fromPhone
        ? 'Phone'
        : p.fromCorrection
            ? 'HR correction'
            : (p.device.isEmpty ? 'Unknown' : p.device);
    final seconds = p.time.length >= 19 ? p.time.substring(11, 19) : p.clock;
    final day = p.time.length >= 10 ? p.time.substring(0, 10) : '';
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(out ? Icons.logout : Icons.login, color: stateColor(context, tone)),
      title: Text(seconds, style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])),
      subtitle: Text([where, if (day.isNotEmpty) shortDate(day)].join(' · ')),
      trailing: Wrap(spacing: 6, children: [
        StateChip(tone, text: p.logType.isEmpty ? 'Punch' : p.logType),
        if (p.setAside) const StateChip(DayState.weekOff, text: 'Set aside'),
      ]),
    );
  }
}
