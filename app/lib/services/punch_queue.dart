import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
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

  List<PendingPunch> _items = [];
  bool _sending = false;
  bool _started = false;

  List<PendingPunch> get items => List.unmodifiable(_items);

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    _items = decodePending(p.getString(_kPending));
    count.value = _items.length;
    try {
      final j = jsonDecode(p.getString(_kProblems) ?? '[]');
      problems.value = j is List ? j.map((e) => '$e').toList() : const [];
    } catch (_) {
      problems.value = const [];
    }
  }

  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kPending, encodePending(_items));
    await p.setString(_kProblems, jsonEncode(problems.value));
    count.value = _items.length;
  }

  /// Keep a punch. Written down before anything else happens to it.
  Future<void> add(PendingPunch punch) async {
    await load();
    _items = [..._items, punch];
    await _save();
  }

  Future<void> dismissProblems() async {
    problems.value = const [];
    await _save();
  }

  Timer? _timer;

  /// For the tests: stop sending by itself, so a test ends with no timer left.
  @visibleForTesting
  void stop() {
    _timer?.cancel();
    _timer = null;
    if (_started) WidgetsBinding.instance.removeObserver(this);
    _started = false;
  }

  /// Start sending by itself. Idempotent: called every time the shell opens.
  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => unawaited(flush()));
    unawaited(load().then((_) => flush()));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(flush());
  }

  void _reject(PendingPunch p, String why) {
    _items = _items.where((x) => x.id != p.id).toList();
    final at = clockOf(p.time);
    problems.value = [...problems.value, '${p.logType} at $at was not recorded: $why'];
  }

  /// Send what is waiting, oldest first. Returns how many the site took.
  Future<int> flush() async {
    if (_sending) return 0;
    _sending = true;
    var sent = 0;
    try {
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
        // Somebody else signed in on this phone: not theirs to send, and the
        // site would refuse it anyway (self-service punches only).
        if (p.employee != me) continue;

        if (tooOldToSend(p, ServerClock.I.now())) {
          _reject(p,
              'it is too old for the site to take its time. Ask for a correction for that day.');
          await _save();
          continue;
        }

        try {
          // The send may have worked and its answer been lost. Look before
          // sending again, or one press becomes two punches.
          if (await Api.punchExists(p.employee, p.time, p.logType)) {
            _items = _items.where((x) => x.id != p.id).toList();
            await _save();
            sent++;
            continue;
          }

          String? photoUrl;
          final path = p.photoPath;
          if (path != null && await File(path).exists()) {
            photoUrl = await Api.uploadPunchPhoto(path);
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
          );
          _items = _items.where((x) => x.id != p.id).toList();
          await _save();
          sent++;
        } on Refused catch (e) {
          // The site answered no. Its sentence is what the person has to act on.
          _reject(p, e.message);
          await _save();
        } catch (e) {
          // No signal, or the site failing: stop here and try again later. The
          // rest are newer than this one and must not overtake it.
          break;
        }
      }
    } finally {
      _sending = false;
    }
    return sent;
  }
}
