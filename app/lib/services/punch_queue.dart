import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/offline_punches.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/services/api.dart';

/// The punches kept on this phone while it had no signal, and the sending of
/// them (asked for by HR, 18 November 2026). The rules are
/// `core/offline_punches.dart`; the site's side is `manna_hr/rules.py`.
///
/// **A punch leaves this queue in exactly three ways**: the site took it; the
/// site *refused* it and said why (shown to the person, who can then ask for a
/// correction); or it is too old for the site to believe its time (same).
/// Anything else — no signal, a restart on the site, somebody else signed in —
/// leaves it here to try again. Nothing is ever dropped without a sentence.
///
/// Sends when the app opens, when it comes back to the front, and every thirty
/// seconds while it is open. **Not while the app is closed**: that needs a
/// background service this app does not have, so a punch kept at 8am and never
/// followed by opening the app waits until the app is next opened.
class PunchQueue with WidgetsBindingObserver {
  static final PunchQueue I = PunchQueue._();
  PunchQueue._();

  static const _kPending = 'pendingPunches';
  static const _kProblems = 'unsentPunches';

  /// How many punches are waiting — what the banner and the badge read.
  final ValueNotifier<int> count = ValueNotifier(0);

  /// What could not be sent, one sentence each, until the person has read it.
  final ValueNotifier<List<String>> problems = ValueNotifier(const []);

  /// Bumped on every change to what is kept or being sent — what screens
  /// listen to, since a punch moving from "being sent" to "waiting" changes
  /// no count.
  final ValueNotifier<int> changed = ValueNotifier(0);

  List<PendingPunch> _items = [];
  bool _started = false;

  /// Punches the Punch screen is sending this moment. Kept here first, at the
  /// press, so a phone that dies or an app swiped away mid-send still has
  /// them; left alone by [flush] until the live send says how it went.
  final Set<String> _live = {};

  List<PendingPunch> get items => List.unmodifiable(_items);

  /// How many of [employee]'s punches are waiting — what the banners say.
  /// Somebody else's kept punches on a shared phone are not theirs to see,
  /// and a punch being sent this second is not "waiting".
  int waitingFor(String employee) =>
      _items.where((p) => p.employee == employee && !_live.contains(p.id)).length;

  /// Every change to the kept punches, one after another. A punch kept while
  /// a send is saving, or a screen reading the list back mid-save, must never
  /// write an older list over a newer one — that is a punch lost, or one sent
  /// twice.
  Future<void> _gate = Future.value();

  Future<T> _serial<T>(Future<T> Function() step) {
    // A step is a read or a write of the phone's own storage — milliseconds.
    // One that never finished must not stop every punch after it being kept.
    final run = _gate.timeout(const Duration(seconds: 10), onTimeout: () {}).then((_) => step());
    _gate = run.then((_) {}, onError: (_) {});
    return run;
  }

  Future<void> load() => _serial(_loadNow);

  Future<void> _loadNow() async {
    final p = await SharedPreferences.getInstance();
    _items = decodePending(p.getString(_kPending));
    count.value = _items.length;
    changed.value++;
    try {
      final j = jsonDecode(p.getString(_kProblems) ?? '[]');
      problems.value = j is List ? j.map((e) => '$e').toList() : const [];
    } catch (_) {
      problems.value = const [];
    }
  }

