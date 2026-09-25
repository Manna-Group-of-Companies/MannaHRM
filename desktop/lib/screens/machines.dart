import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/shared.dart';
import '../widgets/common.dart';
import '../widgets/grid.dart';

/// Where "Search devices" sits in the menu, for the button on Devices.
const searchPage = 8;

class DevicesScreen extends StatefulWidget {
  const DevicesScreen(this.shared, {super.key});
  final Shared shared;

  @override
  State<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends State<DevicesScreen> with Working {
  List<Rec> _rows = const [];
  String _site = '';

  @override
  void initState() {
    super.initState();
    _load(fresh: false);
    widget.shared.machinesChanged.addListener(_load);
  }

  @override
  void dispose() {
    widget.shared.machinesChanged.removeListener(_load);
    super.dispose();
  }

  Future<void> _load({bool fresh = true}) async {
    final a = await work(() => widget.shared.machines(fresh: fresh));
    if (a == null || !mounted) return;
    final rows = rowsOf(a['machines']);
    for (final r in rows) {
      r['state'] = r['reachable'] == true ? 'Online' : (cell(r['host']).isEmpty ? 'ADMS push' : 'Offline');
      r['drift_'] = driftText(r['drift']);
    }
    setState(() {
      _rows = rows;
      _site = 'Site ${a['site']}  ·  site clock ${a['site_clock'] ?? 'unknown'}';
    });
  }

  @override
  Widget build(BuildContext context) => ScreenFrame(
        title: 'Devices',
        hint: 'Every fingerprint machine this PC reads: whether it answers, how many people are on it, and its clock '
            'against the site\'s. A slow clock makes every arrival look earlier than it was; nothing here sets one.',
        busy: busy,
        tools: [
          FilledButton.icon(onPressed: busy ? null : _load, icon: const Icon(Icons.refresh), label: const Text('Refresh')),
          OutlinedButton.icon(
            onPressed: () => widget.shared.page.value = searchPage,
            icon: const Icon(Icons.wifi_find),
            label: const Text('Search for devices'),
          ),
          Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(_site)),
        ],
        child: Grid(
          name: 'machines',
          columns: const [
            Col('name', 'Machine', 170),
            Col('host', 'Address', 120),
            Col('port', 'Port', 60),
            Col('serial', 'Serial', 130),
            Col('state', 'Status', 90),
            Col('users', 'Users', 60),
            Col('clock', 'Its clock', 150),
            Col('drift_', 'Drift', 110),
            Col('why', 'Why not', 320),
          ],
          rows: _rows,
          bad: (r) => r['reachable'] != true && cell(r['host']).isNotEmpty,
        ),
      );
}

/// What a found machine is, in the words the grid shows.
String foundState(Rec r) {
  if (r['why'] != null) return 'Did not answer';
  if (cell(r['already']).isNotEmpty) return 'Already added as ${r['already']}';
  return 'Connected';
}

/// Search the network, or connect to one address, then add what answered.
///
/// Both only read — serial, model, users and clock off the machine, never its
/// log — and nothing is written anywhere until Add. The console decides what
/// may be added: the trusted prefix, a name no other machine has, an address
/// not already in, and a machine that answers when it is asked again.
class AddDeviceScreen extends StatefulWidget {
  const AddDeviceScreen(this.shared, {super.key});
  final Shared shared;

  @override
  State<AddDeviceScreen> createState() => _AddDeviceScreenState();
}

class _AddDeviceScreenState extends State<AddDeviceScreen> with Working {
  final _host = TextEditingController();
  final _port = TextEditingController(text: '4370');
  final _key = TextEditingController(text: '0');
  final _name = TextEditingController();
  List<Rec> _found = const [];
  Rec? _picked;
  String _note = '';

