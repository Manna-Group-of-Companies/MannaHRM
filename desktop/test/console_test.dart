import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:manna_attendance/core/console.dart';

/// A console on a spare port, answering what each test says it should.
Future<(HttpServer, List<HttpRequest>)> fakeConsole(FutureOr<(int, Object)> Function(HttpRequest r) answer) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  final seen = <HttpRequest>[];
  server.listen((r) async {
    seen.add(r);
    final (status, body) = await answer(r);
    r.response.statusCode = status;
    r.response.write(body is String ? body : jsonEncode(body));
    await r.response.close();
  });
  return (server, seen);
}

void main() {
  test('every request carries the console key', () async {
    final (server, seen) = await fakeConsole((r) => (200, {'machines': []}));
    await Console('k3y', port: server.port).get('machines');
    expect(seen.single.headers.value('X-Console-Token'), 'k3y');
    await server.close(force: true);
  });

  test('a refusal from the tools becomes the sentence they said', () async {
    final (server, _) = await fakeConsole((r) => (200, {'ok': false, 'why': 'Pick the machine first.'}));
    await expectLater(Console('k', port: server.port).get('people'),
        throwsA(isA<Refused>().having((e) => e.why, 'why', 'Pick the machine first.')));
    await server.close(force: true);
  });

  test('the question before a delete is an answer, not a refusal', () async {
    final (server, _) = await fakeConsole((r) => (200, {'ok': false, 'confirm': '860', 'why': '860 is Farisamol.'}));
    final a = await Console('k', port: server.port).post('delete-user', {'user_id': '860'});
    expect(a['confirm'], '860');
    await server.close(force: true);
  });

  test('a key the console does not accept says to reinstall rather than showing its page', () async {
    final (server, _) = await fakeConsole((r) => (403, '<h3>Open this from the icon.</h3>'));
    await expectLater(Console('wrong', port: server.port).get('machines'),
        throwsA(isA<Refused>().having((e) => e.why, 'why', contains('INSTALL.bat'))));
    await server.close(force: true);
  });

  test('blank arguments are left out of the question', () async {
    final (server, seen) = await fakeConsole((r) => (200, {'rows': []}));
    await Console('k', port: server.port).get('punches', {'device': 'BIO-1', 'user_id': '  ', 'since': null});
    expect(seen.single.uri.queryParameters, {'device': 'BIO-1'});
    await server.close(force: true);
  });

  test('one job at a time, so a machine is never asked twice at once', () async {
    var open = 0;
    var most = 0;
    final (server, _) = await fakeConsole((r) async {
      most = ++open > most ? open : most;
      await Future<void>.delayed(const Duration(milliseconds: 60));
      open--;
      return (200, {'ok': true});
    });
    final console = Console('k', port: server.port);
    await Future.wait([console.get('people'), console.get('punches'), console.post('backup', {})]);
    expect(most, 1);
    await server.close(force: true);
  });

  test('the bridge is found in the folder above the program when installed beside it', () {
    expect(
      bridgeFolder(env: {}, executable: r'D:\Bridge\app\manna_attendance.exe', exists: (p) => p == r'D:\Bridge\console.py'),
      r'D:\Bridge',
    );
  });

  test('a named bridge folder wins, and the installer default is the last guess', () {
    expect(bridgeFolder(env: {'MANNA_BRIDGE_DIR': r'E:\B'}, executable: r'C:\x\y.exe', exists: (_) => true), r'E:\B');
    expect(bridgeFolder(env: {}, executable: r'C:\x\y.exe', exists: (_) => false), r'C:\MannaBridge');
  });
}
