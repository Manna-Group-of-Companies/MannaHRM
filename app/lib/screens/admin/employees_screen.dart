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
    final companies = ({for (final r in _all) '${r['company'] ?? ''}'}..remove('')).toList()..sort();
    final top = MediaQuery.of(context).padding.top;
    // The FlutterFlow directory (29 October 2026): the title and the search on
    // a band with rounded lower corners, the companies as chips under it.
    return Scaffold(
      body: Column(children: [
        Container(
          padding: EdgeInsets.fromLTRB(20, top + 12, 12, 18),
          decoration: const BoxDecoration(
            color: kCard,
            borderRadius: BorderRadius.vertical(bottom: Radius.circular(26)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              if (Navigator.of(context).canPop()) ...[
                const BackButton(color: kInk),
                const SizedBox(width: 4),
              ],
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Employees', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: kInk)),
                  Text(
                    [
                      '${rows.length} ${rows.length == 1 ? 'person' : 'people'}',
                      if (_status.isNotEmpty) _status,
                    ].join(' · '),
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: kInk2),
                  ),
                ]),
              ),
              IconButton(
                tooltip: 'Filter',
                onPressed: _all.isEmpty ? null : _filters,
                icon: Badge(isLabelVisible: narrowed, child: const Icon(Icons.tune_rounded, color: kInk)),
              ),
            ]),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextField(
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  hintText: 'Search name or code',
                  contentPadding: EdgeInsets.symmetric(vertical: 10),
                ),
                onChanged: (s) => setState(() => _query = s),
              ),
            ),
          ]),
        ),
        if (companies.length > 1)
          SizedBox(
            height: 58,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
              children: [
                for (final c in ['', ...companies])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(c.isEmpty ? 'All' : c),
                      selected: _company == c,
                      showCheckmark: true,
                      checkmarkColor: kInk,
                      labelStyle: const TextStyle(fontWeight: FontWeight.w700, color: kInk),
                      backgroundColor: kCard,
                      selectedColor: kRaised,
                      side: const BorderSide(color: kCardLine),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      onSelected: (_) => setState(() => _company = c),
                    ),
                  ),
              ],
            ),
          )
        else
          const SizedBox(height: 10),
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
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, i) {
                      final r = rows[i];
                      final status = '${r['status'] ?? ''}';
                      final role = '${r['designation'] ?? ''}'.isNotEmpty
                          ? '${r['designation']}'
                          : tidyDept('${r['department'] ?? ''}');
                      final company = '${r['company'] ?? ''}';
                      return Panel(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => ProfileScreen(id: '${r['name']}', seed: r),
                        )),
                        child: Row(children: [
                          Avatar(name: '${r['employee_name'] ?? ''}', image: '${r['image'] ?? ''}', radius: 26),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('${r['employee_name'] ?? r['name']}',
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: kInk)),
                              const SizedBox(height: 2),
                              Text(
                                ['${r['employee_number'] ?? ''}', role].where((s) => s.isNotEmpty).join(' • '),
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: kInk2),
                              ),
                              if (company.isNotEmpty) ...[
                                const SizedBox(height: 3),
                                Row(children: [
                                  const Icon(Icons.business_rounded, size: 13, color: kFaint),
                                  const SizedBox(width: 4),
                                  Expanded(
                                    child: Text(company,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: kFaint)),
                                  ),
                                ]),
                              ],
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
