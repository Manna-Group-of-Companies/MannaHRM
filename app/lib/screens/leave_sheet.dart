import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/leave_rules.dart';
import 'package:manna_hr_app/screens/correction_sheet.dart' show dmy;
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// Asking for leave (19 October 2026).
///
/// **It asks; it never books.** What goes to the site is a draft Leave
/// Application to the administrator. Approving it on the dashboard submits
/// it, and hrms then takes it off the balance and marks the days On Leave —
/// the month here shows that on its next read, with nothing more to do.
///
/// [kinds] is the leave this person has, when the caller already holds it —
/// a test does. Otherwise it is read from the site as the page opens.
///
/// Returns true when a request was sent.
Future<bool> openApplyLeave(BuildContext context, {List<LeaveKind>? kinds}) async {
  final made = await Navigator.of(context).push<bool>(MaterialPageRoute(
    builder: (_) => Scaffold(
      appBar: brandBar('Apply Leave'),
      body: SingleChildScrollView(child: _LeaveForm(kinds: kinds)),
    ),
  ));
  return made == true;
}

class _LeaveForm extends StatefulWidget {
  const _LeaveForm({this.kinds});
  final List<LeaveKind>? kinds;

  @override
  State<_LeaveForm> createState() => _LeaveFormState();
}

class _LeaveFormState extends State<_LeaveForm> {
  final _reason = TextEditingController();
  List<LeaveKind> _kinds = const [];
  bool _loadingKinds = true;
  String _type = '';
  DateTime? _from;
  DateTime? _to;
  bool _half = false;
  bool _busy = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    if (widget.kinds != null) {
      _kinds = widget.kinds!;
      _loadingKinds = false;
    } else {
      _loadKinds();
    }
  }

  Future<void> _loadKinds() async {
    try {
      final k = await Api.leaveKinds();
      if (mounted) setState(() => _kinds = k);
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loadingKinds = false);
    }
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  static String _iso(DateTime? d) => d == null
      ? ''
      : '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String? get _problem => leaveProblem(
        type: _type,
        from: _iso(_from),
        to: _iso(_to),
        halfDay: _half,
        reason: _reason.text,
      );

  Future<void> _pick(bool first) async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: (first ? _from : _to) ?? _from ?? now,
      // Back as well as forward: sick leave is usually asked for after the day.
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 1, 12, 31),
    );
    if (d == null) return;
    setState(() {
      if (first) {
        _from = d;
        if (_to == null || _to!.isBefore(d)) _to = d;
      } else {
        _to = d;
      }
      if (_iso(_from) != _iso(_to)) _half = false;
      _error = '';
    });
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await Api.applyLeave(
        type: _type,
        from: _iso(_from),
        to: _iso(_to),
        halfDay: _half,
        reason: _reason.text,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final problem = _problem;
    final oneDay = _from != null && _iso(_from) == _iso(_to);
    final days = spanDays(_iso(_from), _iso(_to));
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_loadingKinds)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: LinearProgressIndicator(),
              )
            else
              DropdownButtonFormField<String>(
                initialValue: _type.isEmpty ? null : _type,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Leave type'),
                items: _kinds
                    .map((k) => DropdownMenuItem(value: k.name, child: Text(k.label)))
                    .toList(),
                onChanged: _busy ? null : (v) => setState(() => _type = v ?? ''),
              ),
            if (!_loadingKinds && _kinds.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('You have no leave to ask for yet. Ask HR.',
                    style: TextStyle(fontSize: 12.5, color: kInk2)),
              ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _dateField('First day', _from, () => _pick(true))),
              const SizedBox(width: 12),
              Expanded(child: _dateField('Last day', _to, () => _pick(false))),
            ]),
            if (days > 0)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(_half ? 'Half a day' : '$days ${days == 1 ? 'day' : 'days'}',
                    style: TextStyle(fontSize: 12.5, color: kInk2)),
              ),
            if (oneDay)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _half,
                onChanged: _busy ? null : (v) => setState(() => _half = v ?? false),
                title: const Text('Half day'),
                controlAffinity: ListTileControlAffinity.leading,
              ),
            const SizedBox(height: 8),
            TextField(
              controller: _reason,
              minLines: 2,
              maxLines: 4,
              onChanged: (_) => setState(() => _error = ''),
              decoration: const InputDecoration(labelText: 'Reason', alignLabelWithHint: true),
            ),
            if (problem != null || _error.isNotEmpty) ...[
              const SizedBox(height: 12),
              Note(_error.isNotEmpty ? _error : problem!, kind: _error.isNotEmpty ? NoteKind.error : NoteKind.warn),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy || problem != null ? null : _send,
              child: _busy
                  ? const SizedBox(
                      height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: kOnPrimary))
                  : const Text('Send to HR'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dateField(String label, DateTime? value, VoidCallback onTap) {
    return InkWell(
      onTap: _busy ? null : onTap,
      borderRadius: BorderRadius.circular(8),
      child: InputDecorator(
        decoration: InputDecoration(labelText: label, suffixIcon: const Icon(Icons.event)),
        child: Text(value == null ? '—' : dmy(_iso(value)),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      ),
    );
  }
}
