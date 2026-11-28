import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart' show Geolocator;

import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/offline_punches.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/screens/calendar_screen.dart';
import 'package:manna_hr_app/screens/correction_sheet.dart';
import 'package:manna_hr_app/screens/punch_parts.dart';
import 'package:manna_hr_app/services/address.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/services/device.dart';
import 'package:manna_hr_app/services/location.dart';
import 'package:manna_hr_app/services/photo.dart';
import 'package:manna_hr_app/services/punch_queue.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// A fix this young is used as it is at the press; an older one is asked for
/// again, so the punch says where the person is, not where they opened the
/// screen.
const Duration kFixFresh = Duration(seconds: 45);

/// While the screen stays open the dot on the map is kept current this often.
const Duration kFixRefresh = Duration(seconds: 30);

/// A fix this old is still carried, with a note, when a new one cannot be had.
const Duration kFixUsable = Duration(minutes: 5);

/// How long a press waits for the site before saying the punch is saved on
/// the phone. The punch is already kept by then; the send goes on behind.
const Duration kLiveLimit = Duration(seconds: 25);

enum _LiveKind { sent, kept, slow, refused }

/// How a live send went.
class _Live {
  const _Live(this.kind, {this.message = '', this.photoUrl});

  final _LiveKind kind;
  final String message;
  final String? photoUrl;
}

/// Punch in, punch out — one screen for both (27 November 2026, from the
/// screen HR showed): the time big, the face live off the front camera, a map
/// of where the person stands, the street, and one wide button. The photo is
/// taken at the press.
///
/// Which way the button goes is read off the day's own punches — see
/// [nextLogType] — rather than kept as a flag, because a flag on a phone and a
/// row on the site disagree the first time somebody punches at a fingerprint
/// machine and then opens this.
class PunchScreen extends StatefulWidget {
  const PunchScreen({super.key, this.direction});

  /// `IN` or `OUT` when the person pressed one of the two buttons on a home
  /// screen — their word for which way this punch goes, as the key on a gate
  /// machine is. Left out, it is read off the day's punches.
  final String? direction;

  @override
  State<PunchScreen> createState() => _PunchScreenState();
}

class _PunchScreenState extends State<PunchScreen> with WidgetsBindingObserver {
  final _camera = SelfieCamera();

  /// The site's time, moved every second. Only the clock listens: the camera
  /// and the map are not drawn again sixty times a minute.
  final _clock = ValueNotifier<DateTime>(ServerClock.I.now());
  List<Map<String, dynamic>> _today = const [];
  bool _loading = true;
  bool _busy = false;
  String _error = '';
  Timer? _tick;

  /// The last fix with a place in it, kept on the map while a refresh fails;
  /// or the first answer, place or not, before any.
  Fix? _fix;
  DateTime? _fixAt;
  Future<Fix>? _finding;

  /// The street at [_fix], or empty while it is not known.
  String _address = '';

  /// The app went to the background (not only a permission question over it).
  bool _hidden = false;

  /// Punch History is open over this screen: the camera stays off.
  bool _historyOpen = false;

  /// How many punches were kept when last looked — fewer means one went to
  /// the site, and the day is read again.
  int _seenCount = 0;

  /// The day [_today] was read for. The screen stays open across midnight on a
  /// night shift, and without this the button would go on offering a punch-out
  /// against yesterday's punch-in.
  String _loadedFor = '';

  /// The day a read was last *attempted* for. Separate from [_loadedFor] so a
  /// read that fails at midnight — no signal on the night bus — is tried once
  /// rather than once a second for as long as the screen is open.
  String _triedFor = '';

  String get _iso => isoDay(ServerClock.I.now());

  /// The day as the site holds it plus the punches kept on this phone and not
  /// sent yet. Which way the button points has to count a waiting punch, or
  /// somebody who punched IN with no signal is offered IN again.
  List<Map<String, dynamic>> get _shown => withPending(_today, PunchQueue.I.items, _iso, Session.I.employeeId);

  String get _next => widget.direction ?? nextLogType(_shown);