  Future<void> _saveNow() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kPending, encodePending(_items));
    await p.setString(_kProblems, jsonEncode(problems.value));
    count.value = _items.length;
    changed.value++;
  }

  /// Keep a punch. Written down before anything else happens to it.
  Future<void> add(PendingPunch punch) async {
    final photo = await _keepPhoto(punch.photoPath, punch.id);
    final kept = photo == punch.photoPath
        ? punch
        : PendingPunch(
            id: punch.id,
            employee: punch.employee,
            logType: punch.logType,
            time: punch.time,
            latitude: punch.latitude,
            longitude: punch.longitude,
            accuracy: punch.accuracy,
            address: punch.address,
            device: punch.device,
            photoPath: photo,
          );
    await _serial(() async {
      await _loadNow();
      _items = [..._items, kept];
      await _saveNow();
    });
  }

  Future<void> dismissProblems() => _serial(() async {
        problems.value = const [];
        await _saveNow();
      });

  /// Keep [punch] at the press, before the Punch screen sends it live. Until
  /// [finishLive], the queue does not send it itself.
  Future<void> addLive(PendingPunch punch) async {
    _live.add(punch.id);
    try {
      await add(punch);
    } catch (e) {
      _live.remove(punch.id);
      rethrow;
    }
  }

  /// The live send of [id] is over. [remove]: the site took it, or refused it
  /// — either way it is not to be sent again; [problem] is the site's refusal,
  /// listed when the person has already left the screen that would say it.
  /// Otherwise it stays, kept, for the queue to send.
  Future<void> finishLive(String id, {required bool remove, String problem = ''}) async {
    _live.remove(id);
    if (!remove) {
      changed.value++;
      return;
    }
    await _serial(() async {
      final gone = _items.where((x) => x.id == id).toList();
      _items = _items.where((x) => x.id != id).toList();
      for (final p in gone) {
        _forgetPhoto(p);
        if (problem.isNotEmpty) {
          problems.value = [...problems.value, '${_which(p)} was not recorded: $problem'];
        }
      }
      await _saveNow();
    });
  }

  /// Where a kept punch's photo waits. The camera writes into the phone's
  /// cache, which Android empties when storage runs low — and a kept punch can
  /// wait two days for signal.
  static Future<String?> _keepPhoto(String? path, String id) async {
    if (path == null) return null;
    try {
      final base = await getApplicationSupportDirectory();
      final dir = Directory('${base.path}${Platform.pathSeparator}punch_photos');
      await dir.create(recursive: true);
      final copy = await File(path).copy('${dir.path}${Platform.pathSeparator}$id.jpg');
      return copy.path;
    } catch (_) {
      // The camera's own file is still better than none.
      return path;
    }
  }

  /// A kept photo is removed with its punch, so they do not pile up.
  static void _forgetPhoto(PendingPunch p) {
    final path = p.photoPath;
    if (path == null || !path.contains('punch_photos')) return;
    unawaited(File(path).delete().then((_) {}, onError: (_) {}));
  }

  Timer? _timer;

  /// For the tests: stop sending by itself, so a test ends with no timer left,
  /// and forget a send or a save the test's pretend clock left half done.
  @visibleForTesting
  void stop() {
    _timer?.cancel();
    _timer = null;
    if (_started) WidgetsBinding.instance.removeObserver(this);
    _started = false;
    _gate = Future.value();
    _sending = null;
  }

  /// Start sending by itself. Idempotent: called every time a shell opens —
  /// the employee's and HR's, since HR punch too.
  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => unawaited(flush()));
    unawaited(flush());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(flush());
  }

  void _reject(PendingPunch p, String why) {
    _items = _items.where((x) => x.id != p.id).toList();
    _forgetPhoto(p);
    problems.value = [...problems.value, '${_which(p)} was not recorded: $why'];
  }

  /// "IN on 24/11/2026 at 08:30" — the day too, since the note can be read days
  /// later and tells the person to ask for a correction for that day.
  static String _which(PendingPunch p) {
    final d = p.time.length >= 10 ? p.time.substring(0, 10).split('-') : const <String>[];
    final day = d.length == 3 ? '${d[2]}/${d[1]}/${d[0]}' : '';
    return '${p.logType}${day.isEmpty ? '' : ' on $day'} at ${clockOf(p.time)}';
  }

  Future<void> _sentOrThere(PendingPunch p) => _serial(() async {
        _items = _items.where((x) => x.id != p.id).toList();
        _forgetPhoto(p);
        await _saveNow();
      });

  Future<void> _refused(PendingPunch p, String why) => _serial(() async {
        _reject(p, why);
        await _saveNow();
      });

  Future<int>? _sending;

  /// Send what is waiting, oldest first. Returns how many the site took.
  ///
  /// A second call while a send is running gets that send's answer rather
  /// than a 0 that would read as "still no signal".
  Future<int> flush() => _sending ??= _flush().whenComplete(() => _sending = null);

  Future<int> _flush() async {
    var sent = 0;
    await load();
    if (_items.isEmpty) return 0;
    final me = Session.I.employeeId;
    if (me.isEmpty) return 0;

    // After an offline start there is no live session and no token, and a
    // write without one comes back "Invalid Request". Get one first; if the
    // site still cannot be reached, everything simply waits.
    if (Session.I.offlineStart || Session.I.csrfToken.isEmpty) {
      if (!await Api.goOnline()) return 0;
    }

    for (final p in List.of(_items)) {
      // Being sent live from the Punch screen right now.
      if (_live.contains(p.id)) continue;
      // Somebody else signed in on this phone — now, not only when this send
      // began: not theirs to send, and never to be sent as them.
      if (p.employee != me || Session.I.employeeId != p.employee) continue;

      if (tooOldToSend(p, ServerClock.I.now())) {
        await _refused(p, 'it is too old for the site to take its time. Ask for a correction for that day.');
        continue;
      }

      try {
        // The send may have worked and its answer been lost. Look before
        // sending again, or one press becomes two punches.
        if (await Api.punchExists(p.employee, p.time, p.logType)) {
          await _sentOrThere(p);
          sent++;
          continue;
        }

        String? photoUrl;
        final path = p.photoPath;
        if (path != null && await File(path).exists()) {
          var noSignal = false;
          photoUrl = await Api.uploadPunchPhoto(path, onNoSignal: () => noSignal = true);
          // The photo could not get through: keep the punch with its photo for
          // the next try — unless the punch is near the site's age limit, when
          // the punch matters more than its photo.
          if (noSignal && !nearAgeLimit(p, ServerClock.I.now())) break;
        }

        await Api.punch(
          logType: p.logType,
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy: p.accuracy,
          address: p.address,
          photoUrl: photoUrl,
          device: p.device,
          at: p.time,
          queued: true,
          employee: p.employee,
        );
        await _sentOrThere(p);
        sent++;
      } on Refused catch (e) {
        // The site answered no. Its sentence is what the person has to act on —
        // unless it is this phone that has lost track of who is signed in, which
        // is not the site judging the punch: then it waits.
        if (Session.I.employeeId.isEmpty) break;
        await _refused(p, e.message);
      } catch (e) {
        // No signal, or the site failing: stop here and try again later. The
        // rest are newer than this one and must not overtake it.
        break;
      }
    }
    return sent;
  }
}
