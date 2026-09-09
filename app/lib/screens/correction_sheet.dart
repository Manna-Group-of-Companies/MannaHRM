import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/services/api.dart';

/// Asking for the punch a day is missing.
///
/// **It writes a request, never a day.** `Attendance` is generated from
/// `Employee Checkin` by the shift job on the site, and a hand-written row is
/// invisible to the thing that would have created it — the two disagree the
/// moment anything is reprocessed, and what disagrees is somebody's pay
/// (CLAUDE.md §5). So this asks, an approver answers, and the approval is what
/// writes the punch.
///
/// The sheet says that where it can be read, rather than letting somebody
/// believe that saving here settles anything.
///
/// Returns true when a request was created.
Future<bool> showCorrectionSheet(
  BuildContext context, {
  required String iso,
  String? seedIn,
  String? seedOut,
  String? note,
}) async {
  final made = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom),
      child: _CorrectionForm(iso: iso, seedIn: seedIn, seedOut: seedOut, note: note),
    ),
  );
  return made == true;
}

class _CorrectionForm extends StatefulWidget {
  const _CorrectionForm({
    required this.iso,
    this.seedIn,
    this.seedOut,
    this.note,
  });

  final String iso;

  /// `HH:MM` the day already holds, if anything. Seeded rather than blank: the
  /// times already recorded are the ones an approver is being asked to trust,
  /// and retyping them is how a correction acquires a typo.
  final String? seedIn;
  final String? seedOut;

  /// Why this form opened, when it opened by itself — a punch the app or the
  /// site refused. It is the context the approver would otherwise never get.
  final String? note;

  @override
  State<_CorrectionForm> createState() => _CorrectionFormState();
}

class _CorrectionFormState extends State<_CorrectionForm> {
  final _reason = TextEditingController();
  TimeOfDay? _in;
  TimeOfDay? _out;
  bool _busy = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _in = _parse(widget.seedIn);
    _out = _parse(widget.seedOut);
    if ((widget.note ?? '').isNotEmpty) _reason.text = widget.note!;
  }

  static TimeOfDay? _parse(String? hm) {
    if (hm == null || hm.length < 4) return null;
    final parts = hm.split(':');
    final h = int.tryParse(parts.first);
    final m = parts.length > 1 ? int.tryParse(parts[1]) : null;
    if (h == null || m == null) return null;
    return TimeOfDay(hour: h, minute: m);
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  String? get _problem {
    if (_in == null && _out == null) {
      return 'A correction with neither time in it is not asking for anything.';
    }
    if (_in != null && _out != null) {
      final a = _in!.hour * 60 + _in!.minute;
      final b = _out!.hour * 60 + _out!.minute;
      if (b <= a) {
        return 'The out is not after the in. A night shift belongs to the day '
            'it started, and this screen cannot yet say so — ask HR for that one.';
      }
    }
    if (_reason.text.trim().isEmpty) {
      return 'Say why. It is what the approver reads.';
    }
    return null;
  }

  String _hm(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pick(bool isIn) async {
    final t = await showTimePicker(
      context: context,
      initialTime: (isIn ? _in : _out) ??
          TimeOfDay(hour: isIn ? 9 : 18, minute: isIn ? 0 : 0),
    );
    if (t == null) return;
    setState(() {
      if (isIn) {
        _in = t;
      } else {
        _out = t;
      }
      _error = '';
    });
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await Api.createCorrection(
        iso: widget.iso,
        inAt: _in == null ? null : _hm(_in!),
        outAt: _out == null ? null : _hm(_out!),
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
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              const Icon(Icons.edit_calendar_outlined),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Correction for ${_dmy(widget.iso)}',
                    style: const TextStyle(
                        fontSize: 17, fontWeight: FontWeight.w700)),
              ),
            ]),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(child: _timeField('Punch in', _in, () => _pick(true))),
              const SizedBox(width: 12),
              Expanded(child: _timeField('Punch out', _out, () => _pick(false))),
            ]),
            const SizedBox(height: 6),
            Text(
              'Leave one empty where only the other is missing.',
              style: TextStyle(
                  fontSize: 12, color: Colors.black.withValues(alpha: .55)),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _reason,
              minLines: 2,
              maxLines: 4,
              onChanged: (_) => setState(() => _error = ''),
              decoration: const InputDecoration(
                labelText: 'Reason',
                hintText: 'What happened — the machine did not read, on site, '
                    'power cut…',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF4F5F7),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                'This asks for a punch. It does not mark the day. The request '
                'goes to your approver, and approving it is what records the '
                'punch on the site.',
                style: TextStyle(fontSize: 12.5),
              ),
            ),
            if (problem != null || _error.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(_error.isNotEmpty ? _error : problem!,
                  style: const TextStyle(color: Color(0xFF991B1B))),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy || problem != null ? null : _save,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: _busy
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Text('Send for approval'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _timeField(String label, TimeOfDay? value, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          suffixIcon: value == null
              ? const Icon(Icons.schedule)
              : IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () => setState(() {
                    if (label == 'Punch in') {
                      _in = null;
                    } else {
                      _out = null;
                    }
                  }),
                ),
        ),
        child: Text(value == null ? '—' : _hm(value),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      ),
    );
  }
}

/// `2026-09-09` → `09/09/2026`, the way every date is printed on the dashboard.
String _dmy(String iso) => iso.length < 10
    ? iso
    : '${iso.substring(8, 10)}/${iso.substring(5, 7)}/${iso.substring(0, 4)}';

/// Re-exported so the calendar can print a day the same way without importing
/// this file twice over.
String dmy(String iso) => _dmy(iso);

/// `HH:MM` out of a stamp, for seeding this form from what a day already holds.
String? seedFrom(Object? stamp) {
  final hm = clockOf(stamp);
  return hm.isEmpty ? null : hm;
}