  void _onQueue() {
    if (!mounted) return;
    final n = PunchQueue.I.count.value;
    final fewer = n < _seenCount;
    _seenCount = n;
    setState(() {});
    // A kept punch has gone to the site: read the day again, or its row
    // vanishes from today's list until somebody pulls down.
    if (fewer && !_busy && !_loading) unawaited(_load());
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _seenCount = PunchQueue.I.count.value;
    PunchQueue.I.changed.addListener(_onQueue);
    PunchQueue.I.problems.addListener(_onQueue);
    unawaited(PunchQueue.I.load().then((_) => _onQueue(), onError: (_) {}));
    unawaited(_load());
    // The camera first, then the GPS: Android asks one permission question at
    // a time, and a second asked while the first is up is simply dropped.
    unawaited(
      _camera.start().whenComplete(() {
        if (mounted) unawaited(_locate());
      }),
    );
    // The clock on screen is the site's, so it has to move. One second is the
    // resolution somebody watching a punch land expects.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      _clock.value = ServerClock.I.now();
      final day = _iso;
      if (_loadedFor.isNotEmpty && _loadedFor != day && _triedFor != day && !_loading && !_busy) {
        unawaited(_load());
      }
      // Keep the dot current — only while there is one: a phone refusing the
      // permission would otherwise be asked again every half minute.
      final at = _fixAt;
      if (!_busy &&
          _finding == null &&
          (_fix?.has ?? false) &&
          at != null &&
          DateTime.now().difference(at) > kFixRefresh) {
        unawaited(_locate());
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    PunchQueue.I.changed.removeListener(_onQueue);
    PunchQueue.I.problems.removeListener(_onQueue);
    _tick?.cancel();
    _clock.dispose();
    _camera.dispose();
    super.dispose();
  }

  /// Said out loud because it is a real failure on these phones: one running
  /// eight minutes fast makes its owner look late. The punch is stamped by the
  /// site either way.
  String _driftNote() {
    final skew = ServerClock.I.skew;
    if (skew.abs() <= const Duration(minutes: 1)) return '';
    return 'This phone is ${skew.inMinutes.abs()} min ${skew.isNegative ? 'ahead of' : 'behind'} the site. '
        'Your punch is stamped by the site, not by the phone.';
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
        // Android takes the camera from an app that is not in front.
        _hidden = true;
        unawaited(_camera.stop());
      case AppLifecycleState.resumed:
        // Only back from the background. Closing a permission question also
        // "resumes" the app, and asking again at once is asking twice.
        if (!_hidden) return;
        _hidden = false;
        if (!_historyOpen) unawaited(_camera.start());
        // Back from Android's settings, maybe with GPS or the permission on.
        if (_finding == null) unawaited(_locate());
      default:
        break;
    }
  }

  Future<void> _load() async {
    setState(() => _error = '');
    final day = _iso;
    _triedFor = day;
    // A new day starts empty rather than carrying yesterday's punches forward
    // until the read lands. Which way the button points is read off this list,
    // and yesterday's IN would offer a punch-OUT to somebody arriving for work;
    // an empty list offers IN, the punch that cannot make a day worse.
    if (_loadedFor.isNotEmpty && _loadedFor != day) _today = const [];
    try {
      if (Session.I.employee == null) await Api.resolveEmployee();
      final punches = await Api.punchesOn(day);
      if (!mounted) return;
      setState(() {
        _today = punches;
        _loadedFor = day;
      });
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _refresh() async {
    await Future.wait([_load(), _locate()]);
  }

  /// Where the phone is. Asked when the screen opens and again while it stays
  /// open, so the map shows it and the press does not wait on the GPS. One at a
  /// time: a press during a lookup waits for that one.
  Future<Fix> _locate() => _finding ??= _findNow().whenComplete(() {
    _finding = null;
    if (mounted) setState(() {});
  });

  Future<Fix> _findNow() async {
    if (mounted) setState(() {});
    final f = await currentFix(); // never throws
    if (!mounted) return f;
    final had = _fix;
    // A refresh that found nothing does not wipe a good fix off the map.
    if (f.has || had == null || !had.has) {
      final moved =
          !f.has ||
          had == null ||
          !had.has ||
          Geolocator.distanceBetween(had.latitude!, had.longitude!, f.latitude!, f.longitude!) > 30;
      setState(() {
        _fix = f;
        _fixAt = DateTime.now();
        if (moved) _address = '';
      });
      if (f.has && _address.isEmpty) unawaited(_lookUpAddress(f));
    }
    return f;
  }

  Future<void> _lookUpAddress(Fix f) async {
    final a = await addressAt(f.latitude, f.longitude); // never throws
    if (!mounted || a.isEmpty || !identical(_fix, f)) return;
    setState(() => _address = a);
  }

  /// The fix the punch carries: the screen's own when it is fresh, else a new
  /// one, else — when a new one cannot be had — the last place this phone was
  /// seen a few minutes ago, said as such.
  Future<Fix> _fixForPunch() async {
    final had = _fix;
    final at = _fixAt;
    final age = at == null ? null : DateTime.now().difference(at);
    if (had != null && had.has && had.problem.isEmpty && age != null && age < kFixFresh) return had;
    final now = await _locate();
    if (now.has) return now;
    if (had != null && had.has && age != null && age < kFixUsable) {
      return Fix(
        latitude: had.latitude,
        longitude: had.longitude,
        accuracy: had.accuracy,
        problem:
            'No fresh fix, so the punch carries where this phone was ${age.inMinutes < 1 ? 'a moment' : '${age.inMinutes} min'} ago.',
      );
    }
    return now;
  }

  Future<String> _addressFor(Fix fix) async {
    if (!fix.has) return '';
    final kept = _fix;
    if (_address.isNotEmpty &&
        kept != null &&
        kept.has &&
        Geolocator.distanceBetween(kept.latitude!, kept.longitude!, fix.latitude!, fix.longitude!) <= 30) {
      return _address;
    }
    return addressAt(fix.latitude, fix.longitude);
  }

  void _say(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m), duration: const Duration(seconds: 4)));

