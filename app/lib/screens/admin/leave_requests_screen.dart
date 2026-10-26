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
/// **Read, not decided.** Approving one submits it, and hrms then books the
/// balance and marks the days — that happens on the website, as the approver,
/// where the queue already is (`kLeaveApprover`). A second place to approve
/// from would be a second set of rules about who may.
class LeaveRequestsScreen extends StatelessWidget {
  const LeaveRequestsScreen({super.key, this.load});

  /// For the tests: one status's rows, in place of the site.
  final Future<List<Map<String, dynamic>>> Function(String status)? load;

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
            _StatusList(status: 'Open', load: load),
            _StatusList(status: 'Approved', load: load),
            _StatusList(status: 'Rejected', load: load),
          ]),
        ),
      );
}

class _StatusList extends StatefulWidget {
  const _StatusList({required this.status, this.load});

  final String status;
  final Future<List<Map<String, dynamic>>> Function(String status)? load;

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
