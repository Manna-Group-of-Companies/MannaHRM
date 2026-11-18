import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:manna_hr_app/core/offline_punches.dart';
import 'package:manna_hr_app/services/punch_queue.dart';

/// The punches kept on the phone survive the app being closed (asked for 18
/// November 2026): kept before anything else happens to them, and read back.
void main() {
  PendingPunch punch(String id) => PendingPunch(
      id: id, employee: 'HR-EMP-1', logType: 'IN', time: '2026-11-18 08:02:00', latitude: 9.5, longitude: 76.6);

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('a kept punch is still there after the app is opened again', () async {
    await PunchQueue.I.add(punch('1'));
    await PunchQueue.I.add(punch('2'));
    expect(PunchQueue.I.count.value, 2);

    // A fresh start reads the same two back, oldest first.
    await PunchQueue.I.load();
    expect(PunchQueue.I.items.map((p) => p.id), ['1', '2']);
  });

  test('says nothing is waiting when nothing is', () async {
    await PunchQueue.I.load();
    expect(PunchQueue.I.count.value, 0);
    expect(PunchQueue.I.problems.value, isEmpty);
  });

  test('flush with nobody signed in sends nothing and keeps everything', () async {
    await PunchQueue.I.add(punch('1'));
    expect(await PunchQueue.I.flush(), 0);
    expect(PunchQueue.I.items, hasLength(1));
  });
}
