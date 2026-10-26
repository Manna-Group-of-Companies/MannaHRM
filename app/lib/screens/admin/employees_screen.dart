import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/day.dart' show tidyDept;
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/screens/profile_screen.dart';
import 'package:manna_hr_app/services/admin_api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// Everybody on the site, searched and narrowed on the phone.
class EmployeesScreen extends StatefulWidget {
  const EmployeesScreen({super.key, this.load});

  /// For the tests: the list, in place of the site.
  final Future<List<Map<String, dynamic>>> Function()? load;

  @override
  State<EmployeesScreen> createState() => _EmployeesScreenState();
}

class _EmployeesScreenState extends State<EmployeesScreen> {
  List<Map<String, dynamic>> _all = const [];
  bool _loading = true;
  String _error = '';
  String _query = '';
  String _status = 'Active';
  String _company = '';

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
      final rows = await (widget.load ?? AdminApi.employees)();
      if (mounted) setState(() => _all = rows);
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _shown {
    final q = _query.trim().toLowerCase();
    return _all.where((r) {
      if (_status.isNotEmpty && '${r['status'] ?? ''}' != _status) return false;
      if (_company.isNotEmpty && '${r['company'] ?? ''}' != _company) return false;
      if (q.isEmpty) return true;
      return [r['employee_name'], r['employee_number'], r['name'], r['department'], r['designation'], r['cell_number']]
          .any((v) => '${v ?? ''}'.toLowerCase().contains(q));
    }).toList();
  }

  Future<void> _filters() async {
    final companies = ({for (final r in _all) '${r['company'] ?? ''}'}..remove('')).toList()..sort();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) {
          void pick(VoidCallback f) {
            set(f);
            setState(() {});
          }

          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Status', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final s in const ['Active', 'Inactive', 'Suspended', 'Left', ''])
                    ChoiceChip(
                      label: Text(s.isEmpty ? 'All' : s),
                      selected: _status == s,
                      onSelected: (_) => pick(() => _status = s),
                    ),
                ]),
                if (companies.length > 1) ...[
                  const SizedBox(height: 18),
                  const Text('Company', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    ChoiceChip(label: const Text('All'), selected: _company.isEmpty, onSelected: (_) => pick(() => _company = '')),
                    for (final c in companies)
                      ChoiceChip(label: Text(c), selected: _company == c, onSelected: (_) => pick(() => _company = c)),
                  ]),
                ],
              ]),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final rows = _shown;
    final narrowed = _status != 'Active' || _company.isNotEmpty;
    return Scaffold(
      appBar: brandBar('Employees'),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
          child: Row(children: [
            Expanded(
              child: TextField(
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  hintText: 'Search employee',
                  contentPadding: EdgeInsets.symmetric(vertical: 10),
                ),
                onChanged: (s) => setState(() => _query = s),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: 'Filter',
              onPressed: _all.isEmpty ? null : _filters,
              icon: Badge(isLabelVisible: narrowed, child: const Icon(Icons.filter_list_rounded)),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 6),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              [
                '${rows.length} ${rows.length == 1 ? 'person' : 'people'}',
                if (_status.isNotEmpty) _status,
                if (_company.isNotEmpty) _company,
              ].join(' · '),
              style: const TextStyle(fontSize: 12.5, color: kInk2),
            ),
          ),
        ),
        if (_loading) const LinearProgressIndicator(minHeight: 2),
        if (_error.isNotEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Note(_error)),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: rows.isEmpty && !_loading
                ? const EmptyNote('Nobody here', 'Nobody matches the search and the filter.', icon: Icons.person_search)
                : ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    itemCount: rows.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      final r = rows[i];
                      final status = '${r['status'] ?? ''}';
                      final role = '${r['designation'] ?? ''}'.isNotEmpty
                          ? '${r['designation']}'
                          : tidyDept('${r['department'] ?? ''}');
                      return Panel(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => ProfileScreen(id: '${r['name']}', seed: r),
                        )),
                        child: Row(children: [
                          Avatar(name: '${r['employee_name'] ?? ''}', image: '${r['image'] ?? ''}'),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('${r['employee_name'] ?? r['name']}',
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontWeight: FontWeight.w700, color: kInk)),
                              Text(
                                ['${r['employee_number'] ?? ''}', role].where((s) => s.isNotEmpty).join(' · '),
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 12.5, color: kInk2),
                              ),
                            ]),
                          ),
                          if (status.isNotEmpty) Pill(status, color: wordColour(status)),
                        ]),
                      );
                    },
                  ),
          ),
        ),
      ]),
    );
  }
}
