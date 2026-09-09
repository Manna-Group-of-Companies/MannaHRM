/// Turning a failure into something somebody standing at a gate can act on.
///
/// A trimmed port of the field-sales app's `core/errors.dart`. Every screen
/// there used to end its catch block with `'Failed: $e'`, which put
/// `DioException [connection error]: SocketException: Failed host lookup` in
/// front of a rep in a tyre shop. That answers none of the three questions they
/// actually have: wait, retry, or ring the office.
///
/// **The site's own words win.** `manna_hr/checkin.py` refuses a punch with a
/// sentence that names the distance and the gate — "You are 1.4 km from
/// Keezhillam. Punch when you reach it, or request a regularization if you are
/// working elsewhere today." Replacing that with "Punch failed" throws away the
/// only part that told anybody what to do.
library;

import 'dart:convert';

import 'package:dio/dio.dart';

/// True when the failure is the network rather than the request — the
/// distinction that decides whether retrying the same thing is worth anything.
bool isOffline(Object? e) {
  if (e is! DioException) return false;
  switch (e.type) {
    case DioExceptionType.connectionError:
    case DioExceptionType.connectionTimeout:
      return true;
    case DioExceptionType.unknown:
      return '${e.error}'.contains('SocketException') ||
          '${e.error}'.contains('Failed host lookup');
    default:
      return false;
  }
}

/// A refusal this app raised itself, already written for the person reading it.
class Refused implements Exception {
  const Refused(this.message, {this.regularizeDate});

  final String message;

  /// Set when the only way forward is a correction for that day, so the caller
  /// can offer the shortcut rather than leaving somebody to find it.
  final String? regularizeDate;

  @override
  String toString() => message;
}

/// One sentence, fit to show somebody at a gate.
String humanError(Object? e) {
  if (e == null) return 'Something went wrong.';
  if (e is Refused) return e.message;

  if (e is! DioException) {
    final s = _clean('$e');
    return s.isEmpty ? 'Something went wrong.' : s;
  }

  switch (e.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.transformTimeout:
      return 'The site took too long to answer. Check your signal and try again.';
    case DioExceptionType.connectionError:
      return 'No connection. Try again once you have signal — nothing has been '
          'recorded yet, so punch again rather than assuming it went through.';
    case DioExceptionType.badCertificate:
      return 'Could not verify the site. If you are on a public or hotel '
          'network, try mobile data.';
    case DioExceptionType.cancel:
      return 'Cancelled.';
    case DioExceptionType.unknown:
      if (isOffline(e)) {
        return 'No connection. Try again once you have signal — nothing has '
            'been recorded yet, so punch again rather than assuming it went '
            'through.';
      }
      return 'Something went wrong. Try again.';
    case DioExceptionType.badResponse:
      return _fromResponse(e.response);
  }
}

String _fromResponse(Response? r) {
  final status = r?.statusCode ?? 0;
  final backend = frappeMessage(r?.data);

  switch (status) {
    case 401:
      return 'Your session has expired. Sign in again.';
    case 403:
      // Frappe uses 403 both for a dead session and a genuine denial, and its
      // own message is the only thing that tells them apart.
      return backend ?? 'You are not allowed to do that. Ask HR.';
    case 404:
      return backend ?? 'That record is not there any more.';
    case 409:
    case 417:
      // 417 is Frappe's validation refusal, which is where every rule in
      // `manna_hr/checkin.py` comes out. Its message is the whole point.
      return backend ?? 'The site refused it. Check the day and try again.';
    case 429:
      return 'Too many requests at once. Wait a moment and try again.';
  }

  if (status >= 500) {
    return 'The site is having trouble. Try again in a few minutes, and tell '
        'the office if it keeps happening.';
  }
  return backend ?? 'Something went wrong. Try again.';
}

/// Digs the human part out of a Frappe error body.
///
/// Frappe answers in several shapes depending on how the error was raised:
/// `_server_messages` is a JSON string holding a JSON array of JSON objects,
/// `exception` is a Python traceback line, and `message` is sometimes plain
/// text and sometimes a nested map. All of them are tried.
String? frappeMessage(dynamic body) {
  if (body == null) return null;

  if (body is String) {
    final s = _clean(body);
    return s.isEmpty ? null : s;
  }

  if (body is Map) {
    final server = body['_server_messages'];
    if (server is String && server.isNotEmpty) {
      try {
        final list = jsonDecode(server);
        if (list is List && list.isNotEmpty) {
          final parts = <String>[];
          for (final item in list) {
            final decoded = item is String ? _tryDecode(item) : item;
            final msg = decoded is Map ? decoded['message'] : decoded;
            final s = _clean('${msg ?? ''}');
            if (s.isNotEmpty) parts.add(s);
          }
          if (parts.isNotEmpty) return parts.join('\n');
        }
      } catch (_) {
        // Malformed — fall through to the other fields.
      }
    }

    for (final key in ['_error_message', 'message', 'exception', 'exc_type']) {
      final v = body[key];
      if (v is Map) {
        final s = _clean('${v['message'] ?? ''}');
        if (s.isNotEmpty) return s;
      }
      if (v != null && v is! Map) {
        final s = _clean('$v');
        if (s.isNotEmpty) return s;
      }
    }
  }
  return null;
}

dynamic _tryDecode(String s) {
  try {
    return jsonDecode(s);
  } catch (_) {
    return s;
  }
}

/// Strips the machinery out of a backend message: the Python exception path,
/// the HTML Frappe wraps messages in, and the Dio prefix.
String _clean(String raw) {
  var s = raw.trim();

  s = s.replaceFirst(RegExp(r'^DioException\s*\[[^\]]*\]:\s*'), '');
  s = s.replaceFirst(RegExp(r'^Exception:\s*'), '');
  s = s.replaceFirst(RegExp(r'^[\w.]*(?:Error|Exception)\s*:\s*', multiLine: true), '');

  s = s.replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), ' ');
  s = s.replaceAll(RegExp(r'<[^>]+>'), '');
  s = s
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'");
  s = s.replaceAll(RegExp(r'\s+'), ' ').trim();

  // A traceback is not a message. Better to say nothing and let the caller fall
  // back to something generic.
  if (s.startsWith('Traceback') || s.contains('  File "')) return '';
  if (s == 'Internal Server Error' || s == 'None') return '';

  if (s.length > 300) s = '${s.substring(0, 297)}...';
  return s;
}
