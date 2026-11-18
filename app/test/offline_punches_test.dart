import 'dart:io' show SocketException;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:manna_hr_app/core/offline_punches.dart';
import 'package:manna_hr_app/core/punch_rules.dart';

/// Punches kept on the phone while there is no signal (asked for 18 November
/// 2026). The site decides what a kept punch is worth; these are the rules the
/// app keeps so it neither loses one nor sends one the site will not believe.
void main() {
  PendingPunch punch({String time = '2026-11-18 08:02:00', String type = 'IN'}) => PendingPunch(
        id: 'a$time', employee: 'HR-EMP-1', logType: type, time: time,
        latitude: 9.5, longitude: 76.6, accuracy: 12, address: 'Rubber Park', device: 'vivo · Android 13',
        photoPath: '/cache/p.jpg');

  group('a punch kept on the phone', () {
    test('survives being written down and read back', () {
      final back = decodePending(encodePending([punch(), punch(time: '2026-11-18 17:30:00', type: 'OUT')]));
      expect(back.map((p) => '${p.logType} ${p.time}'), ['IN 2026-11-18 08:02:00', 'OUT 2026-11-18 17:30:00']);
      expect(back.first.latitude, 9.5);
      expect(back.first.photoPath, '/cache/p.jpg');
    });

    test('loses nothing else when one entry is damaged', () {
      expect(decodePending('[{"id":"x"}, ${jsonOf(punch())}]'), hasLength(1));
      expect(decodePending('not json'), isEmpty);
      expect(decodePending(null), isEmpty);
    });

    test('is sent as the same device with the queued marker, so the site lets it keep its time', () {
      expect(queuedDeviceId('HR-EMP-1'), '${deviceIdFor('HR-EMP-1')}-Q');
    });
  });

  group('what counts as no signal', () {
    test('is a connection that never reached the site', () {
      for (final t in [DioExceptionType.connectionError, DioExceptionType.connectionTimeout, DioExceptionType.sendTimeout, DioExceptionType.receiveTimeout]) {
        expect(isNetworkFailure(DioException(requestOptions: RequestOptions(path: '/'), type: t)), isTrue, reason: '$t');
      }
      expect(isNetworkFailure(DioException(requestOptions: RequestOptions(path: '/'), type: DioExceptionType.unknown, error: const SocketException('x'))), isTrue);
    });

    test('is the site failing — a 502 while it restarts is kept and tried again', () {
      final ro = RequestOptions(path: '/');
      final bad = DioException.badResponse(statusCode: 502, requestOptions: ro, response: Response(requestOptions: ro, statusCode: 502));
      expect(isNetworkFailure(bad), isTrue);
    });

    test('is not the site answering no — a refused punch is read, never kept', () {
      final ro = RequestOptions(path: '/');
      final refused = DioException.badResponse(statusCode: 417, requestOptions: ro, response: Response(requestOptions: ro, statusCode: 417));
      expect(isNetworkFailure(refused), isFalse);
      expect(isNetworkFailure(StateError('x')), isFalse);
    });
  });

  group('a kept punch that is too old', () {
    final now = DateTime(2026, 11, 18, 14);
    test('is sent while the site will still believe its time', () {
      expect(tooOldToSend(punch(time: '2026-11-18 08:02:00'), now), isFalse);
      expect(tooOldToSend(punch(time: '2026-11-16 14:00:00'), now), isFalse);
    });
    test('is not sent past the limit, so the person asks for a correction instead', () {
      expect(tooOldToSend(punch(time: '2026-11-16 13:59:00'), now), isTrue);
      expect(tooOldToSend(punch(time: 'garbled'), now), isTrue);
    });
  });

  group('the day on screen', () {
    test('counts a waiting punch, so IN once sent offline is not offered again', () {
      final rows = withPending(const [], [punch()], '2026-11-18', 'HR-EMP-1');
      expect(nextLogType(rows), 'OUT');
      expect(rows.single['pending'], true);
    });
    test('leaves out other days and other people', () {
      expect(withPending(const [], [punch(time: '2026-11-17 08:00:00')], '2026-11-18', 'HR-EMP-1'), isEmpty);
      expect(withPending(const [], [punch()], '2026-11-18', 'HR-EMP-2'), isEmpty);
    });
    test('says how many are waiting', () {
      expect(waitingText(1), startsWith('1 punch is saved'));
      expect(waitingText(3), startsWith('3 punches are saved'));
    });
  });
}

String jsonOf(PendingPunch p) => encodePending([p]).replaceAll(RegExp(r'^\[|\]$'), '');
