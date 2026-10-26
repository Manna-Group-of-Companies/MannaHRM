import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/day.dart' show tidyDept;
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/money.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/screens/admin/day_screen.dart';
import 'package:manna_hr_app/screens/admin/employees_screen.dart';
import 'package:manna_hr_app/screens/profile_screen.dart';
import 'package:manna_hr_app/services/admin_api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// HR's reports — each one a read of what the site already holds.
class ReportsScreen extends StatelessWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    void open(Widget page) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
    return Scaffold(
      appBar: brandBar('Reports'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TileGrid([
            Tile(
              icon: Icons.fingerprint,
              label: 'Attendance Report',
              color: kTileBlue,
              onTap: () => open(const DayScreen(title: 'Attendance Report')),
            ),
            Tile(
              icon: Icons.beach_access_rounded,
              label: 'Leave Report',
              color: kTileGreen,
              onTap: () => open(const DayScreen(title: 'Leave Report', initialTab: 2)),
            ),
            Tile(
              icon: Icons.payments_rounded,
              label: 'Payroll Report',
              color: kTileOrange,
              onTap: () => open(const PayrollReport()),
            ),
            Tile(
              icon: Icons.badge_rounded,
              label: 'Employee Directory',
              color: kTilePurple,
              onTap: () => open(const EmployeesScreen()),
            ),
          ]),
        ],
      ),
    );
  }
}

/// A month's salary slips for everybody: how many, what they add up to, and
/// each one — drafts marked, because HR's question is what has been made, not
/// only what has been paid.
class PayrollReport extends StatefulWidget {
  const PayrollReport({super.key});

  @override
  State<PayrollReport> createState() => _PayrollReportState();
}

class _PayrollReportState extends State<PayrollReport> {
  late DateTime _month;
  List<Map<String, dynamic>> _rows = const [];
  bool _loading = true;
  String _error = '';

  String get _ym => '${_month.year}-${_month.month.toString().padLeft(2, '0')}';

  @override
  void initState() {
    super.initState();
    final n = ServerClock.I.now();
    // Last month: this month's slips are rarely made before it ends.
    _month = DateTime(n.year, n.month - 1);
    _load();
  }

  Future<void> _load() async {
    final ym = _ym;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final rows = await AdminApi.slips(ym);
      if (mounted && ym == _ym) setState(() => _rows = rows);
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _shift(int by) {
    setState(() {
      _month = DateTime(_month.year, _month.month + by);
      _rows = const [];
    });
    _load();
  }

  double _sum(String key) => _rows.fold(0.0, (a, r) => a + (double.tryParse('${r[key] ?? 0}') ?? 0));

  @override
  Widget build(BuildContext context) {
    final drafts = _rows.where((r) => '${r['docstatus']}' == '0').length;
    return Scaffold(
      appBar: brandBar('Payroll Report'),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
          children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              IconButton(tooltip: 'Previous month', onPressed: _loading ? null : () => _shift(-1), icon: const Icon(Icons.chevron_left)),
              Text(monthTitle('$_ym-01'), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: kInk)),
              IconButton(tooltip: 'Next month', onPressed: _loading ? null : () => _shift(1), icon: const Icon(Icons.chevron_right)),
            ]),
            if (_error.isNotEmpty) Note(_error),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(gradient: kBrandGradient, borderRadius: BorderRadius.circular(18)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Net payroll', style: TextStyle(color: Colors.white, fontSize: 13)),
                const SizedBox(height: 4),
                Text(_loading ? '…' : rupees(_sum('net_pay')),
                    style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(
                  '${_rows.length} ${_rows.length == 1 ? 'slip' : 'slips'}${drafts > 0 ? ' · $drafts draft' : ''}',
                  style: const TextStyle(color: Colors.white, fontSize: 12.5),
                ),
              ]),
            ),
            const SizedBox(height: 12),
            TileGrid([
              Panel(child: _figure('Gross', _sum('gross_pay'), kGood)),
              Panel(child: _figure('Deductions', _sum('total_deduction'), kBad)),
            ]),
            const SectionTitle('Salary slips'),
            if (_loading && _rows.isEmpty)
              const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator()))
            else if (_rows.isEmpty)
              const Panel(child: Text('No salary slips for this month.', style: TextStyle(color: kInk2)))
            else
              for (final r in _rows)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Panel(
                    padding: const EdgeInsets.all(12),
                    onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => ProfileScreen(id: '${r['employee']}'))),
                    child: Row(children: [
                      Avatar(name: '${r['employee_name'] ?? r['employee']}'),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${r['employee_name'] ?? r['employee']}',
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w700, color: kInk)),
                          Text(tidyDept('${r['department'] ?? r['company'] ?? ''}'),
                              overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: kInk2)),
                        ]),
                      ),
                      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(rupees(r['net_pay']), style: const TextStyle(fontWeight: FontWeight.w800, color: kInk)),
                        const SizedBox(height: 4),
                        Pill('${r['docstatus']}' == '0' ? 'Draft' : 'Submitted',
                            color: wordColour('${r['docstatus']}' == '0' ? 'Draft' : 'Submitted')),
                      ]),
                    ]),
                  ),
                ),
          ],
        ),
      ),
    );
  }

  Widget _figure(String label, double n, Color ink) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: TextStyle(color: ink, fontSize: 12.5)),
        const SizedBox(height: 4),
        Text(_loading ? '…' : rupees(n), style: TextStyle(color: ink, fontSize: 17, fontWeight: FontWeight.w800)),
      ]);
}