  @override
  void dispose() {
    for (final c in [_host, _port, _key, _name]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _search() => _find('', 'Searching every address on this PC\'s networks — this takes a minute…');

  Future<void> _connect() {
    final host = _host.text.trim();
    if (host.isEmpty) {
      return refuse(context, 'Type the machine\'s address first. The machine shows it under Menu > Comm > Ethernet.');
    }
    return _find(host, 'Connecting to $host…');
  }

  Future<void> _find(String host, String doing) async {
    setState(() => _note = doing);
    final a = await work(() => widget.shared.console.get('find', {'host': host, 'password': _key.text}));
    if (!mounted) return;
    if (a == null) return setState(() => _note = '');
    final found = rowsOf(a['found']);
    for (final r in found) {
      r['state'] = foundState(r);
    }
    final answered = found.where((r) => r['why'] == null).length;
    setState(() {
      _found = found;
      _picked = null;
      _note = host.isEmpty
          ? '${found.length} machine(s) found on the network, $answered connected.'
          : (answered > 0 ? 'Connected to $host.' : 'No answer from $host.');
    });
    // One new machine that answered is almost always the one wanted.
    final fresh = found.where((r) => foundState(r) == 'Connected').toList();
    if (fresh.length == 1) _pick(fresh.single);
  }

  void _pick(Rec? r) {
    if (r == null) return;
    setState(() => _picked = r);
    _host.text = cell(r['host']);
    if (foundState(r) == 'Connected') _name.text = cell(r['suggested']);
  }

  Future<void> _add() async {
    final r = _picked;
    if (r == null) return refuse(context, 'Search or connect first, then pick the machine in the list.');
    final body = {
      'host': cell(r['host']),
      'name': _name.text.trim(),
      'port': _port.text.trim(),
      'password': _key.text.trim(),
      'serial': cell(r['serial']),
    };
    if (!await confirm(context, 'Add ${body['name']} at ${body['host']} to this bridge?\n\n'
        'It is read from the first of this month, not its whole memory. Nothing on the machine changes.')) {
      return;
    }
    final a = await work(() => widget.shared.console.post('add-machine', body));
    if (a == null || !mounted) return;
    try {
      await widget.shared.machines(fresh: true);
    } catch (_) {
      // Devices says why when it reads the list again.
    }
    widget.shared.machinesChanged.value++;
    if (!mounted) return;
    setState(() {
      r['already'] = body['name'];
      r['state'] = foundState(r);
      _found = List.of(_found);
    });
    await say(context, '${a['said']}');
  }

  @override
  Widget build(BuildContext context) {
    final picked = _picked;
    final addable = picked != null && foundState(picked) == 'Connected';
    return ScreenFrame(
      title: 'Search and add devices',
      hint: 'Search finds every fingerprint machine on this PC\'s networks; Connect talks to one address. Both only read. '
          'A machine is added only when you press Add, and its name has to start with the trusted prefix, or ERPNext '
          'takes its punches for a phone\'s and refuses them.',
      busy: busy,
      tools: [
        FilledButton.icon(
            onPressed: busy ? null : _search, icon: const Icon(Icons.wifi_find), label: const Text('Search the network')),
        const SizedBox(width: 12),
        Box('Address', _host, width: 170, hint: '192.168.1.40'),
        Box('Port', _port, width: 80),
        Box('Comm key', _key, width: 100),
        OutlinedButton.icon(onPressed: busy ? null : _connect, icon: const Icon(Icons.cable), label: const Text('Connect')),
        Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(_note)),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(
          child: Grid(
            name: 'found',
            columns: const [
              Col('host', 'Address', 120),
              Col('state', 'Status', 270),
              Col('model', 'Model', 120),
              Col('serial', 'Serial', 140),
              Col('users', 'Users', 60),
              Col('suggested', 'Suggested name', 190),
              Col('why', 'Why not', 280),
            ],
            rows: _found,
            bad: (r) => r['why'] != null,
            onSelect: _pick,
          ),
        ),
        const SizedBox(height: 14),
        Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Wrap(spacing: 12, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
              SizedBox(
                width: 320,
                child: Text(picked == null
                    ? 'Pick a machine in the list to add it.'
                    : '${picked['host']} — ${foundState(picked)}'
                        '${picked['model'] != null ? ', ${picked['model']}' : ''}'),
              ),
              Box('Name', _name, width: 280),
              FilledButton.icon(
                onPressed: busy || !addable ? null : _add,
                icon: const Icon(Icons.add),
                label: const Text('Add this machine'),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}
