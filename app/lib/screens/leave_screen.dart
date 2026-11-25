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
    final body = _loading && _rows.isEmpty && _kinds.isEmpty
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 28),
              children: [
                if (_said.isNotEmpty) Note(_said, kind: NoteKind.ok),
                if (_error.isNotEmpty) Note(_error),
                if (_kinds.isNotEmpty) ...[
                  TileGrid(columns: 3, gap: 8, [for (final k in _kinds) _left(k)]),
                ],
                SectionTitle(_own ? 'Recent requests' : 'Leave history'),
                if (_rows.isEmpty && _error.isEmpty)
                  Panel(
                    child: Text(_own ? 'You have not asked for any leave.' : 'No leave asked for.',
                        style: const TextStyle(color: kInk2)),
                  )
                else if (_rows.isNotEmpty)
                  Panel(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                    child: Column(children: [
                      for (var i = 0; i < _rows.length; i++) ...[
                        if (i > 0) const Divider(height: 1),
                        _row(_rows[i]),
                      ],
                    ]),
                  ),
                if (_kinds.isNotEmpty) ...[
                  const SectionTitle('Leave balance'),
                  _summary(),
                  for (final k in _kinds) _detail(k),
                ] else if (!_loading) ...[
                  const SectionTitle('Leave balance'),
                  Panel(
                    child: Text(_own ? 'You have no leave to ask for yet. Ask HR.' : 'No leave allocated yet.',
                        style: const TextStyle(color: kInk2)),
                  ),
                ],
              ],
            ),
          );
    if (widget.bare) return body;
    return Scaffold(
      appBar: brandBar(_own ? 'My leave' : 'Leave', actions: [
        if (_own)
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: FilledButton.icon(
              onPressed: _apply,
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Apply'),
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 42),
                padding: const EdgeInsets.symmetric(horizontal: 16),
              ),
            ),
          ),
      ]),
      body: body,
    );
  }

  /// One kind's days left, large — "5 / Casual left".
  Widget _left(LeaveKind k) => Panel(
        padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(k.left == null ? '—' : fmtDays(k.left!), style: serif(24)),
          const SizedBox(height: 4),
          Text(k.left == null ? '${_short(k.name)} · no limit' : '${_short(k.name)} left',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: kInk2)),
        ]),
      );

  /// "Casual Leave" → "Casual": the tile already says it is leave.
  static String _short(String name) {
    final s = name.replaceAll(RegExp(r'\s*leave\s*$', caseSensitive: false), '').trim();
    return s.isEmpty ? name : s;
  }

  static IconData _iconFor(String type) {
    final t = type.toLowerCase();
    if (t.contains('sick') || t.contains('medical')) return Icons.favorite_border_rounded;
    if (t.contains('casual')) return Icons.wb_sunny_outlined;
    if (t.contains('earned') || t.contains('privilege') || t.contains('annual')) return Icons.ac_unit_rounded;
    if (t.contains('without pay') || t.contains('lwp')) return Icons.money_off_rounded;
    return Icons.beach_access_outlined;
  }

  Widget _summary() {
    final t = balanceTotals(_kinds);
    return Panel(
      padding: const EdgeInsets.all(10),
      child: Row(children: [
        Expanded(child: StatBox(value: fmtDays(t.total), label: 'Total')),
        const SizedBox(width: 8),
        Expanded(child: StatBox(value: fmtDays(t.taken), label: 'Used')),
        const SizedBox(width: 8),
        Expanded(child: StatBox(value: fmtDays(t.left), label: 'Remaining', color: kAccent)),
      ]),
    );
  }

  Widget _row(Map<String, dynamic> r) {
    final word = leaveStatusWord('${r['status'] ?? ''}', int.tryParse('${r['docstatus'] ?? 0}') ?? 0);
    final from = '${r['from_date'] ?? ''}';
    final to = '${r['to_date'] ?? ''}';
    final days = r['total_leave_days'];
    final half = '${r['half_day'] ?? 0}' == '1';
    final type = '${r['leave_type'] ?? ''}';
    final when = [
      from == to ? dmy(from) : '${dmy(from)} – ${dmy(to)}',
      if (days != null) '$days ${'$days' == '1' || '$days' == '1.0' ? 'day' : 'days'}',
      if (half) 'half day',
    ].join(' · ');
    final note = '${r['description'] ?? ''}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        IconBadge(_iconFor(type), color: wordColour(word), size: 40),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(type, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: kInk)),
            const SizedBox(height: 2),
            Text(when, style: const TextStyle(fontSize: 12, color: kInk2)),
            if (note.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(note,
                    maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: kInk)),
              ),
          ]),
        ),
        const SizedBox(width: 8),
        // The word as well as the colour: Rejected and Approved must not
        // differ only in hue.
        Pill(word, color: wordColour(word)),
      ]),
    );
  }

  Widget _detail(LeaveKind k) => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Panel(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              IconBadge(_iconFor(k.name), size: 34),
              const SizedBox(width: 10),
              Expanded(child: Text(k.name, style: const TextStyle(fontWeight: FontWeight.w700, color: kInk))),
              Text(k.left == null ? 'Without pay' : '${fmtDays(k.left!)} left',
                  style: const TextStyle(fontWeight: FontWeight.w800, color: kAccent)),
            ]),
            if (k.left != null && (k.total ?? 0) > 0) ...[
              const SizedBox(height: 12),
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
      );
}
