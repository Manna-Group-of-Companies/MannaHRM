import 'package:flutter/material.dart';

import 'package:manna_hr_app/app.dart' show kStatusColour;
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/core/roster.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/screens/correction_sheet.dart';
import 'package:manna_hr_app/services/api.dart';

const List<String> _monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/// My month.
///
/// The screen that answers *"what happened to my 19th of August"* — which is a
/// different question from "am I in right now", and is the reason this is a
/// month rather than a list of punches. Every day of the cycle is drawn,
/// including the ones with nothing on them, because a day with nothing on it is
/// the finding.
///
/// The arithmetic is `core/roster.dart` and is shared, in reasoning if not in
/// bytes, with `manna_hr/rules.py` and the dashboard. What is decided here is
/// only how it is drawn.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key, this.openDay});

  /// Opens this day's sheet as soon as the month lands. Set when somebody
  /// arrives here from a punch that was refused.
  final String? openDay;

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  late int _year;
  late int _month;
  bool _loading = true;
  String _error = '';
  MonthData _data = MonthData.empty();
  List<RosterDay> _rows = const [];
  bool _autoOpened = false;

  String get _ym => '$_year-${_month.toString().padLeft(2, '0')}';

  @override
  void initState() {
    super.initState();
    final now = ServerClock.I.now();
    _year = now.year;
    _month = now.month;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final data = await Api.month(_ym);
      if (!mounted) return;
      setState(() {
        _data = data;
        _rows = monthRoster(
          ym: _ym,
          punches: data.punches,
          leave: data.leave,
          holidays: data.holidays,
          corrections: data.corrections,
          // The site's today, not the phone's. A phone set forward by a day
          // would mark today absent.
          today: isoDay(ServerClock.I.now()),
        );
      });
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
    final day = widget.openDay;
    if (day != null && !_autoOpened && mounted) {
      _autoOpened = true;
      final row = _rows.where((r) => r.iso == day).firstOrNull;
      if (row != null) _openDay(row);
    }
  }

  void _shiftMonth(int delta) {
    var y = _year;
    var m = _month + delta;
    if (m < 1) {
      m = 12;
      y--;
    } else if (m > 12) {
      m = 1;
      y++;
    }
    setState(() {
      _year = y;
      _month = m;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My attendance'),
        actions: [
          IconButton(
            tooltip: 'Reload from the site',
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      body: Column(children: [
        _monthBar(),
        if (_loading)
          const Expanded(child: Center(child: CircularProgressIndicator()))
        else
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
              children: [
                if (_error.isNotEmpty) _warning(_error),
                if (_data.error.isNotEmpty) _warning(_data.error),
                if (_data.noHolidayList)
                  _warning(
                    'No holiday list on your record or your company, so nothing '
                    'here knows which days are Sundays. Every one of them reads '
                    'as a day nobody punched on. That is HR\'s to fix, and it is '
                    'worth telling them.',
                  ),
                _weekHeader(),
                _grid(),
                const SizedBox(height: 12),
                _key(),
              ],
            ),
          ),
      ]),
    );
  }

  Widget _monthBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            onPressed: _loading ? null : () => _shiftMonth(-1),
          ),
          Text('${_monthNames[_month - 1]} $_year',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            onPressed: _loading ? null : () => _shiftMonth(1),
          ),
        ],
      ),
    );
  }

  Widget _weekHeader() {
    const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return Row(
      children: labels
          .map((d) => Expanded(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text(d,
                        style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: Colors.black.withValues(alpha: .5))),
                  ),
                ),
              ))
          .toList(),
    );
  }

  Widget _grid() {
    if (_rows.isEmpty) return const SizedBox();
    // Sunday-start, because that is the week both this group and Factor HR
    // read. `weekday` is 1..7 with Sunday 7, so the modulo puts Sunday first.
    final lead = DateTime(_year, _month, 1).weekday % 7;
    final cells = <Widget>[
      for (var i = 0; i < lead; i++) const SizedBox(),
      ..._rows.map(_cell),
    ];
    return GridView.count(
      crossAxisCount: 7,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: cells,
    );
  }

  Widget _cell(RosterDay r) {
    final colour = kStatusColour[r.status] ?? const Color(0xFFCBD2DC);
    // `unmarked` is drawn as an outline rather than a fill: a day that has not
    // happened yet and a day that was worked must not read as two shades of the
    // same thing.
    final filled = r.status != DayStatus.unmarked;
    final day = int.parse(r.iso.substring(8, 10));
    return InkWell(
      onTap: () => _openDay(r),
      child: Container(
        margin: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: filled ? colour : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: filled ? Colors.transparent : const Color(0xFFE5E7EB)),
        ),
        child: Stack(children: [
          Center(
            child: Text(
              '$day',
              style: TextStyle(
                color: filled ? Colors.white : Colors.black87,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          // A day carrying a correction is flagged, whatever its colour: it is
          // the day somebody already knows about and is waiting on.
          if (r.correction != null)
            const Positioned(
              right: 3,
              top: 3,
              child: Icon(Icons.flag, size: 11, color: Colors.white),
            ),
        ]),
      ),
    );
  }

  Widget _key() {
    final counts = countStates(_rows);
    return Wrap(
      spacing: 14,
      runSpacing: 8,
      children: DayStatus.values.map((s) {
        final n = counts[s] ?? 0;
        return Opacity(
          opacity: n == 0 ? .45 : 1,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: kStatusColour[s],
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            const SizedBox(width: 5),
            // The word as well as the colour, always. Eight states over
            // thirty-one cells is exactly the chart that fails on colour alone,
            // and this one is read to check a wage.
            Text('${kDayLabels[s]} $n', style: const TextStyle(fontSize: 12)),
          ]),
        );
      }).toList(),
    );
  }

  Widget _warning(String text) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF7ED),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFFED7AA)),
        ),
        child: Text(text, style: const TextStyle(fontSize: 12.5)),
      );

  Future<void> _openDay(RosterDay r) async {
    final correction = r.correction;
    final isFuture = r.iso.compareTo(isoDay(ServerClock.I.now())) > 0;

    await showModalBottomSheet(
      context: context,
      builder: (sheetCtx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: kStatusColour[r.status],
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
              const SizedBox(width: 8),
              Text(dmy(r.iso),
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(width: 8),
              Text(r.label, style: TextStyle(color: Colors.black.withValues(alpha: .6))),
            ]),
            const SizedBox(height: 16),
            Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
              _stat('In', clockOf(r.inAt)),
              _stat('Out', clockOf(r.outAt)),
              _stat('Hours', r.hours),
            ]),
            if (r.punches.length > 2) ...[
              const SizedBox(height: 10),
              Text(
                '${r.punches.length} punches on this day — '
                '${r.punches.map((p) => clockOf(p['time'])).join(', ')}',
                style: const TextStyle(fontSize: 12),
              ),
            ],
            if (r.holiday.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(r.holiday, style: const TextStyle(fontWeight: FontWeight.w600)),
            ],
            if (r.leave != null) ...[
              const SizedBox(height: 12),
              Text('${r.leave!['leave_type'] ?? 'Leave'} · ${r.leave!['status']}'),
            ],
            const SizedBox(height: 16),
            if (correction != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF4F5F7),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Correction: ${correction['status']}',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    if ('${correction['reason'] ?? ''}'.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text('${correction['reason']}',
                            style: const TextStyle(fontSize: 12.5)),
                      ),
                    // A decided request is not edited in place: changing it
                    // would rewrite what was answered and leave the decision
                    // attached to different numbers. Raising another one is the
                    // way, and the old one stays as the record of what was
                    // asked.
                    if ('${correction['status']}' != 'Pending Approval')
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: TextButton(
                          onPressed: () {
                            Navigator.pop(sheetCtx);
                            _ask(r);
                          },
                          child: const Text('Ask again for this day'),
                        ),
                      ),
                  ],
                ),
              )
            else if (!isFuture)
              FilledButton.icon(
                onPressed: () {
                  Navigator.pop(sheetCtx);
                  _ask(r);
                },
                icon: const Icon(Icons.edit_calendar_outlined),
                label: const Text('Ask for a correction'),
              )
            else
              Text('Nothing has happened on this day yet.',
                  style: TextStyle(color: Colors.black.withValues(alpha: .6))),
          ]),
        ),
      ),
    );
  }

  Widget _stat(String label, String value) => Column(children: [
        Text(label, style: TextStyle(color: Colors.black.withValues(alpha: .55))),
        const SizedBox(height: 2),
        Text(value.isEmpty ? '—' : value,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
      ]);

  Future<void> _ask(RosterDay r) async {
    final made = await showCorrectionSheet(
      context,
      iso: r.iso,
      seedIn: seedFrom(r.inAt),
      seedOut: seedFrom(r.outAt),
    );
    if (!made || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sent for approval ✓')));
    _load();
  }
}
