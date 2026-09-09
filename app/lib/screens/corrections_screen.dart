import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/screens/correction_sheet.dart';
import 'package:manna_hr_app/services/api.dart';

/// Every correction this person has asked for, at every status.
///
/// **Decided ones included, and that is the point.** The approval queue on the
/// dashboard holds open requests, because a decided request is not a backlog
/// item. This screen answers the other question — *what happened to the one I
/// sent* — and the answer is often "it was refused", which a list of open
/// requests could never say.
class CorrectionsScreen extends StatefulWidget {
  const CorrectionsScreen({super.key});

  @override
  State<CorrectionsScreen> createState() => _CorrectionsScreenState();
}

class _CorrectionsScreenState extends State<CorrectionsScreen> {
  List<Map<String, dynamic>> _rows = const [];
  bool _loading = true;
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
      final rows = await Api.myCorrections();
      if (mounted) setState(() => _rows = rows);
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  static Color _statusColour(String status) {
    switch (status) {
      case 'Approved':
      case 'Completed':
        return const Color(0xFF0EA372);
      case 'Rejected':
        return const Color(0xFFDC2626);
      default:
        return const Color(0xFFC77A0B);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My corrections')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  if (_error.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF2F2),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFFECACA)),
                      ),
                      child: Text(_error,
                          style: const TextStyle(color: Color(0xFF991B1B))),
                    ),
                  if (_rows.isEmpty && _error.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 60),
                      child: Center(
                        child: Text('You have not asked for any.',
                            style: TextStyle(
                                color: Colors.black.withValues(alpha: .55))),
                      ),
                    ),
                  ..._rows.map((r) {
                    final status = '${r['status'] ?? ''}';
                    final inAt = clockOf(r['requested_in']);
                    final outAt = clockOf(r['requested_out']);
                    return Card(
                      child: ListTile(
                        title: Row(children: [
                          Text(dmy('${r['attendance_date'] ?? ''}'),
                              style: const TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(width: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: _statusColour(status).withValues(alpha: .12),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(status,
                                style: TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w600,
                                    color: _statusColour(status))),
                          ),
                        ]),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 4),
                            Text([
                              if (inAt.isNotEmpty) 'in $inAt',
                              if (outAt.isNotEmpty) 'out $outAt',
                            ].join(' · ')),
                            if ('${r['reason'] ?? ''}'.isNotEmpty)
                              Text('${r['reason']}',
                                  style: const TextStyle(fontSize: 12.5)),
                            if ('${r['decision_note'] ?? ''}'.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text('Answer: ${r['decision_note']}',
                                    style: const TextStyle(
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w600)),
                              ),
                          ],
                        ),
                        isThreeLine: true,
                      ),
                    );
                  }),
                ],
              ),
      ),
    );
  }
}
