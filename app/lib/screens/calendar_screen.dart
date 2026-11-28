import 'package:flutter/material.dart';

import 'package:manna_hr_app/app.dart' show kStatusColour;
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/money.dart' show kMonthNames;
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/core/roster.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/screens/correction_sheet.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// One person's month.
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
  const CalendarScreen({super.key, this.openDay, this.who, this.bare = false});

  /// Opens this day's sheet as soon as the month lands. Set when somebody
  /// arrives here from a punch that was refused.
  final String? openDay;

  /// An Employee record, for HR reading somebody else's month. A correction is
  /// asked for by the person it is for, so none is offered here then.
  final Map<String, dynamic>? who;

  /// Without its own app bar — a tab inside another page.
  final bool bare;

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

  bool get _own => widget.who == null;
  String get _ym => '$_year-${_month.toString().padLeft(2, '0')}';
  String get _today => isoDay(ServerClock.I.now());

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
      final data = await Api.month(_ym, who: widget.who);
      if (!mounted) return;
      setState(() {
        _data = data;
        // Punches that could not be read are not a month nobody came in:
        // drawn, every past workday would read Absent.
        _rows = data.punchesUnread ? const [] : monthRoster(
          ym: _ym,
          punches: data.punches,
          leave: data.leave,
          holidays: data.holidays,
          corrections: data.corrections,
          // The site's today, not the phone's. A phone set forward by a day
          // would mark today absent.
          today: _today,
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
    final body = RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
        children: [
          if (_error.isNotEmpty) Note(_error),
          if (_data.error.isNotEmpty) Note(_data.error),
          if (!_loading && _data.noHolidayList)
            Note(
              _own
                  ? 'Your holiday list could not be read, so Sundays are shown as week off but holidays such '
                      'as Onam or Christmas are not. Tell HR.'
                  : 'No holiday list on this record or its company, so Sundays are shown as week off but '
                      'holidays are not.',
              kind: NoteKind.warn,
            ),
          Panel(padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2), child: _monthBar()),
          const SizedBox(height: 16),
          if (!_loading && _rows.isNotEmpty) ...[_counts(), const SizedBox(height: 16)],
          Panel(
            padding: const EdgeInsets.fromLTRB(12, 14, 12, 14),
            child: Column(children: [
              _weekHeader(),
              if (_loading)
                const Padding(padding: EdgeInsets.symmetric(vertical: 60), child: CircularProgressIndicator())
              else
                _grid(),
            ]),
          ),
          if (!_loading && _rows.isNotEmpty) ...[
            if (_ym == _today.substring(0, 7)) ..._todayBlock(),
            const SizedBox(height: 16),
            _key(),
          ],
        ],
      ),
    );
    if (widget.bare) return body;
    return Scaffold(
      appBar: brandBar(_own ? 'Attendance' : '${widget.who?['employee_name'] ?? 'Attendance'}', actions: [
        IconButton(
          tooltip: 'Reload from the site',
          icon: const Icon(Icons.refresh),
          onPressed: _loading ? null : _load,
        ),
      ]),
      body: body,
    );
  }

  Widget _monthBar() => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            tooltip: 'Previous month',
            icon: const Icon(Icons.chevron_left),
            onPressed: _loading ? null : () => _shiftMonth(-1),
          ),
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text('${kMonthNames[_month - 1]} $_year', style: serif(17)),
            ),
          ),
          IconButton(
            tooltip: 'Next month',
            icon: const Icon(Icons.chevron_right),
            onPressed: _loading ? null : () => _shiftMonth(1),
          ),
        ],
      );

  Widget _weekHeader() {
    const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return Row(
      children: labels
          .map((d) => Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 10, top: 2),
                  child: Text(d,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: kFaint)),
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
    final colour = kStatusColour[r.status] ?? kFaint;
    // A day is a pale square of its state's colour with the number in that
    // colour; a day that has not happened yet is bare. Today is the one solid
    // green square.
    final bare = r.status == DayStatus.unmarked;
    final day = int.parse(r.iso.substring(8, 10));
    final isToday = r.iso == _today;
    final ink = isToday ? Colors.white : (bare ? kInk2 : colour);
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () => _openDay(r),
      child: Container(
        margin: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: isToday ? kPrimary : (bare ? Colors.transparent : colour.withValues(alpha: .13)),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Stack(children: [
          Center(
            child: Text('$day', style: TextStyle(color: ink, fontWeight: FontWeight.w700, fontSize: 13.5)),
          ),
          // A day carrying a correction is flagged, whatever its colour: it is
          // the day somebody already knows about and is waiting on.
          if (r.correction != null) Positioned(right: 3, top: 3, child: Icon(Icons.flag, size: 10, color: ink)),
        ]),
      ),
    );
  }

  Widget _counts() {
    final c = countStates(_rows);
    // Two digits, as the design draws them: 02 lines up under 22.
    Widget stat(String label, int n, Color colour) =>
        Expanded(child: StatBox(value: n.toString().padLeft(2, '0'), label: label, color: colour));
    return Panel(
      padding: const EdgeInsets.all(10),
      child: Row(children: [
        stat('Present', c[DayStatus.present] ?? 0, kStatusColour[DayStatus.present]!),
        const SizedBox(width: 8),
        stat('Absent', c[DayStatus.absent] ?? 0, kStatusColour[DayStatus.absent]!),
        const SizedBox(width: 8),
        stat('Leave', c[DayStatus.onLeave] ?? 0, kStatusColour[DayStatus.onLeave]!),
        const SizedBox(width: 8),
        // Week off and holidays apart (26 Nov 2026): a Sunday is never a holiday.
        stat('Week off', c[DayStatus.weeklyOff] ?? 0, kStatusColour[DayStatus.weeklyOff]!),
        const SizedBox(width: 8),
        stat('Holidays', c[DayStatus.holiday] ?? 0, kStatusColour[DayStatus.holiday]!),
      ]),
    );
  }

  List<Widget> _todayBlock() {
    final r = _rows.where((d) => d.iso == _today).firstOrNull;
    if (r == null) return const [];
    Widget line(IconData icon, Color colour, String label, String sub, String value) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(children: [
            IconBadge(icon, color: colour, size: 38),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: kInk)),
                Text(sub, style: const TextStyle(fontSize: 12, color: kInk2)),
              ]),
            ),
            Text(value.isEmpty ? '—' : value,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: kInk)),
          ]),
        );
    return [
      SectionTitle(_own ? longDate(ServerClock.I.now()) : 'Today'),
      Panel(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
        child: Column(children: [
          line(Icons.login_rounded, kTileGreen, 'Punch in', r.inAt.isEmpty ? 'Not punched in yet' : 'First punch',
              clockOf(r.inAt)),
          const Divider(height: 1),
          line(Icons.logout_rounded, kTileOrange, 'Punch out', r.outAt.isEmpty ? 'Not punched out yet' : 'Last punch',
              clockOf(r.outAt)),
          const Divider(height: 1),
          line(Icons.schedule_rounded, kTileBlue, 'Total hours', 'Today so far', r.hours),
        ]),
      ),
    ];
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
              width: 10,
              height: 10,
              decoration: BoxDecoration(color: kStatusColour[s], shape: BoxShape.circle),
            ),
            const SizedBox(width: 5),
            // The word as well as the colour, always. Eight states over
            // thirty-one cells is exactly the chart that fails on colour alone,
            // and this one is read to check a wage.
            Text('${kDayLabels[s]} $n', style: const TextStyle(fontSize: 12, color: kInk2)),
          ]),
        );
      }).toList(),
    );
  }

  Future<void> _openDay(RosterDay r) async {
    final correction = r.correction;
    final isFuture = r.iso.compareTo(_today) > 0;

    await showModalBottomSheet(
      context: context,
      // Scrollable, and allowed past half the screen. A day holding a
      // correction, a leave and a gate that double-read is taller than the
      // default sheet on a small phone, and a Column that does not fit paints
      // yellow-and-black stripes over the one row somebody opened it to read.
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetCtx) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(color: kStatusColour[r.status], borderRadius: BorderRadius.circular(3)),
              ),
              const SizedBox(width: 8),
              Text(dmy(r.iso), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(width: 8),
              // "Leave not granted" beside a date in large text is wider than a
              // 320 phone: it wraps rather than running off the edge.
              Flexible(child: Text(r.label, style: const TextStyle(color: kInk2))),
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
                decoration: BoxDecoration(color: kRaised, borderRadius: BorderRadius.circular(10)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Correction: ${correction['status']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    if ('${correction['reason'] ?? ''}'.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text('${correction['reason']}', style: const TextStyle(fontSize: 12.5)),
                      ),
                    // A decided request is not edited in place: changing it
                    // would rewrite what was answered and leave the decision
                    // attached to different numbers. Raising another one is the
                    // way, and the old one stays as the record of what was
                    // asked.
                    if (_own && '${correction['status']}' != 'Pending Approval')
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
            else if (_own && !isFuture)
              FilledButton.icon(
                onPressed: () {
                  Navigator.pop(sheetCtx);
                  _ask(r);
                },
                icon: const Icon(Icons.edit_calendar_outlined),
                label: const Text('Ask for a correction'),
              )
            else if (isFuture)
              const Text('Nothing has happened on this day yet.', style: TextStyle(color: kInk2)),
          ]),
        ),
      ),
    );
  }

  Widget _stat(String label, String value) => Column(children: [
        Text(label, style: const TextStyle(color: kInk2)),
        const SizedBox(height: 2),
        Text(value.isEmpty ? '—' : value, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
      ]);

  Future<void> _ask(RosterDay r) async {
    final made = await showCorrectionSheet(
      context,
      iso: r.iso,
      seedIn: seedFrom(r.inAt),
      seedOut: seedFrom(r.outAt),
    );
    if (!made || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sent for approval ✓')));
    _load();
  }
}
