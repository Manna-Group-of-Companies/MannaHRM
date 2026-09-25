/// What a grid shows and exports. Pure, so it is tested without a window.
library;

import 'dart:convert';

typedef Rec = Map<String, dynamic>;

List<Rec> rowsOf(Object? value) =>
    value is List ? [for (final r in value) if (r is Map) Map<String, dynamic>.from(r)] : <Rec>[];

String cell(Object? value) {
  if (value == null) return '';
  if (value is bool) return value ? 'Yes' : 'No';
  return '$value';
}

/// A machine's clock against the site's, the way somebody at a gate says it.
String driftText(Object? seconds) {
  if (seconds is! num) return '';
  final s = seconds.round();
  final size = s.abs();
  final way = s > 0 ? 'fast' : 'slow';
  if (size < 5) return 'on time';
  if (size < 60) return '${size}s $way';
  final hours = size ~/ 3600;
  final minutes = (size % 3600) ~/ 60;
  return hours > 0 ? '${hours}h ${minutes}m $way' : '${minutes}m ${size % 60}s $way';
}

/// What the machine said about direction, as it said it.
///
/// Not "In" and "Out": a ZK never set up for in/out reports 0 on every punch,
/// the code for a check-in, and a grid reading "In" all day would be a
/// confident lie about a day on which people certainly left.
String stateText(Object? punch) => punch == null ? '' : '$punch';

/// The rows where the shown columns hold every word typed, in any case.
List<Rec> matching(List<Rec> rows, String text, List<String> keys) {
  final words = text.toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
  if (words.isEmpty) return List.of(rows);
  return [
    for (final row in rows)
      if (words.every(keys.map((k) => cell(row[k])).join(' ').toLowerCase().contains)) row,
  ];
}

/// Numbers as numbers — machine numbers are text on the wire, and 912 sorting
/// after 1000 is not what anybody reading the grid expects.
int compareCells(Object? a, Object? b) {
  final x = num.tryParse(cell(a));
  final y = num.tryParse(cell(b));
  if (x != null && y != null) return x.compareTo(y);
  if (x != null) return -1;
  if (y != null) return 1;
  return cell(a).toLowerCase().compareTo(cell(b).toLowerCase());
}

String _csvField(String value) =>
    RegExp(r'[",\r\n]').hasMatch(value) ? '"${value.replaceAll('"', '""')}"' : value;

/// The grid as shown, as bytes Excel opens.
///
/// With a byte-order mark, because without one Excel reads UTF-8 as the local
/// code page and every Malayalam name in the file turns into noise.
List<int> csvBytes(List<(String key, String label)> columns, List<Rec> rows) {
  final lines = [
    columns.map((c) => _csvField(c.$2)).join(','),
    for (final row in rows) columns.map((c) => _csvField(cell(row[c.$1]))).join(','),
  ];
  return [0xEF, 0xBB, 0xBF, ...utf8.encode('${lines.join('\r\n')}\r\n')];
}

/// A date the console will read, or the reason it will not.
String? dateProblem(String text, String label) {
  final t = text.trim();
  final ok = RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(t) && DateTime.tryParse(t) != null;
  return ok ? null : '$label has to be a date like 2026-09-01.';
}

String ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// The machines this PC can read. One that pushes (ADMS) has no address to ask.
List<String> readable(List<Rec> machines) => [
      for (final m in machines)
        if (cell(m['host']).isNotEmpty) cell(m['name']),
    ];

/// What the Bridge screen says about the task, in words.
({String text, bool good}) bridgeState(String state) => switch (state) {
      'Running' => (text: 'Running', good: true),
      'Ready' => (text: 'Stopped — punches are not being read', good: false),
      'Disabled' => (text: 'Disabled — punches are not being read', good: false),
      '' => (text: 'Not installed on this PC', good: false),
      _ => (text: state, good: false),
    };
