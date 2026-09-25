import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/shared.dart';
import '../widgets/common.dart';
import '../widgets/grid.dart';

class PeopleScreen extends StatefulWidget {
  const PeopleScreen(this.shared, {super.key});
  final Shared shared;

  @override
  State<PeopleScreen> createState() => _PeopleScreenState();
}

class _PeopleScreenState extends State<PeopleScreen> with Working {
  String? _device;
  List<Rec> _rows = const [];
  String _counts = '';

  Future<void> _load() async {
    final a = await work(() => widget.shared.console.get('people', {'device': _device}));
    if (a == null || !mounted) return;
    final c = a['counts'] as Map? ?? const {};
    setState(() {
      _rows = rowsOf(a['rows']);
      _counts = '${c['users']} on the machine · ${c['clean']} clean · ${c['problems']} with a problem · '
          '${c['not_here']} in ERPNext with a number that is not on this machine';
    });
  }

  @override
  Widget build(BuildContext context) => ScreenFrame(
        title: 'Employees on machine',
        hint: 'Who is enrolled on one machine, beside the ERPNext Employee their number belongs to. A red row is '
            'somebody whose punches are being lost or cannot be made.',
        busy: busy,
        tools: [
          MachinePick(widget.shared, _device, (v) => setState(() => _device = v)),
          FilledButton.icon(
              onPressed: busy ? null : _load, icon: const Icon(Icons.download), label: const Text('Read the machine')),
          Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(_counts)),
        ],
        child: Grid(
          name: 'people-${_device ?? ''}',
          columns: const [
            Col('user_id', 'Number', 80),
            Col('machine_name', 'Name on machine', 170),
            Col('fingers', 'Fingers', 60),
            Col('card', 'Card', 80),
            Col('employee', 'Employee', 120),
            Col('employee_name', 'Name in ERPNext', 180),
            Col('status', 'Status', 70),
            Col('company', 'Company', 150),
            Col('problem', 'Problem', 340),
          ],
          rows: _rows,
          bad: (r) => cell(r['problem']).isNotEmpty,
        ),
      );
}

class UnlinkedScreen extends StatefulWidget {
  const UnlinkedScreen(this.shared, {super.key});
  final Shared shared;

  @override
  State<UnlinkedScreen> createState() => _UnlinkedScreenState();
}

class _UnlinkedScreenState extends State<UnlinkedScreen> with Working {
  String? _device;
  List<Rec> _numbers = const [];
  Map<String, String> _who = const {};
  Rec? _row;
  String _employee = '';

  Future<void> _load() async {
    final a = await work(() => widget.shared.console.get('unlinked', {'device': _device}));
    if (a == null || !mounted) return;
    setState(() {
      _numbers = rowsOf(a['numbers']);
      _row = null;
      _who = {
        for (final e in rowsOf(a['employees']))
          '${e['name']} — ${cell(e['employee_name'])} (${cell(e['company'])}'
              '${e['status'] == 'Active' ? '' : ', ${e['status']}'})': cell(e['name']),
      };
    });
  }

  Future<void> _link() async {
    final row = _row;
    if (row == null) return refuse(context, 'Pick a number in the list first.');
    final employee = _who[_employee] ?? _employee.split(' ').first.trim();
    if (employee.isEmpty) return refuse(context, 'Pick the Employee this number belongs to.');
    if (!await confirm(context, 'Give number ${row['user_id']} to $employee?\n\n'
        'From now on every punch with ${row['user_id']} is theirs.')) {
      return;
    }
    final a = await work(() => widget.shared.console
        .post('link', {'employee': employee, 'user_id': row['user_id'], 'name_on_device': row['machine_name']}));
    if (a == null || !mounted) return;
    await say(context, '${a['said'] ?? 'Linked.'}');
    _load();
  }

  @override
  Widget build(BuildContext context) => ScreenFrame(
        title: 'Not linked',
        hint: 'Numbers on the machine that no ERPNext Employee carries. Every punch from one of these is refused and '
            'that person reads absent. The ones that punched this month are at the top.',
        busy: busy,
        tools: [
          MachinePick(widget.shared, _device, (v) => setState(() => _device = v)),
          FilledButton.icon(
              onPressed: busy ? null : _load, icon: const Icon(Icons.link_off), label: const Text('Find them')),
        ],
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(
            child: Grid(
              name: 'unlinked-${_device ?? ''}',
              columns: const [
                Col('user_id', 'Number', 90),
                Col('machine_name', 'Name on machine', 220),
                Col('fingers', 'Fingers', 70),
                Col('punches', 'Punches this month', 150),
              ],
              rows: _numbers,
              bad: (r) => (r['punches'] ?? 0) != 0,
              onSelect: (r) => setState(() => _row = r),
            ),
          ),
          const SizedBox(height: 14),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_row == null
                    ? 'Pick a number above, then say who it is.'
                    : 'Number ${_row!['user_id']}, "${_row!['machine_name']}" on the machine. Who is it?'),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: Autocomplete<String>(
                      optionsBuilder: (text) {
                        final words = text.text.toLowerCase().split(' ').where((w) => w.isNotEmpty);
                        return _who.keys.where((k) => words.every(k.toLowerCase().contains)).take(50);
                      },
                      onSelected: (v) => _employee = v,
                      fieldViewBuilder: (context, controller, focus, submit) => TextField(
                        controller: controller,
                        focusNode: focus,
                        onChanged: (v) => _employee = v,
                        decoration: const InputDecoration(
                            labelText: 'Employee (type a name or an ID)', isDense: true, border: OutlineInputBorder()),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton.icon(onPressed: busy ? null : _link, icon: const Icon(Icons.link), label: const Text('Link')),
                ]),
              ]),
            ),
          ),
        ]),
      );
}