  Future<void> _punch() async {
    if (_busy) return;
    final direction = _next;
    // When it was pressed, fixed now: a punch kept for later must say 08:02,
    // not the moment the photo finished uploading or the signal came back.
    final pressed = ServerClock.I.now();

    // The working window is the site's to judge, on its own clock and its own
    // settings: a copy of it here refused punches the site would take (HR
    // opening punching at 04:00 for a night shift leaving at 04:30). A punch
    // outside it is sent, or kept, and the site's own sentence is what is
    // shown.

    setState(() {
      _busy = true;
      _error = '';
    });
    // Set once the punch is kept on the phone: from then on, whatever goes
    // wrong, it is not "not recorded" — it waits for the queue.
    String? keptId;
    try {
      // The photo at the press, off the live front camera. Never stops the
      // punch: a phone that cannot take one sends it without, and says so.
      final snap = await _camera.take();
      final madeAt = stampOf(pressed);

      // The fix is asked for and never insisted on. A punch with no coordinate
      // is recorded or refused by the *site*, under HR's own
      // `require_location_for_mobile` setting — refusing it here would be this
      // app deciding somebody's pay, which is exactly what it must not do.
      final fix = await _fixForPunch();
      final got = await Future.wait<Object?>([
        _addressFor(fix).timeout(const Duration(seconds: 3), onTimeout: () => ''),
        deviceText(),
      ]);
      final address = got[0] as String;
      final device = got[1] as String;

      final pending = PendingPunch(
        id: '${DateTime.now().microsecondsSinceEpoch}',
        employee: Session.I.employeeId,
        logType: direction,
        time: madeAt,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        address: address,
        device: device,
        photoPath: snap.path,
      );
      // Kept first, before anything is sent: a phone that dies, or an app
      // swiped away, in the middle of the send still has the punch, and the
      // queue sends it later — or finds it already on the site and does not
      // send it twice (Api.punchExists).
      await PunchQueue.I.addLive(pending);
      keptId = pending.id;

      var gaveUp = false;
      final outcome = await _sendLive(pending, snap, () => gaveUp).timeout(
        kLiveLimit,
        onTimeout: () {
          gaveUp = true;
          return const _Live(_LiveKind.slow);
        },
      );
      if (!mounted) return;
      final where = address.isNotEmpty ? address : (fix.has ? 'Location saved' : fix.problem);
      switch (outcome.kind) {
        case _LiveKind.sent:
          final now = ServerClock.I.now();
          final photoNote = outcome.photoUrl != null
              ? ''
              : snap.problem.isNotEmpty
              ? snap.problem
              : 'The photo did not upload, so HR will see this punch without one.';
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (_) => PunchDoneScreen(
                direction: direction,
                at: clockOf(stampOf(now)),
                iso: isoDay(now),
                where: address.isNotEmpty ? address : (fix.has ? 'Location sent' : fix.problem),
                note: photoNote,
              ),
            ),
          );
        case _LiveKind.kept:
        case _LiveKind.slow:
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (_) => PunchDoneScreen(
                direction: direction,
                at: clockOf(madeAt),
                iso: madeAt.substring(0, 10),
                where: where,
                kept: true,
                note: outcome.kind == _LiveKind.slow
                    ? 'The signal is weak, so this punch is saved on this phone. It is sent by itself, '
                          'with the time you pressed.'
                    : 'No signal, so this punch is saved on this phone. It is sent by itself '
                          'when you are online, with the time you pressed.',
              ),
            ),
          );
        case _LiveKind.refused:
          await _refusedWithCorrection(outcome.message);
      }
    } catch (e) {
      final kept = keptId;
      if (kept != null) {
        // Already on the phone: handed to the queue, never dropped, never "not
        // recorded".
        await PunchQueue.I.finishLive(kept, remove: false);
        if (mounted) _say('This punch is saved on this phone and is sent by itself.');
        return;
      }
      if (!mounted) return;
      await _refusedWithCorrection(humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// The live send of a punch already kept on the phone: its photo, then the
  /// punch. Tells the queue how it went — sent, or refused by the site (both
  /// leave the queue), or no signal (it stays, for the queue to send).
  /// [gaveUp]: the screen stopped waiting; a refusal is then listed for the
  /// person to read the next time, since nobody is looking at this screen.
  Future<_Live> _sendLive(PendingPunch p, Snap snap, bool Function() gaveUp) async {
    var photoNoSignal = false;
    String? photoUrl;
    final path = snap.path;
    if (path != null) {
      photoUrl = await Api.uploadPunchPhoto(path, onNoSignal: () => photoNoSignal = true);
    }
    // The photo could not reach the site, so neither can the punch: it stays
    // kept, photo and all, rather than making somebody wait out a second
    // time-out at a gate.
    if (photoNoSignal) {
      await PunchQueue.I.finishLive(p.id, remove: false);
      return const _Live(_LiveKind.kept);
    }
    try {
      await Api.punch(
        logType: p.logType,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: p.accuracy,
        address: p.address,
        photoUrl: photoUrl,
        device: p.device,
        employee: p.employee,
      );
    } catch (e) {
      // Only "could not reach the site" is kept — or a password that stopped
      // working, which is sent once the person has signed in again. A refusal
      // is the site's answer, and its sentence is what the person has to read.
      if (isNetworkFailure(e) || Session.I.signInAgain.value) {
        await PunchQueue.I.finishLive(p.id, remove: false);
        return const _Live(_LiveKind.kept);
      }
      final why = humanError(e);
      await PunchQueue.I.finishLive(p.id, remove: true, problem: gaveUp() ? why : '');
      return _Live(_LiveKind.refused, message: why);
    }
    await PunchQueue.I.finishLive(p.id, remove: true);
    // Online evidently: send anything that was waiting from before.
    unawaited(PunchQueue.I.flush());
    return _Live(_LiveKind.sent, photoUrl: photoUrl);
  }

  /// A punch that did not happen, and the one thing that can still be done
  /// about it.
  ///
  /// Every refusal on this path — too early, too late, too far from the gate,
  /// no location — leaves somebody who did turn up with no record of it. The
  /// answer the site's own messages point at is a correction, so the offer is
  /// made here rather than left to be found.
  Future<void> _refusedWithCorrection(String message) async {
    if (!mounted) return;
    setState(() => _error = message);
    final take = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Not recorded'),
        content: Text('$message\n\nAsk for a correction for today instead?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not now')),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Ask for a correction'),
          ),
        ],
      ),
    );
    if (take != true || !mounted) return;
    final pair = dayPunches(_shown);
    final made = await showCorrectionSheet(
      context,
      iso: _iso,
      seedIn: seedFrom(pair.inAt),
      seedOut: seedFrom(pair.outAt),
      note: message,
    );
    if (made && mounted) _say('Sent for approval ✓');
  }

  /// The month, from the bar's Punch History. The camera is let go while it is
  /// open and taken back after.
  Future<void> _history() async {
    _historyOpen = true;
    unawaited(_camera.stop());
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CalendarScreen()));
    _historyOpen = false;
    if (!mounted) return;
    unawaited(_camera.start());
  }

  /// What the line under the map says: the street, or what is known instead.
  String _placeText() {
    final fix = _fix;
    if (fix == null) return _finding != null ? 'Finding where you are…' : 'Your location is taken when you punch.';
    if (!fix.has) return fix.problem;
    final coarse = fix.isCoarse ? ' · good to about ${fix.accuracy!.round()} m' : '';
    if (_address.isNotEmpty) return '$_address$coarse';
    return fix.problem.isEmpty ? 'Location found$coarse' : '${fix.problem}$coarse';
  }

  @override
  Widget build(BuildContext context) {
    final isIn = _next == kLogIn;
    final word = isIn ? 'Punch In' : 'Punch Out';
    final linked = Session.I.employee != null;
    // The day's read only decides which way the button points. Pressed from a
    // home screen's Punch In or Punch Out it is already decided, so the punch
    // never waits on a slow read.
    final enabled = linked && !_busy && (!_loading || widget.direction != null);
    final width = MediaQuery.sizeOf(context).width;
    final face = math.max(150.0, math.min(240.0, width * .56));
    return PopScope(
      // A punch being sent is not abandoned half-way by a back press: it is
      // already kept, and the screen says how it went in a moment.
      canPop: !_busy,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _busy) _say('Sending your punch — one moment.');
      },
      child: Scaffold(
        appBar: brandBar(
          _loading ? 'Punch' : word,
          actions: [
            TextButton.icon(
              onPressed: _busy ? null : _history,
              icon: const Icon(Icons.history, size: 20),
              label: const Text('Punch History'),
            ),
            const SizedBox(width: 6),
          ],
        ),
        body: Column(
          children: [
            Expanded(
              child: RefreshIndicator(
                onRefresh: _refresh,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                  children: [
                    ValueListenableBuilder<DateTime>(
                      valueListenable: _clock,
                      builder: (context, now, _) => PunchClock(now: now, note: _driftNote()),
                    ),
                    const SizedBox(height: 18),
                    Center(
                      child: SelfieView(camera: _camera, size: face),
                    ),
                    const SizedBox(height: 18),
                    PunchMap(
                      fix: _fix,
                      locating: _finding != null,
                      height: math.max(150.0, math.min(200.0, width * .45)),
                      onLocate: () => unawaited(_locate()),
                    ),
                    const SizedBox(height: 10),
                    PlaceLine(text: _placeText()),
                    const SizedBox(height: 16),
                    if (!linked && !_loading)
                      const Note(
                        'Your login is not linked to an employee record, so there is nobody to punch for. '
                        'Ask HR to set your user on your Employee record.',
                        kind: NoteKind.warn,
                      ),
                    _waitingNotes(),
                    if (_error.isNotEmpty) Note(_error),
                    _todayCard(),
                  ],
                ),
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: FilledButton.icon(
                    key: const Key('punch-button'),
                    style: FilledButton.styleFrom(
                      backgroundColor: isIn ? kPrimary : kWarn,
                      foregroundColor: isIn ? kOnPrimary : kPage,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, letterSpacing: .3),
                    ),
                    onPressed: enabled ? _punch : null,
                    icon: _busy
                        ? SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2.5, color: isIn ? kOnPrimary : kPage),
                          )
                        : const Icon(Icons.fingerprint, size: 26),
                    label: Text(_busy ? 'Sending…' : word),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// What is kept on this phone and what could not be sent — said where
  /// somebody looks, because a punch they believe was recorded and was not is
  /// the failure this exists to prevent.
  Widget _waitingNotes() {
    final n = PunchQueue.I.waitingFor(Session.I.employeeId);
    final bad = PunchQueue.I.problems.value;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (Api.punchesFromCache && !_loading)
          const Note(
            'No signal. Today is shown as last seen, and a punch you make is saved on this phone '
            'and sent when you are online.',
            kind: NoteKind.warn,
          ),
        if (n > 0) ...[
          Note(waitingText(n), kind: NoteKind.warn),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () async {
                final sent = await PunchQueue.I.flush();
                if (!mounted) return;
                final left = PunchQueue.I.waitingFor(Session.I.employeeId);
                _say(
                  sent > 0
                      ? 'Sent $sent ✓'
                      : left > 0
                      ? 'Still no signal. It will be sent when you are online.'
                      : 'Nothing is waiting to be sent.',
                );
                await _load();
              },
              child: const Text('Send now'),
            ),
          ),
        ],
        for (final m in bad) Note(m),
        if (bad.isNotEmpty)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(onPressed: PunchQueue.I.dismissProblems, child: const Text('Dismiss')),
          ),
        if (n > 0 || bad.isNotEmpty || (Api.punchesFromCache && !_loading)) const SizedBox(height: 8),
      ],
    );
  }

  Widget _todayCard() {
    final shown = _shown;
    final pair = dayPunches(shown);
    final hours = spanHours(pair.inAt, pair.outAt);
    return Panel(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'Today',
                style: TextStyle(fontWeight: FontWeight.w700, color: kInk),
              ),
              const Spacer(),
              if (hours.isNotEmpty) Text('$hours worked', style: const TextStyle(color: kInk2)),
            ],
          ),
          const SizedBox(height: 6),
          if (shown.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('No punch yet today.', style: TextStyle(color: kInk2)),
            )
          else
            // Every punch, not a pair. A gate that double-reads puts four rows
            // on a day, and a screen that showed two of them would look like
            // the machine was fine.
            ...shown.map((p) {
              final out = '${p['log_type']}'.toUpperCase() == kLogOut;
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(out ? Icons.logout : Icons.login, color: out ? kWarn : kGood),
                title: Text(clockOf(p['time']), style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(
                  [
                    '${p['log_type'] ?? ''}'.isEmpty ? 'no direction recorded' : '${p['log_type']}',
                    if (p['pending'] == true) 'waiting to send',
                    if ('${p['device_id'] ?? ''}'.isNotEmpty) '${p['device_id']}',
                  ].join(' · '),
                  style: const TextStyle(fontSize: 12),
                ),
              );
            }),
          TextButton.icon(
            icon: const Icon(Icons.edit_calendar_outlined, size: 18),
            label: const Text('Something missing? Ask for a correction'),
            onPressed: () async {
              final made = await showCorrectionSheet(
                context,
                iso: _iso,
                seedIn: seedFrom(pair.inAt),
                seedOut: seedFrom(pair.outAt),
              );
              if (made && mounted) _say('Sent for approval ✓');
            },
          ),
        ],
      ),
    );
  }
}

