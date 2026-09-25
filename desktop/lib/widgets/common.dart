import 'package:flutter/material.dart';

import '../core/console.dart';
import '../core/shared.dart';

Future<void> say(BuildContext context, String text, {String title = 'Manna Attendance'}) => showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SelectableText(text),
        actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
      ),
    );

Future<void> refuse(BuildContext context, String why) => say(context, why, title: 'Not done');

Future<bool> confirm(BuildContext context, String text, {String yes = 'Yes', bool danger = false}) async {
  final answer = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Manna Attendance'),
      content: SingleChildScrollView(child: SelectableText(text)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error) : null,
          onPressed: () => Navigator.pop(context, true),
          child: Text(yes),
        ),
      ],
    ),
  );
  return answer ?? false;
}

Future<String?> askText(BuildContext context, String text, {String label = ''}) {
  final box = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Manna Attendance'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        SelectableText(text),
        const SizedBox(height: 12),
        TextField(controller: box, autofocus: true, decoration: InputDecoration(labelText: label)),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(context, box.text.trim()), child: const Text('OK')),
      ],
    ),
  );
}

/// A job for the console, with the screen marked busy while it runs and the
/// console's sentence shown when it refuses.
mixin Working<W extends StatefulWidget> on State<W> {
  bool busy = false;

  Future<Answer?> work(Future<Answer> Function() job) async {
    setState(() => busy = true);
    try {
      return await job();
    } on Refused catch (e) {
      if (mounted) await refuse(context, e.why);
    } catch (e) {
      if (mounted) await refuse(context, '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
    return null;
  }
}

/// A title, a line saying what the screen is for, the controls, the content.
class ScreenFrame extends StatelessWidget {
  const ScreenFrame({super.key, required this.title, required this.hint, this.tools = const [], required this.child, this.busy = false});

  final String title;
  final String hint;
  final List<Widget> tools;
  final Widget child;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SizedBox(height: 3, child: busy ? const LinearProgressIndicator() : null),
      Expanded(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 18, 24, 18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(title, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(hint, style: text.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.outline)),
            const SizedBox(height: 14),
            if (tools.isNotEmpty) ...[
              Wrap(spacing: 12, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.end, children: tools),
              const SizedBox(height: 14),
            ],
            Expanded(child: child),
          ]),
        ),
      ),
    ]);
  }
}

class Box extends StatelessWidget {
  const Box(this.label, this.controller, {super.key, this.width = 170, this.hint});
  final String label;
  final TextEditingController controller;
  final double width;
  final String? hint;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: TextField(
          controller: controller,
          decoration: InputDecoration(labelText: label, hintText: hint, isDense: true, border: const OutlineInputBorder()),
        ),
      );
}

class Pick extends StatelessWidget {
  const Pick(this.label, this.options, this.value, this.onChanged, {super.key, this.width = 240});
  final String label;
  final List<String> options;
  final String? value;
  final ValueChanged<String?> onChanged;
  final double width;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: DropdownButtonFormField<String>(
          key: ValueKey('$label:${options.join('|')}'),
          initialValue: options.contains(value) ? value : null,
          isExpanded: true,
          decoration: InputDecoration(labelText: label, isDense: true, border: const OutlineInputBorder()),
          items: [for (final o in options) DropdownMenuItem(value: o, child: Text(o.isEmpty ? '—' : o, overflow: TextOverflow.ellipsis))],
          onChanged: onChanged,
        ),
      );
}

/// The machine a screen works on, from the list the console reads once.
class MachinePick extends StatelessWidget {
  const MachinePick(this.shared, this.value, this.onChanged, {super.key});
  final Shared shared;
  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) => FutureBuilder<List<String>>(
        future: shared.readableMachines(),
        builder: (context, snap) {
          final names = snap.data ?? const <String>[];
          if (value == null && names.isNotEmpty) {
            WidgetsBinding.instance.addPostFrameCallback((_) => onChanged(names.first));
          }
          return Pick(snap.connectionState == ConnectionState.done ? 'Machine' : 'Machine (reading…)', names, value,
              onChanged);
        },
      );
}