class NewEmployeeScreen extends StatefulWidget {
  const NewEmployeeScreen(this.shared, {super.key});
  final Shared shared;

  @override
  State<NewEmployeeScreen> createState() => _NewEmployeeScreenState();
}

class _NewEmployeeScreenState extends State<NewEmployeeScreen> with Working {
  static const _typed = [
    ('user_id', 'Machine number *'),
    ('first_name', 'First name *'),
    ('last_name', 'Last name'),
    ('date_of_birth', 'Date of birth * (YYYY-MM-DD)'),
    ('date_of_joining', 'Date of joining * (YYYY-MM-DD)'),
    ('employee_number', 'Employee number'),
    ('mobile', 'Mobile'),
    ('email', 'Email'),
    ('aadhaar', 'Aadhaar'),
    ('address', 'Address'),
  ];
  static const _picked = [
    ('gender', 'Gender *', 'genders'),
    ('company', 'Company *', 'companies'),
    ('shift', 'Shift', 'shifts'),
    ('branch', 'Branch', 'branches'),
  ];

  final _boxes = {for (final f in _typed) f.$1: TextEditingController()};
  final _picks = <String, String?>{};
  String? _device;
  String _said = '';
  bool _saidBad = false;

  @override
  void initState() {
    super.initState();
    _boxes['date_of_joining']!.text = ymd(DateTime.now());
  }

  Future<void> _suggest() async {
    final a = await work(() => widget.shared.console.get('free-number', {'device': _device}));
    if (a == null || !mounted) return;
    if (a['number'] == null) return refuse(context, 'No free number found above what the machine holds.');
    setState(() => _boxes['user_id']!.text = '${a['number']}');
  }

  Map<String, Object?> get _body => {
        for (final e in _boxes.entries) e.key: e.value.text.trim(),
        for (final e in _picks.entries) e.key: e.value ?? '',
        'device': _device,
      };

  Future<void> _create() async {
    final b = _body;
    if (!await confirm(context,
        'Create ${b['first_name']} ${b['last_name']} with number ${b['user_id']} in ERPNext, and put them on ${b['device']}?')) {
      return;
    }
    _done(await work(() => widget.shared.console.post('create-employee', b)));
  }

  Future<void> _machineOnly() async {
    final b = _body;
    final name = '${b['first_name']} ${b['last_name']}'.trim();
    if (!await confirm(context, 'Put number ${b['user_id']} ("$name") on ${b['device']}, without touching ERPNext?')) {
      return;
    }
    _done(await work(() => widget.shared.console.post('add-user', {'device': _device, 'user_id': b['user_id'], 'name': name})));
  }

  void _done(Map<String, dynamic>? a) {
    if (a == null || !mounted) return;
    final text = '${a['said'] ?? 'Done.'}${a['warn'] != null && '${a['warn']}'.isNotEmpty ? '\n${a['warn']}' : ''}';
    setState(() {
      _said = text;
      _saidBad = false;
    });
    say(context, text);
  }

  @override
  void dispose() {
    for (final c in _boxes.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ScreenFrame(
        title: 'New employee',
        hint: 'Makes the Employee in ERPNext first, then puts the same number on the machine. A record the site refuses '
            'changes nothing at the gate. The finger is enrolled at the machine afterwards.',
        busy: busy,
        tools: [
          MachinePick(widget.shared, _device, (v) => setState(() => _device = v)),
          OutlinedButton.icon(
              onPressed: busy ? null : _suggest, icon: const Icon(Icons.pin), label: const Text('Suggest a free number')),
        ],
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            FutureBuilder<Map<String, List<String>>>(
              future: widget.shared.choices(),
              builder: (context, snap) => Wrap(spacing: 16, runSpacing: 14, children: [
                for (final f in _typed.take(3)) Box(f.$2, _boxes[f.$1]!, width: 260),
                for (final p in _picked.take(2))
                  Pick(p.$2, ['', ...?snap.data?[p.$3]], _picks[p.$1], (v) => setState(() => _picks[p.$1] = v), width: 260),
                for (final f in _typed.skip(3)) Box(f.$2, _boxes[f.$1]!, width: 260),
                for (final p in _picked.skip(2))
                  Pick(p.$2, ['', ...?snap.data?[p.$3]], _picks[p.$1], (v) => setState(() => _picks[p.$1] = v), width: 260),
              ]),
            ),
            const SizedBox(height: 22),
            Wrap(spacing: 12, runSpacing: 10, children: [
              FilledButton.icon(
                  onPressed: busy ? null : _create,
                  icon: const Icon(Icons.person_add),
                  label: const Text('Create in ERPNext and add to machine')),
              OutlinedButton.icon(
                  onPressed: busy ? null : _machineOnly,
                  icon: const Icon(Icons.fingerprint),
                  label: const Text('Add this number to the machine only')),
            ]),
            const SizedBox(height: 14),
            if (_said.isNotEmpty)
              SelectableText(_said, style: TextStyle(color: _saidBad ? Theme.of(context).colorScheme.error : null)),
          ]),
        ),
      );
}
