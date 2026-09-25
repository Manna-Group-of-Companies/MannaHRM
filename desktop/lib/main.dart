/// Manna Attendance: the gate PC's program, for the people who used eSSL.
///
/// A menu down the left, a grid on the right, Export to Excel over every grid.
/// Behind it is the bridge — the task that reads the machines and sends every
/// punch to ERPNext — and its console, which holds every rule. This program
/// finds the bridge on this PC, reads the console's key (which is why it runs
/// as administrator) and asks the console everything. See core/console.dart.
library;

import 'package:flutter/material.dart';

import 'core/console.dart';
import 'core/shared.dart';
import 'screens/bridge.dart';
import 'screens/keep.dart';
import 'screens/logs.dart';
import 'screens/machines.dart';
import 'screens/people.dart';

const blue = Color(0xFF1668B3);
const navy = Color(0xFF12304F);

void main() => runApp(const MannaAttendance());

class MannaAttendance extends StatelessWidget {
  const MannaAttendance({super.key, this.open});

  /// For a test: how to reach a console. The program finds the real one.
  final Future<Console> Function()? open;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Manna Attendance',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: blue),
          fontFamily: 'Segoe UI',
          visualDensity: VisualDensity.compact,
        ),
        darkTheme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: blue, brightness: Brightness.dark),
          fontFamily: 'Segoe UI',
          visualDensity: VisualDensity.compact,
        ),
        home: Starting(open: open ?? () => connect(bridgeFolder())),
      );
}

/// Finding the bridge and its console, or saying in a sentence why not.
class Starting extends StatefulWidget {
  const Starting({super.key, required this.open});
  final Future<Console> Function() open;

  @override
  State<Starting> createState() => _StartingState();
}

class _StartingState extends State<Starting> {
  Shared? _shared;
  String? _why;

  @override
  void initState() {
    super.initState();
    _try();
  }

  Future<void> _try() async {
    setState(() => _why = null);
    try {
      final console = await widget.open();
      if (mounted) setState(() => _shared = Shared(console));
    } catch (e) {
      if (mounted) setState(() => _why = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final shared = _shared;
    if (shared != null) return Home(shared);
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.fingerprint, size: 64, color: blue),
            const SizedBox(height: 16),
            Text('Manna Attendance', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 16),
            if (_why == null) ...[
              const CircularProgressIndicator(),
              const SizedBox(height: 12),
              const Text('Finding the bridge on this PC…'),
            ] else ...[
              SelectableText(_why!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _try, child: const Text('Try again')),
            ],
          ]),
        ),
      ),
    );
  }
}

typedef MenuItem = (String label, IconData icon, Widget Function(Shared shared) build);

final List<MenuItem> pages = [
  ('Bridge', Icons.sync_alt, BridgeScreen.new),
  ('Devices', Icons.router, DevicesScreen.new),
  ('Employees on machine', Icons.badge, PeopleScreen.new),
  ('Download logs', Icons.receipt_long, LogsScreen.new),
  ('Attendance report', Icons.event_note, AttendanceScreen.new),
  ('Not linked', Icons.link_off, UnlinkedScreen.new),
  ('New employee', Icons.person_add, NewEmployeeScreen.new),
  ('Backup and restore', Icons.save, KeepScreen.new),
  ('Search devices', Icons.wifi_find, AddDeviceScreen.new),
];

class Home extends StatefulWidget {
  const Home(this.shared, {super.key});
  final Shared shared;

  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  int get _at => widget.shared.page.value;

  @override
  void initState() {
    super.initState();
    widget.shared.page.addListener(_moved);
  }

  @override
  void dispose() {
    widget.shared.page.removeListener(_moved);
    super.dispose();
  }

  void _moved() => setState(() {});

  /// A screen is built the first time it is opened and kept, so going to
  /// another screen and back does not read a machine again.
  final _built = <int, Widget>{};

  @override
  Widget build(BuildContext context) {
    _built.putIfAbsent(_at, () => pages[_at].$3(widget.shared));
    return Scaffold(
      body: Row(children: [
        Container(
          width: 230,
          color: navy,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(18, 20, 18, 18),
              child: Row(children: [
                Icon(Icons.fingerprint, color: Colors.white, size: 28),
                SizedBox(width: 10),
                Flexible(
                  child: Text('Manna Attendance',
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Colors.white, fontSize: 16.5, fontWeight: FontWeight.w600)),
                ),
              ]),
            ),
            for (var i = 0; i < pages.length; i++)
              _NavItem(pages[i].$1, pages[i].$2, i == _at, () => widget.shared.page.value = i),
            const Spacer(),
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Never clears a machine\'s log.\nEvery rule is the bridge\'s.',
                  style: TextStyle(color: Color(0xFF8FA8C2), fontSize: 11.5)),
            ),
          ]),
        ),
        Expanded(
          child: IndexedStack(
            index: _at,
            children: [for (var i = 0; i < pages.length; i++) _built[i] ?? const SizedBox()],
          ),
        ),
      ]),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem(this.label, this.icon, this.on, this.tap);
  final String label;
  final IconData icon;
  final bool on;
  final VoidCallback tap;

  @override
  Widget build(BuildContext context) => Material(
        color: on ? Colors.white : Colors.transparent,
        child: InkWell(
          onTap: tap,
          hoverColor: const Color(0xFF1D4670),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
            child: Row(children: [
              Icon(icon, size: 20, color: on ? navy : const Color(0xFFCFDDEB)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(label,
                    style: TextStyle(color: on ? navy : const Color(0xFFE6EEF7), fontWeight: on ? FontWeight.w600 : null)),
              ),
            ]),
          ),
        ),
      );
}
