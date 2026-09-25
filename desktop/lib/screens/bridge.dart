import 'dart:async';

import 'package:flutter/material.dart';

import '../core/console.dart';
import '../core/format.dart';
import '../core/shared.dart';
import '../widgets/common.dart';
import '../widgets/grid.dart';

/// The bridge: the task that reads the machines and sends every punch to
/// ERPNext. This screen watches it and can restart it; it cannot stop it,
/// because a stopped bridge is a gate where punches wait and nobody notices.
class BridgeScreen extends StatefulWidget {
  const BridgeScreen(this.shared, {super.key});
  final Shared shared;

  @override
  State<BridgeScreen> createState() => _BridgeScreenState();
}

class _BridgeScreenState extends State<BridgeScreen> with Working {
  Answer? _answer;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _load();
    // Every half minute while it is on screen: "is anything arriving" is a
    // question somebody watches the answer to, not one they ask once.
    _tick = Timer.periodic(const Duration(seconds: 30), (_) => _load(quiet: true));
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) async {
    if (quiet) {
      try {
        final a = await widget.shared.console.get('bridge');
        if (mounted) setState(() => _answer = a);
      } catch (_) {}
      return;
    }
    final a = await work(() => widget.shared.console.get('bridge'));
    if (a != null && mounted) setState(() => _answer = a);
  }

  Future<void> _restart() async {
    if (!await confirm(context, 'Restart the bridge?\n\nNothing is lost: the punches waiting are on this PC\'s '
        'disk and are sent on its first pass.', yes: 'Restart')) {
      return;
    }
    final a = await work(() => widget.shared.console.post('restart-bridge', {}));
    if (a != null && mounted) {
      await say(context, '${a['said']}');
      await Future<void>.delayed(const Duration(seconds: 2));
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = _answer;
    final state = bridgeState('${a?['state'] ?? ''}');
    final scheme = Theme.of(context).colorScheme;
    final log = [for (final l in (a?['log'] as List? ?? const [])) '$l'];
    return ScreenFrame(
      title: 'Bridge',
      hint: 'The background task that reads every fingerprint machine and sends each punch to ERPNext. '
          'Punches wait on this PC until ERPNext has them, so a stopped bridge loses nothing — but nobody is paid '
          'for a day that has not arrived.',
      busy: busy,
      tools: [
        FilledButton.icon(onPressed: busy ? null : _load, icon: const Icon(Icons.refresh), label: const Text('Refresh')),
        OutlinedButton.icon(
            onPressed: busy ? null : _restart, icon: const Icon(Icons.restart_alt), label: const Text('Restart bridge')),
      ],
      child: a == null
          ? const SizedBox()
          : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Wrap(spacing: 16, runSpacing: 12, children: [
                _Tile('Bridge', state.text, state.good ? Colors.green.shade700 : scheme.error, Icons.sync_alt),
                _Tile('Waiting to be sent', '${a['unsent']}', (a['unsent'] ?? 0) == 0 ? Colors.green.shade700 : Colors.orange.shade800,
                    Icons.outbox),
                _Tile('Machines in the queue', '${(a['devices'] as List?)?.length ?? 0}', scheme.primary, Icons.fingerprint),
              ]),
              const SizedBox(height: 16),
              SizedBox(
                height: 200,
                child: Grid(
                  name: 'bridge-queue',
                  columns: const [
                    Col('device_id', 'Machine', 170),
                    Col('total', 'Punches kept', 100),
                    Col('unsent', 'Waiting', 80),
                    Col('newest', 'Newest punch', 160),
                    Col('newest_sent', 'Newest sent', 160),
                    Col('last_error', 'Last refusal', 380),
                  ],
                  rows: rowsOf(a['devices']),
                  bad: (r) => (r['unsent'] ?? 0) != 0,
                ),
              ),
              const SizedBox(height: 16),
              Text('bridge.log — the last ${log.length} lines', style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              Expanded(
                child: Container(
                  decoration: BoxDecoration(color: const Color(0xFF0F1B2A), borderRadius: BorderRadius.circular(8)),
                  padding: const EdgeInsets.all(12),
                  child: SingleChildScrollView(
                    reverse: true,
                    child: SelectableText(log.isEmpty ? 'No log on this PC yet.' : log.join('\n'),
                        style: const TextStyle(fontFamily: 'Consolas', fontSize: 12.5, color: Color(0xFFD6E2F0), height: 1.35)),
                  ),
                ),
              ),
            ]),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile(this.label, this.value, this.color, this.icon);
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        child: Container(
          width: 300,
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Icon(icon, color: color, size: 30),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
                const SizedBox(height: 2),
                Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: color)),
              ]),
            ),
          ]),
        ),
      );
}