/// The punch landed — or, with no signal, is kept on the phone and says so.
/// Drawn only once the site has said so or the punch is written down here,
/// never on the press.
class PunchDoneScreen extends StatelessWidget {
  const PunchDoneScreen({
    super.key,
    required this.direction,
    required this.at,
    required this.iso,
    required this.where,
    this.note = '',
    this.kept = false,
  });

  final String direction;
  final String at;
  final String iso;
  final String where;

  /// What went with the punch and is worth saying — a photo that did not
  /// upload, a punch kept for later.
  final String note;

  /// Kept on this phone, not on the site yet: said in the headline, so nobody
  /// reads "successfully" about a punch still waiting for signal.
  final bool kept;

  @override
  Widget build(BuildContext context) {
    final isIn = direction == kLogIn;
    final headline = kept
        ? (isIn ? 'Punch In kept on this phone' : 'Punch Out kept on this phone')
        : (isIn ? 'Punched in successfully' : 'Punched out successfully');
    return Scaffold(
      appBar: brandBar(isIn ? 'Punch In' : 'Punch Out'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 40, 16, 24),
        children: [
          Center(
            child: Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(shape: BoxShape.circle, color: kept ? kWarn : kGreen),
              child: Icon(kept ? Icons.schedule_send_rounded : Icons.check_rounded, color: Colors.white, size: 70),
            ),
          ),
          const SizedBox(height: 18),
          Text(
            headline,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: kept ? kWarn : kGood),
          ),
          const SizedBox(height: 28),
          Panel(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(
              children: [
                InfoRow(icon: Icons.access_time_rounded, label: 'Time', value: at),
                const Divider(height: 1, color: kLine),
                InfoRow(icon: Icons.calendar_today_outlined, label: 'Date', value: dmy(iso)),
                const Divider(height: 1, color: kLine),
                InfoRow(icon: Icons.location_on_outlined, label: 'Location', value: where),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (note.isNotEmpty) Note(note, kind: NoteKind.warn),
          const SizedBox(height: 10),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
        ],
      ),
    );
  }
}
