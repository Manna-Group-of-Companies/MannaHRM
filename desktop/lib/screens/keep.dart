import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/shared.dart';
import '../widgets/common.dart';
import '../widgets/grid.dart';

/// Backup, restore, and the one thing here that takes something away.
///
/// The console takes a backup before every delete and every restore, and asks
/// for the number to be typed a second time before a delete. This screen only
/// shows what it asks.
class KeepScreen extends StatefulWidget {
  const KeepScreen(this.shared, {super.key});
  final Shared shared;

  @override
  State<KeepScreen> createState() => _KeepScreenState();
}

class _KeepScreenState extends State<KeepScreen> with Working {
  String? _device;
  List<Rec> _files = const [];
  Rec? _file;
  final _number = TextEditingController();

  @override
  void initState() {
    super.initState();
    _list();
  }

  Future<void> _list() async {
    final a = await work(() => widget.shared.console.get('backups'));
    if (a != null && mounted) setState(() => _files = rowsOf(a['files']));
  }

  Future<void> _backup() async {
    final a = await work(() => widget.shared.console.post('backup', {'device': _device}));
    if (a == null || !mounted) return;
    await say(context, '${a['said']}');
    _list();
  }

  Future<void> _restore() async {
    final file = _file;
    if (file == null) return refuse(context, 'Pick a backup in the list first.');
    final body = {'device': _device, 'file': file['file']};
    final plan = await work(() => widget.shared.console.post('restore', body));
    if (plan == null || !mounted) return;
    final who = rowsOf(plan['plan']);
    if (who.isEmpty) return say(context, '${plan['said']}');
    final names = who.take(25).map((u) => '${u['user_id']}  ${u['name']}  (${u['fingers']} fingers)').join('\n');
    final more = who.length > 25 ? '\n… and ${who.length - 25} more' : '';
    if (!await confirm(context, '${plan['said']}\n\n$names$more\n\nRestore these onto $_device?', yes: 'Restore')) {
      return;
    }
    final a = await work(() => widget.shared.console.post('restore', {...body, 'apply': true}));
    if (a == null || !mounted) return;
    await say(context, '${a['said']}');
    _list();
  }

  Future<void> _delete() async {
    final body = {'device': _device, 'user_id': _number.text.trim()};
    final asked = await work(() => widget.shared.console.post('delete-user', body));
    if (asked == null || !mounted) return;
    // The first answer is always a question that says who it is: the number
    // has to be typed a second time, because the finger goes with the user.
    final typed = await askText(context, '${asked['why']}', label: 'Type the number to remove them');
    if (typed == null || !mounted) return;
    final a = await work(() => widget.shared.console.post('delete-user', {...body, 'confirm': typed}));
    if (a == null || !mounted) return;
    if (a['confirm'] != null) return refuse(context, 'That is not the number. Nobody was removed.');
    await say(context, '${a['said']}');
    _list();
  }

  @override
  void dispose() {
    _number.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ScreenFrame(
        title: 'Backup and restore',
        hint: 'A backup is every user and fingerprint on a machine, in a file on this PC. It holds fingerprint templates '
            'and keypad passwords, so it never leaves this PC. Remove and restore always take a backup first.',
        busy: busy,
        tools: [
          MachinePick(widget.shared, _device, (v) => setState(() => _device = v)),
          FilledButton.icon(
              onPressed: busy ? null : _backup, icon: const Icon(Icons.save), label: const Text('Back up now')),
        ],
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(
            child: Grid(
              name: 'backups',
              columns: const [
                Col('file', 'File', 280),
                Col('device', 'Machine', 150),
                Col('taken_at', 'Taken', 160),
                Col('reason', 'Why', 260),
                Col('users', 'Users', 60),
                Col('fingers', 'Fingers', 70),
              ],
              rows: _files,
              bad: (r) => r['why'] != null,
              onSelect: (r) => _file = r,
            ),
          ),
          const SizedBox(height: 14),
          Wrap(spacing: 12, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
            OutlinedButton.icon(
                onPressed: busy ? null : _restore,
                icon: const Icon(Icons.settings_backup_restore),
                label: const Text('Restore the selected backup onto this machine…')),
            const SizedBox(width: 20),
            Box('Remove number', _number, width: 150),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
              onPressed: busy ? null : _delete,
              icon: const Icon(Icons.person_remove),
              label: const Text('Remove from machine…'),
            ),
          ]),
        ]),
      );
}
