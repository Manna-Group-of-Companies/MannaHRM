import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/shared.dart';
import '../widgets/common.dart';
import '../widgets/grid.dart';

class LogsScreen extends StatefulWidget {
  const LogsScreen(this.shared, {super.key});
  final Shared shared;

  @override
  State<LogsScreen> createState() => _LogsScreenState();
}

class _LogsScreenState extends State<LogsScreen> with Working {
  String? _device;
  final _since = TextEditingController(text: ymd(DateTime.now().subtract(const Duration(days: 7))));
  final _number = TextEditingController();
  List<Rec> _rows = const [];
  String _note = '';

  Future<void> _load() async {
    final problem = dateProblem(_since.text, 'From');
    if (problem != null) return refuse(context, problem);
    final a = await work(() => widget.shared.console
        .get('punches', {'device': _device, 'since': _since.text, 'user_id': _number.text}));
    if (a == null || !mounted) return;
    final rows = rowsOf(a['rows']);
    for (final r in rows) {
      r['state'] = stateText(r['punch']);
    }
    setState(() {
      _rows = rows;
      _note = '${a['total']} punches${a['cut'] == true ? ' — showing the newest ${rows.length}' : ''}';
    });
  }

  @override
  Widget build(BuildContext context) => ScreenFrame(
        title: 'Download logs',
        hint: 'The machine\'s own log — what it holds, which may be more than reached the site. Reading it never '
            'clears it: the machine\'s memory is the last copy of a punch that failed to deliver.',
        busy: busy,
        tools: [
          MachinePick(widget.shared, _device, (v) => setState(() => _device = v)),
          Box('From', _since, width: 140, hint: 'YYYY-MM-DD'),
          Box('Number (blank = all)', _number, width: 170),
          FilledButton.icon(
              onPressed: busy ? null : _load, icon: const Icon(Icons.download), label: const Text('Read the log')),
          Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(_note)),
        ],
        child: Grid(
          name: 'log-${_device ?? ''}',
          columns: const [Col('time', 'When', 180), Col('user_id', 'Number', 100), Col('state', 'State code', 100)],
          rows: _rows,
        ),
      );
}

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen(this.shared, {super.key});
  final Shared shared;

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> with Working {
  static const _all = '(all companies)';
  final _from = TextEditingController(text: ymd(DateTime(DateTime.now().year, DateTime.now().month, 1)));
  final _to = TextEditingController(text: ymd(DateTime.now()));
  String? _company = _all;
  List<Rec> _rows = const [];
  String _note = '';

  Future<void> _load() async {
    final problem = dateProblem(_from.text, 'From') ?? dateProblem(_to.text, 'To');
    if (problem != null) return refuse(context, problem);
    final company = _company == _all ? '' : _company;
    final a = await work(
        () => widget.shared.console.get('attendance', {'from': _from.text, 'to': _to.text, 'company': company}));
    if (a == null || !mounted) return;
    setState(() {
      _rows = rowsOf(a['days']);
      _note = '${a['note'] ?? ''}';
    });
  }

  @override
  Widget build(BuildContext context) => ScreenFrame(
        title: 'Attendance report',
        hint: 'First in and last out per person per day, off the punches that reached ERPNext. Red is one punch only — '
            'an arrival with no leaving.',
        busy: busy,
        tools: [
          Box('From', _from, width: 140, hint: 'YYYY-MM-DD'),
          Box('To', _to, width: 140, hint: 'YYYY-MM-DD'),
          FutureBuilder<Map<String, List<String>>>(
            future: widget.shared.choices(),
            builder: (context, snap) => Pick('Company', [_all, ...?snap.data?['companies']], _company,
                (v) => setState(() => _company = v), width: 300),
          ),
          FilledButton.icon(onPressed: busy ? null : _load, icon: const Icon(Icons.event_note), label: const Text('Show')),
        ],
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_note.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_note, style: TextStyle(color: Colors.orange.shade900)),
            ),
          Expanded(
            child: Grid(
              name: 'attendance-${_from.text}-to-${_to.text}',
              columns: const [
                Col('day', 'Day', 100),
                Col('employee', 'Employee', 120),
                Col('employee_name', 'Name', 210),
                Col('first', 'First in', 80),
                Col('last', 'Last out', 80),
                Col('punches', 'Punches', 80),
                Col('device', 'Machine', 160),
                Col('status', 'Attendance', 110),
              ],
              rows: _rows,
              bad: (r) => r['single'] == true,
            ),
          ),
        ]),
      );
}
