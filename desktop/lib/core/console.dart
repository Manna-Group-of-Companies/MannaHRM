/// The one thing this program talks to: the bridge's console, on this PC.
///
/// **Every rule is the console's.** It already runs in the background from
/// boot as SYSTEM, holds the key that writes the group's attendance, and calls
/// `employee_tools` and `machine` for every check — the number nobody else
/// holds, the site before the machine, the backup before a delete. This
/// program asks it the same questions its own page asks and draws the answers.
/// A check added here and not there would be a rule that depends on which
/// window somebody opened, so there are none.
///
/// It never talks to a fingerprint machine or to ERPNext itself, which is what
/// keeps pyzk, the API key and the bridge in one place.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// The console said no, and this is its sentence for why.
class Refused implements Exception {
  const Refused(this.why);
  final String why;

  @override
  String toString() => why;
}

typedef Answer = Map<String, dynamic>;

class Console {
  Console(this.token, {this.host = '127.0.0.1', this.port = 8765, HttpClient? client})
      : _http = client ?? HttpClient();

  final String token;
  final String host;
  final int port;
  final HttpClient _http;

  /// One job at a time. Two reads of one ZK at once is two sessions on a
  /// machine that serves one, and the second gets garbage or nothing.
  Future<void> _last = Future.value();

  /// A network scan asks every private address on this PC's networks; that is
  /// minutes, not seconds, and giving up early looks like "no machines".
  static const patience = Duration(minutes: 6);

  Future<Answer> get(String job, [Map<String, String?> args = const {}]) {
    final query = {
      for (final e in args.entries)
        if (e.value != null && e.value!.trim().isNotEmpty) e.key: e.value!.trim(),
    };
    final uri = Uri(scheme: 'http', host: host, port: port, path: '/api/$job', queryParameters: query);
    return _queued(() async => _read(_signed(await _http.getUrl(uri))));
  }

  Future<Answer> post(String job, Map<String, Object?> body) {
    final uri = Uri(scheme: 'http', host: host, port: port, path: '/api/$job');
    return _queued(() async {
      final request = _signed(await _http.postUrl(uri));
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode(body));
      return _read(request);
    });
  }

  Future<Answer> _queued(Future<Answer> Function() job) {
    final done = Completer<Answer>();
    _last = _last.then((_) async {
      try {
        done.complete(await job().timeout(patience));
      } catch (e, trace) {
        done.completeError(e, trace);
      }
    });
    return done.future;
  }

  /// Before anything is written: headers are frozen once a body starts.
  HttpClientRequest _signed(HttpClientRequest request) => request..headers.set('X-Console-Token', token);

  Future<Answer> _read(HttpClientRequest request) async {
    final response = await request.close();
    final text = await utf8.decodeStream(response);
    if (response.statusCode == 403) {
      throw const Refused('The console did not accept this program\'s key. '
          'Run INSTALL.bat again on this PC, then open Manna Attendance again.');
    }
    return decode(response.statusCode, text);
  }

  /// What the console answered, or why it is a refusal.
  static Answer decode(int status, String text) {
    Object? body;
    try {
      body = jsonDecode(text);
    } on FormatException {
      throw Refused('The console answered $status with something that is not an answer.');
    }
    if (body is! Map<String, dynamic>) {
      throw Refused('The console answered $status with something that is not an answer.');
    }
    if (status != 200) throw Refused('${body['why'] ?? 'The console answered $status.'}');
    // The tools refuse with a sentence; that sentence is the answer, except
    // where it asks for the number to be typed again — the caller wants that.
    if (body['ok'] == false && body['confirm'] == null) throw Refused('${body['why'] ?? 'That did not work.'}');
    return body;
  }
}

/// Where the bridge lives on this PC.
///
/// The installer puts this program in `app\` inside the bridge's folder, so
/// the folder above the program is the first guess; `MANNA_BRIDGE_DIR` is for
/// a bridge somewhere else, and `C:\MannaBridge` is the installer's default.
String bridgeFolder({Map<String, String>? env, String? executable, bool Function(String path)? exists}) {
  env ??= Platform.environment;
  exists ??= (path) => File(path).existsSync();
  final named = env['MANNA_BRIDGE_DIR']?.trim() ?? '';
  if (named.isNotEmpty) return named;
  final exe = File(executable ?? Platform.resolvedExecutable);
  final above = exe.parent.parent.path;
  if (exists('$above\\console.py')) return above;
  return r'C:\MannaBridge';
}

const consoleTask = 'Manna HR Console';

/// The console's key, and a console that is up to use it.
///
/// The console's own task starts it at boot; if it is not answering (a PC that
/// has only just come up, or somebody stopped the task) this starts that task
/// rather than a second console, which would fight the first for the port.
Future<Console> connect(String folder) async {
  final file = File('$folder\\console-token.txt');
  String token;
  try {
    token = (await file.readAsString()).trim();
  } on PathNotFoundException {
    throw Refused('No bridge found in $folder. Run INSTALL.bat on this PC first.');
  } on FileSystemException {
    throw const Refused('This needs an administrator: the console\'s key is locked to them. '
        'Right-click Manna Attendance and choose Run as administrator.');
  }
  if (token.isEmpty) throw Refused('The console\'s key in $folder is empty. Run INSTALL.bat again.');

  final console = Console(token);
  if (await serving(console.host, console.port)) return console;

  await Process.run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "Start-ScheduledTask -TaskName '$consoleTask'",
  ]);
  for (var i = 0; i < 20; i++) {
    await Future<void>.delayed(const Duration(seconds: 1));
    if (await serving(console.host, console.port)) return console;
  }
  throw Refused('The console is not running and did not start. Run CONSOLE.bat in $folder to see why.');
}

Future<bool> serving(String host, int port) async {
  try {
    final socket = await Socket.connect(host, port, timeout: const Duration(milliseconds: 500));
    socket.destroy();
    return true;
  } on SocketException {
    return false;
  }
}
