/// Punches kept on the phone while there is no signal, and sent when there is
/// (asked for by HR, 18 November 2026).
///
/// A factory floor, a bus and a basement have no network, and a punch that fails
/// there costs somebody who did turn up their day's pay — the expensive mistake
/// this project rounds against (CLAUDE.md §4). So a punch that cannot reach the
/// site is **kept**, shown as waiting, and sent by itself later.
///
/// Pure: no widgets, no network, no storage — `test/offline_punches_test.dart`.
/// The site decides what a kept punch is worth (`manna_hr/rules.py`
/// `queued_punch_time`); the numbers here mirror it only so the app does not
/// send what the site is going to stamp "now".
library;

import 'dart:convert';
import 'dart:io' show SocketException;

import 'package:dio/dio.dart';

import 'package:manna_hr_app/core/punch_rules.dart';

/// Marks a punch as one that was kept and sent later, on its `device_id`. The
/// site reads it (`rules.QUEUED_DEVICE_SUFFIX`) and lets the punch keep the time
/// it was made instead of the moment it arrived.
const String kQueuedSuffix = '-Q';

/// How old a kept punch may be and still be sent. The site's own limit
/// (`QUEUED_PUNCH_MAX_HOURS`): past it the site would not believe the time, so
/// the person is told to ask for a correction instead.
const int kQueuedMaxHours = 48;

String queuedDeviceId(String employee) => '${deviceIdFor(employee)}$kQueuedSuffix';

/// One punch waiting to be sent.
class PendingPunch {
  const PendingPunch({
    required this.id,
    required this.employee,
    required this.logType,
    required this.time,
    this.latitude,
    this.longitude,
    this.accuracy,
    this.address = '',
    this.device = '',
    this.photoPath,
  });

  /// Unique on this phone, so a retry that half-succeeded can be told apart.
  final String id;
  final String employee;
  final String logType;

  /// `YYYY-MM-DD HH:MM:SS` — when it was made, by the site's clock as this app
  /// last knew it (`ServerClock`), not the phone's own.
  final String time;
  final double? latitude;
  final double? longitude;
  final double? accuracy;
  final String address;
  final String device;

  /// The photo on the phone, uploaded when the punch is sent.
  final String? photoPath;

  Map<String, dynamic> toJson() => {
        'id': id,
        'employee': employee,
        'logType': logType,
        'time': time,
        'latitude': latitude,
        'longitude': longitude,
        'accuracy': accuracy,
        'address': address,
        'device': device,
        'photoPath': photoPath,
      };

  static PendingPunch? fromJson(Object? j) {
    if (j is! Map) return null;
    final id = '${j['id'] ?? ''}';
    final time = '${j['time'] ?? ''}';
    if (id.isEmpty || time.isEmpty || '${j['employee'] ?? ''}'.isEmpty) return null;
    double? d(Object? v) => v is num ? v.toDouble() : null;
    return PendingPunch(
      id: id,
      employee: '${j['employee']}',
      logType: '${j['logType'] ?? kLogIn}',
      time: time,
      latitude: d(j['latitude']),
      longitude: d(j['longitude']),
      accuracy: d(j['accuracy']),
      address: '${j['address'] ?? ''}',
      device: '${j['device'] ?? ''}',
      photoPath: j['photoPath'] is String && (j['photoPath'] as String).isNotEmpty ? j['photoPath'] as String : null,
    );
  }
}

/// The queue as the text kept on the phone. A damaged entry is dropped rather
/// than stopping every other punch behind it.
String encodePending(List<PendingPunch> list) => jsonEncode(list.map((p) => p.toJson()).toList());

List<PendingPunch> decodePending(String? text) {
  if (text == null || text.isEmpty) return const [];
  try {
    final raw = jsonDecode(text);
    if (raw is! List) return const [];
    return raw.map(PendingPunch.fromJson).whereType<PendingPunch>().toList();
  } catch (_) {
    return const [];
  }
}

/// Whether an error is "could not reach the site" — the only kind of failure a
/// kept punch is for. **A refusal is not this**: the site answered, and its
/// answer (too far from the gate, outside the working window) is what the
/// person has to read. Keeping a refused punch would send it again and again.
bool isNetworkFailure(Object error) {
  if (error is SocketException) return true;
  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return true;
      case DioExceptionType.unknown:
        return error.error is SocketException;
      case DioExceptionType.badResponse:
        // The site answered with a server fault (502 while it restarts). Not a
        // refusal of the punch: nothing judged it, so it waits and is retried.
        return (error.response?.statusCode ?? 0) >= 500;
      default:
        return false;
    }
  }
  return false;
}

/// Whether a kept punch is too old for the site to believe its time.
bool tooOldToSend(PendingPunch p, DateTime now) {
  final made = DateTime.tryParse(p.time.replaceFirst(' ', 'T'));
  if (made == null) return true;
  return now.difference(made) > const Duration(hours: kQueuedMaxHours);
}

/// A day's punches with the waiting ones added, as the rows the punch screen
/// reads. Which way the next button points — [nextLogType] — has to count a
/// punch that has not been sent yet, or somebody who punched IN with no signal
/// is offered IN again. Each waiting row says so (`pending`).
List<Map<String, dynamic>> withPending(
  List<Map<String, dynamic>> punches,
  List<PendingPunch> pending,
  String iso,
  String employee,
) {
  final mine = pending.where((p) => p.employee == employee && p.time.startsWith(iso));
  return [
    ...punches,
    for (final p in mine) {'employee': p.employee, 'time': p.time, 'log_type': p.logType, 'pending': true},
  ];
}

/// What the banner says about the punches waiting.
String waitingText(int n) => n == 1
    ? '1 punch is saved on this phone and will be sent when you are online.'
    : '$n punches are saved on this phone and will be sent when you are online.';
