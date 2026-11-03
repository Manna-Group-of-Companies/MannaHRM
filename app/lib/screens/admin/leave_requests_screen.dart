import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/leave_rules.dart';
import 'package:manna_hr_app/screens/correction_sheet.dart' show dmy;
import 'package:manna_hr_app/screens/profile_screen.dart';
import 'package:manna_hr_app/services/admin_api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// Leave applications across the group, by status: Pending, Approved,
/// Rejected.
///
/// A pending one is approved or rejected from its sheet, through
/// `AdminApi.decideLeave` — the website's own submit, so the website shows the
/// decision and hrms books the balance and marks the days. Whether this login
/// may decide is the site's to say; a refusal is shown as the site put it.
class LeaveRequestsScreen extends StatelessWidget {
  const LeaveRequestsScreen({super.key, this.load, this.decide});

  /// For the tests: one status's rows, in place of the site.
  final Future<List<Map<String, dynamic>>> Function(String status)? load;

  /// For the tests: a decision, in place of the site.
  final Future<void> Function(String name, String status)? decide;

  @override
  Widget build(BuildContext context) => DefaultTabController(
        length: 3,
        child: Scaffold(
          appBar: brandBar(
            'Leave Requests',
            bottom: const TabBar(
              tabs: [Tab(text: 'Pending'), Tab(text: 'Approved'), Tab(text: 'Rejected')],
            ),
          ),
          body: TabBarView(children: [
            _StatusList(status: 'Open', load: load, decide: decide),
            _StatusList(status: 'Approved', load: load),
            _StatusList(status: 'Rejected', load: load),
          ]),
        ),
      );
}

class _StatusList extends StatefulWidget {
  const _StatusList({required this.status, this.load, this.decide});

  final String status;
  final Future<List<Map<String, dynamic>>> Function(String status)? load;
  final Future<void> Function(String name, String status)? decide;

  @override
  State<_StatusList> createState() => _StatusListState();
}

class _StatusListState extends State<_StatusList> with AutomaticKeepAliveClientMixin {
  List<Map<String, dynamic>> _rows = const [];
  bool _loading = true;
  String _error = '';

  @override
  bool get wantKeepAlive => true;

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
      final rows = await (widget.load ?? AdminApi.leaveRequests)(widget.status);
      if (mounted) setState(() => _rows = rows);
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading && _rows.isEmpty) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _load,
      child: _rows.isEmpty
          ? (_error.isNotEmpty
              ? ListView(padding: const EdgeInsets.all(16), children: [Note(_error)])
              : EmptyNote(
                  widget.status == 'Open' ? 'Nothing waiting' : 'None yet',
                  widget.status == 'Open' ? 'No leave application is waiting for a decision.' : 'No applications here.',
                  icon: Icons.event_available_outlined,
                ))
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
              itemCount: _rows.length + 1,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                if (i == 0) {
                  return Text('${_rows.length} ${_rows.length == 1 ? 'application' : 'applications'}',
                      style: const TextStyle(fontSize: 12.5, color: kInk2));
                }
                return _row(_rows[i - 1]);
              },
            ),
    );
  }

  String _word(Map<String, dynamic> r) =>
      leaveStatusWord('${r['status'] ?? ''}', 0) == 'Waiting for HR' ? 'Pending' : leaveStatusWord('${r['status']}', 0);

  String _span(Map<String, dynamic> r) {
    final from = '${r['from_date'] ?? ''}';
    final to = '${r['to_date'] ?? ''}';
    return from == to ? dmy(from) : '${dmy(from)} – ${dmy(to)}';
  }

  String _days(Map<String, dynamic> r) {
    final d = double.tryParse('${r['total_leave_days'] ?? ''}');
    if (d == null) return '';
    return '${fmtDays(d)} ${d == 1 ? 'day' : 'days'}';
  }

  Widget _row(Map<String, dynamic> r) {
    final word = _word(r);
    return Panel(
      padding: const EdgeInsets.all(12),
      onTap: () => _open(r),
      child: Row(children: [
        Avatar(name: '${r['employee_name'] ?? r['employee'] ?? ''}'),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${r['employee_name'] ?? r['employee']}',
                overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, color: kInk)),
            Text(['${r['leave_type'] ?? ''}', _days(r)].where((s) => s.isNotEmpty).join(' · '),
                overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: kInk2)),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(_span(r), style: const TextStyle(fontSize: 12, color: kInk2)),
          const SizedBox(height: 4),
          Pill(word, color: wordColour(word)),
        ]),
      ]),
    );
  }

  Future<void> _decide(BuildContext sheet, Map<String, dynamic> r, String status) async {
    final who = '${r['employee_name'] ?? r['employee']}';
    final sure = await showDialog<bool>(
      context: sheet,
      builder: (d) => AlertDialog(
        title: Text(status == 'Approved' ? 'Approve leave?' : 'Reject leave?'),
        content: Text('$who · ${r['leave_type'] ?? ''} · ${_span(r)}'),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(d).pop(true),
            child: Text(status == 'Approved' ? 'Approve' : 'Reject'),
          ),
        ],
      ),
    );
    if (sure != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await (widget.decide ?? AdminApi.decideLeave)('${r['name']}', status);
      if (sheet.mounted) Navigator.of(sheet).pop();
      messenger.showSnackBar(SnackBar(content: Text('$who: ${status == 'Approved' ? 'approved' : 'rejected'}')));
      _load();
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(humanError(e))));
    }
  }

  Future<void> _open(Map<String, dynamic> r) => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (ctx) => SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
              Row(children: [
                Expanded(
                  child: Text('${r['employee_name'] ?? r['employee']}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: kInk)),
                ),
                Pill(_word(r), color: wordColour(_word(r))),
              ]),
              const SizedBox(height: 6),
              InfoRow(icon: Icons.beach_access_outlined, label: 'Leave type', value: '${r['leave_type'] ?? ''}'),
              InfoRow(
                icon: Icons.date_range_outlined,
                label: 'Dates',
                value: [_span(r), _days(r), if ('${r['half_day'] ?? 0}' == '1') 'half day']
                    .where((s) => s.isNotEmpty)
                    .join(' · '),
              ),
              InfoRow(icon: Icons.notes_outlined, label: 'Reason', value: '${r['description'] ?? ''}'),
              InfoRow(icon: Icons.event_outlined, label: 'Applied on', value: dmy('${r['posting_date'] ?? ''}')),
              InfoRow(icon: Icons.business_outlined, label: 'Company', value: '${r['company'] ?? ''}'),
              const SizedBox(height: 12),
              if ('${r['status']}' == 'Open') ...[
                Row(children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _decide(ctx, r, 'Rejected'),
                      style: OutlinedButton.styleFrom(foregroundColor: kBad),
                      child: const Text('Reject'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => _decide(ctx, r, 'Approved'),
                      child: const Text('Approve'),
                    ),
                  ),
                ]),
                const SizedBox(height: 10),
              ],
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.of(ctx).pop();
                  Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProfileScreen(id: '${r['employee']}')));
                },
                icon: const Icon(Icons.person_outline),
                label: const Text('Open employee'),
              ),
            ]),
          ),
        ),
      );
}
