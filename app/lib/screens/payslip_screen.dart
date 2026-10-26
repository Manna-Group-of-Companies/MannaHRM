import 'package:flutter/material.dart';

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
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(gradient: kBrandGradient, borderRadius: BorderRadius.circular(18)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Net Salary', style: TextStyle(color: Colors.white, fontSize: 13)),
            const SizedBox(height: 4),
            Text(rupees(net), style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800)),
            if ('${s['payment_days'] ?? ''}'.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text('${s['payment_days']} payment days',
                  style: const TextStyle(color: Colors.white, fontSize: 12.5)),
            ],
          ]),
        ),
        const SizedBox(height: 12),
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(child: _total('Earnings', s['gross_pay'], kGood, kGreenSoft)),
            const SizedBox(width: 12),
            Expanded(
                child: _total('Deductions', s['total_deduction'], kBad, kBadSoft)),
          ]),
        ),
        _lines('Earnings', s['earnings']),
        _lines('Deductions', s['deductions']),
      ],
    ];
  }

  Widget _total(String label, Object? n, Color ink, Color bg) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(color: ink, fontSize: 12.5)),
          const SizedBox(height: 4),
          Text(rupees(n), style: TextStyle(color: ink, fontSize: 18, fontWeight: FontWeight.w800)),
        ]),
      );

  Widget _lines(String title, Object? rows) {
    final list = rows is List ? rows.whereType<Map>().toList() : const <Map>[];
    if (list.isEmpty) return const SizedBox();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionTitle(title),
      Panel(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Column(children: [
          for (final r in list)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 9),
              child: Row(children: [
                Expanded(child: Text('${r['salary_component'] ?? ''}', style: const TextStyle(color: kInk))),
                Text(rupees(r['amount']), style: const TextStyle(fontWeight: FontWeight.w700, color: kInk)),
              ]),
            ),
        ]),
      ),
    ]);
  }
}
