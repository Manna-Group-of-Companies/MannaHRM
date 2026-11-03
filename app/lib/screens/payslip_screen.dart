import 'package:flutter/material.dart';

import 'package:manna_hr_app/screens/correction_sheet.dart' show dmy;
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/money.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// A month's pay: the net, what made it up and what came off.
///
/// **Only what the site has submitted.** A draft slip is HR's working copy and
/// may still change; showing it to the person it is for would be telling them
/// a number before it is their pay. The figures are the slip's own — nothing
/// here works one out.
class PayslipScreen extends StatefulWidget {
  const PayslipScreen({super.key, this.employee, this.bare = false});

  /// An Employee id, for HR. Left out, it is this login's own.
  final String? employee;

  /// Without its own app bar — a tab inside another page.
  final bool bare;

  @override
  State<PayslipScreen> createState() => _PayslipScreenState();
}

class _PayslipScreenState extends State<PayslipScreen> {
  List<Map<String, dynamic>> _slips = const [];
  String _pick = '';
  Map<String, dynamic>? _slip;
  bool _loading = true;
  bool _reading = false;
  String _error = '';

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
      final rows = await Api.salarySlips(employee: widget.employee);
      if (!mounted) return;
      setState(() => _slips = rows);
      if (rows.isNotEmpty) await _open('${rows.first['name']}');
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(String name) async {
    setState(() {
      _pick = name;
      _reading = true;
      _error = '';
    });
    try {
      final doc = await Api.salarySlip(name);
      if (mounted && _pick == name) setState(() => _slip = doc);
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _reading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final body = RefreshIndicator(
      onRefresh: _load,
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _slips.isEmpty
              ? (_error.isNotEmpty
                  ? ListView(padding: const EdgeInsets.all(16), children: [Note(_error)])
                  : const EmptyNote('No payslips yet', 'A payslip shows here once HR has submitted it.',
                      icon: Icons.receipt_long_outlined))
              : ListView(padding: const EdgeInsets.fromLTRB(16, 14, 16, 24), children: _content()),
    );
    if (widget.bare) return body;
    return Scaffold(appBar: brandBar('Payslip'), body: body);
  }

  List<Widget> _content() {
    final s = _slip;
    final net = s?['rounded_total'] ?? s?['net_pay'] ?? 0;
    return [
      DropdownButtonFormField<String>(
        initialValue: _pick.isEmpty ? null : _pick,
        isExpanded: true,
        decoration: const InputDecoration(prefixIcon: Icon(Icons.calendar_month_outlined)),
        items: [
          for (final r in _slips)
            DropdownMenuItem(value: '${r['name']}', child: Text(monthTitle('${r['start_date'] ?? ''}'))),
        ],
        onChanged: _reading ? null : (v) => v == null ? null : _open(v),
      ),
      const SizedBox(height: 14),
      if (_error.isNotEmpty) Note(_error),
      if (_reading && s == null)
        const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
      else if (s != null) ...[
        // The FlutterFlow payslip (29 October 2026): the net on a white card,
        // the month's days under it, then each side of the slip on its own.
        Container(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 22),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
          child: Column(children: [
            const Text('Net Salary Payable',
                style: TextStyle(color: Color(0xFF3A4252), fontSize: 13.5, fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            Text(rupees(net),
                style: const TextStyle(color: Color(0xFF0B0F19), fontSize: 34, fontWeight: FontWeight.w800)),
            if ('${s['posting_date'] ?? ''}'.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(color: const Color(0xFFE6E8EC), borderRadius: BorderRadius.circular(20)),
                child: Text('${s['status'] == 'Submitted' ? 'Paid on' : 'Dated'} ${dmy('${s['posting_date']}')}',
                    style: const TextStyle(color: Color(0xFF4A5262), fontSize: 12, fontWeight: FontWeight.w700)),
              ),
            ],
          ]),
        ),
        const SizedBox(height: 16),
        _days(s),
        _lines('Earnings', s['earnings'], s['gross_pay']),
        _lines('Deductions', s['deductions'], s['total_deduction']),
      ],
    ];
  }

  /// Working days, days absent, days paid — each a number over a word, the
  /// three apart by hairlines.
  Widget _days(Map<String, dynamic> s) {
    String n(Object? v) {
      final d = double.tryParse('${v ?? ''}');
      if (d == null) return '—';
      return d == d.roundToDouble() ? '${d.round()}' : '$d';
    }

    final absent = (double.tryParse('${s['absent_days'] ?? 0}') ?? 0) +
        (double.tryParse('${s['leave_without_pay'] ?? 0}') ?? 0);
    Widget cell(String value, String label, Color ink) => Expanded(
          child: Column(children: [
            Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: ink)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: kInk2)),
          ]),
        );
    return Panel(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: IntrinsicHeight(
        child: Row(children: [
          cell(n(s['total_working_days']), 'Working Days', kInk),
          const VerticalDivider(color: kCardLine, width: 1),
          // A slip puts the cut in absent_days, not leave_without_pay, so the
          // two are added — the dashboard's lossOfPay does the same.
          cell(n(absent), 'Days Absent', kBad),
          const VerticalDivider(color: kCardLine, width: 1),
          cell(n(s['payment_days']), 'Paid Days', kInfo),
        ]),
      ),
    );
  }

  /// One side of the slip: its total in the card's head, a hairline, then a
  /// line for each component.
  Widget _lines(String title, Object? rows, Object? total) {
    final list = rows is List ? rows.whereType<Map>().toList() : const <Map>[];
    if (list.isEmpty) return const SizedBox();
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Panel(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 10),
        child: Column(children: [
          Row(children: [
            Expanded(child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: kInk))),
            Text(rupees(total), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: kInk)),
          ]),
          const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Divider(color: kCardLine, height: 1)),
          for (final r in list)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Row(children: [
                Expanded(
                  child: Text('${r['salary_component'] ?? ''}',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: kInk2)),
                ),
                Text(rupees(r['amount']), style: const TextStyle(fontWeight: FontWeight.w700, color: kInk)),
              ]),
            ),
        ]),
      ),
    );
  }
}
