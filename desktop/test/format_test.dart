import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:manna_attendance/core/format.dart';

void main() {
  test('a slow clock reads as slow in minutes and seconds', () {
    expect(driftText(-463), '7m 43s slow');
  });

  test('a fast clock over an hour reads in hours', () {
    expect(driftText(3 * 3600 + 120), '3h 2m fast');
  });

  test('a clock within a few seconds is on time, and no reading is blank', () {
    expect(driftText(3), 'on time');
    expect(driftText(null), '');
  });

  test('the direction is shown as the code the machine sent, never as In or Out', () {
    // A ZK never set up for in/out sends 0 on every punch; "In" would be a lie.
    expect(stateText(0), '0');
    expect(stateText(1), '1');
    expect(stateText(null), '');
  });

  test('search needs every word typed to be in some shown column, in any case', () {
    final rows = [
      {'user_id': '860', 'machine_name': 'Farisamol V S'},
      {'user_id': '912', 'machine_name': 'Chandan Kumar'},
    ];
    const keys = ['user_id', 'machine_name'];
    expect(matching(rows, 'farisamol 860', keys), [rows[0]]);
    expect(matching(rows, 'farisamol 912', keys), isEmpty);
    expect(matching(rows, '  ', keys), rows);
  });

  test('machine numbers sort as numbers, not as text', () {
    final numbers = ['1000', '912', '86']..sort(compareCells);
    expect(numbers, ['86', '912', '1000']);
  });

  test('the export carries a byte-order mark so Excel reads Malayalam names', () {
    final bytes = csvBytes([('user_id', 'Number'), ('name', 'Name')], [
      {'user_id': '860', 'name': 'ഫാരിസമോൾ', 'hidden': 'x'},
      {'user_id': '861', 'name': 'Kumar, "Chandan"'},
    ]);
    expect(bytes.take(3), [0xEF, 0xBB, 0xBF]);
    expect(utf8.decode(bytes.skip(3).toList()),
        'Number,Name\r\n860,ഫാരിസമോൾ\r\n861,"Kumar, ""Chandan"""\r\n');
  });

  test('a day-first date is refused by the name of the box it was typed in', () {
    expect(dateProblem(' 2026-09-01 ', 'From'), isNull);
    expect(dateProblem('01-09-2026', 'From'), contains('From'));
  });

  test('a machine that pushes is not offered where a machine has to be read', () {
    expect(readable([
      {'name': 'BIO-MRP-GATE1', 'host': '192.168.1.201'},
      {'name': 'BIO-PUSH', 'host': ''},
    ]), ['BIO-MRP-GATE1']);
  });

  test('a bridge task that is not there reads as not installed, never as running', () {
    expect(bridgeState('Running').good, isTrue);
    expect(bridgeState('Ready').good, isFalse);
    expect(bridgeState('').text, 'Not installed on this PC');
  });
}
