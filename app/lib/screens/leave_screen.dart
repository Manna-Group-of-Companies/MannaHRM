import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/leave_rules.dart';
import 'package:manna_hr_app/screens/correction_sheet.dart' show dmy;
import 'package:manna_hr_app/screens/leave_sheet.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// Leave: every application at every status, what is left of each kind, and
/// the way to ask for more (19 October 2026).
///
/// The status is read from the site each time the screen opens or is pulled
/// down, so an approval made on the dashboard shows here as Approved — and the
/// month shows the days On Leave — without anybody doing anything on the phone.
class LeaveScreen extends StatefulWidget {
  const LeaveScreen({super.key, this.employee, this.bare = false});

  /// An Employee id, for HR reading somebody else's leave. Leave is asked for
  /// by the person it is for, so Apply is not offered then.
  final String? employee;

  /// Without its own app bar — a tab inside another page.
  final bool bare;

  @override
  State<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends State<LeaveScreen> {
  List<Map<String, dynamic>> _rows = const [];
  List<LeaveKind> _kinds = const [];
  bool _loading = true;
  String _error = '';
  String _said = '';

  bool get _own => widget.employee == null;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final got = await Future.wait<Object>([
        Api.myLeave(employee: widget.employee),
        // The balance is the second question; a site that will not answer it
        // must not hide the applications.
        Api.leaveKinds(employee: widget.employee).catchError((_) => const <LeaveKind>[]),
      ]);
      if (!mounted) return;
      setState(() {
        _rows = got[0] as List<Map<String, dynamic>>;
        _kinds = got[1] as List<LeaveKind>;
      });
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _apply() async {
    final sent = await openApplyLeave(context);
    if (!sent || !mounted) return;
    setState(() => _said = 'Sent to HR. It shows here as Approved once they approve it.');
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final tabs = DefaultTabController(
      length: 2,
      child: Column(children: [
        Container(
          margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(color: kCard, borderRadius: BorderRadius.circular(14), border: Border.all(color: kLine)),
          child: TabBar(
            indicatorSize: TabBarIndicatorSize.tab,
            dividerHeight: 0,
            labelColor: kOnPrimary,
            unselectedLabelColor: kInk2,
            indicator: BoxDecoration(color: kPrimary, borderRadius: BorderRadius.circular(10)),
            tabs: [
              Tab(height: 38, text: _own ? 'My Leave' : 'Leave'),
              const Tab(height: 38, text: 'Leave Balance'),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : TabBarView(children: [_history(), _balance()]),
        ),
      ]),
    );
    if (widget.bare) return tabs;
    return Scaffold(appBar: brandBar('Leave'), body: tabs);
  }

  Widget _summary() {
    final t = balanceTotals(_kinds);
    Widget cell(String label, double n) => Expanded(
          child: Column(children: [
            Text(label, style: const TextStyle(fontSize: 12, color: kInk2)),
            const SizedBox(height: 4),
            Text(fmtDays(n), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: kInk)),
          ]),
        );
    return Panel(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: IntrinsicHeight(
        child: Row(children: [
          cell('Total', t.total),
          const VerticalDivider(color: kLine),
          cell('Used', t.taken),
          const VerticalDivider(color: kLine),
          cell('Remaining', t.left),
        ]),
      ),
    );
  }

  Widget _history() => RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
          children: [
            if (_said.isNotEmpty) Note(_said, kind: NoteKind.ok),
            if (_error.isNotEmpty) Note(_error),
            _summary(),
            if (_own) ...[
              const SizedBox(height: 14),
              FilledButton.icon(onPressed: _apply, icon: const Icon(Icons.add), label: const Text('Apply Leave')),
            ],
            const SectionTitle('Leave History'),
            if (_rows.isEmpty && _error.isEmpty)
              Panel(
                child: Text(_own ? 'You have not asked for any leave.' : 'No leave asked for.',
                    style: const TextStyle(color: kInk2)),
              ),
            ..._rows.map(_row),
          ],
        ),
      );

  Widget _row(Map<String, dynamic> r) {
    final word = leaveStatusWord('${r['status'] ?? ''}', int.tryParse('${r['docstatus'] ?? 0}') ?? 0);
    final from = '${r['from_date'] ?? ''}';
    final to = '${r['to_date'] ?? ''}';
    final days = r['total_leave_days'];
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Panel(
        padding: const EdgeInsets.all(12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          IconBadge(Icons.beach_access_rounded, color: wordColour(word), size: 38),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${r['leave_type'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700, color: kInk)),
              const SizedBox(height: 2),
              Text(
                [
                  from == to ? dmy(from) : '${dmy(from)} – ${dmy(to)}',
                  if (days != null) '$days ${'$days' == '1' || '$days' == '1.0' ? 'day' : 'days'}',
                  if ('${r['half_day'] ?? 0}' == '1') 'half day',
                ].join(' · '),
                style: const TextStyle(fontSize: 12.5, color: kInk2),
              ),
              if ('${r['description'] ?? ''}'.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('${r['description']}', style: const TextStyle(fontSize: 12.5)),
                ),
            ]),
          ),
          Pill(word, color: wordColour(word)),
        ]),
      ),
    );
  }

  Widget _balance() => RefreshIndicator(
        onRefresh: _load,
        child: _kinds.isEmpty
            ? EmptyNote('No leave allocated', _own ? 'You have no leave to ask for yet. Ask HR.' : 'No leave allocated yet.',
                icon: Icons.beach_access_outlined)
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                children: [
                  _summary(),
                  const SizedBox(height: 6),
                  for (final k in _kinds)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Panel(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(
                              child: Text(k.name, style: const TextStyle(fontWeight: FontWeight.w700, color: kInk)),
                            ),
                            Text(k.left == null ? 'Without pay' : '${fmtDays(k.left!)} left',
                                style: const TextStyle(fontWeight: FontWeight.w700, color: kInk)),
                          ]),
                          if (k.left != null && (k.total ?? 0) > 0) ...[
                            const SizedBox(height: 10),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: LinearProgressIndicator(
                                value: ((k.taken ?? 0) / k.total!).clamp(0, 1).toDouble(),
                                minHeight: 7,
                                color: kGreen,
                                backgroundColor: kBrandTint,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text('${fmtDays(k.taken ?? 0)} used of ${fmtDays(k.total!)}',
                                style: const TextStyle(fontSize: 12.5, color: kInk2)),
                          ],
                        ]),
                      ),
                    ),
                ],
              ),
      );
}
