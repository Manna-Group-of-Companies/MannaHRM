/// The face on a punch.
///
/// The front (selfie) camera, shown live on the Punch screen and taken at the
/// press — asked for 27 November 2026: "only the selfie camera should turn
/// on". The phone's own camera app is not used any more: it can be switched to
/// the back camera, and some of them ignore a request for the front one.
///
/// **It is evidence, not a gate.** Like the coordinate, a punch with no photo
/// is still sent and the dashboard draws it as having none. The bias in this
/// project is that refusing somebody who did turn up is the expensive mistake
/// (CLAUDE.md §4): a phone with a broken front camera, or none, must not cost
/// its owner a day's pay. So when the camera cannot be used the punch goes
/// without a photo and says so.
library;

import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';

/// About 480p — 720×480 off most front cameras, 50–100 KB as a JPEG: small
/// enough to upload on one bar of 2G at a gate, large enough to tell two
/// people apart.
const ResolutionPreset kPhotoPreset = ResolutionPreset.medium;

/// How long a press waits for the shutter before the punch goes without a
/// photo. A camera that hangs must not hold up a punch.
const Duration kShutterLimit = Duration(seconds: 6);

/// How long a press made while the camera is still starting waits for it.
const Duration kCameraStartLimit = Duration(seconds: 5);

/// What the camera gave back.
class Snap {
  const Snap({this.path, this.problem = ''});

  /// The JPEG on the phone, or null.
  final String? path;

  /// Why there is no photo, said after the punch. Empty when there is one.
  final String problem;

  bool get has => path != null;
}

/// Said on the Punch screen under the round picture, and after the punch.
const String kNoFrontCamera = 'This phone has no front camera, so the punch goes without a photo.';
const String kCameraRefused = 'The camera is not allowed for Manna HR. Allow it in the phone\'s settings '
    'so your punch carries your photo.';
const String kCameraFailed = 'The camera could not be opened. You can still punch; it goes without a photo.';

/// The front camera while the Punch screen is open.
///
/// Started when the screen opens and stopped when it closes or the app goes to
/// the background — Android takes the camera away from an app that is not in
/// front, and a preview left running would come back frozen.
class SelfieCamera extends ChangeNotifier {
  CameraController? _controller;
  Future<void>? _starting;
  bool _disposed = false;
  bool _wanted = false;
  String _problem = '';
  bool _refused = false;

  /// Bumped by [stop] and [dispose], so a start still running when the screen
  /// went away lets go of the camera instead of keeping it open.
  int _generation = 0;

  /// The live camera, or null while it is starting or could not be opened.
  CameraController? get controller {
    final c = _controller;
    return c != null && c.value.isInitialized ? c : null;
  }

  bool get starting => _starting != null;

  /// Why there is no live picture, in words for the screen. Empty otherwise.
  String get problem => _problem;

  /// The camera permission was refused — the screen offers Android's settings.
  bool get refused => _refused;

  /// Opens the front camera. Never throws: a phone that cannot is told so.
  Future<void> start() {
    if (_disposed) return Future.value();
    _wanted = true;
    return _starting ??= _run();
  }

  /// Opens the camera, again if a stop and a start came while it was opening —
  /// the app sent to the background and brought back during the permission
  /// question — so the screen never ends up with no picture and no reason.
  Future<void> _run() async {
    try {
      while (_wanted && !_disposed && controller == null) {
        final generation = _generation;
        await _open(generation);
        if (generation == _generation) break;
      }
    } finally {
      _starting = null;
      _notify();
    }
  }

  Future<void> _open(int generation) async {
    _problem = '';
    _refused = false;
    _notify();
    CameraController? opened;
    try {
      final cameras = await availableCameras();
      CameraDescription? front;
      for (final c in cameras) {
        if (c.lensDirection == CameraLensDirection.front) {
          front = c;
          break;
        }
      }
      if (front == null) {
        _problem = kNoFrontCamera;
        return;
      }
      opened = CameraController(
        front,
        kPhotoPreset,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await opened.initialize();
      if (_disposed || generation != _generation) return;
      _controller = opened;
      opened = null;
    } on CameraException catch (e) {
      _refused = e.code.contains('AccessDenied') || e.code.toLowerCase().contains('permission');
      _problem = _refused ? kCameraRefused : kCameraFailed;
    } catch (_) {
      // No camera plugin (a test), or the platform said something unexpected.
      _problem = kCameraFailed;
    } finally {
      final left = opened;
      if (left != null) unawaited(_release(left));
    }
  }

  /// Lets go of the camera. Safe to call at any time, and again.
  Future<void> stop() async {
    _wanted = false;
    _generation++;
    final c = _controller;
    _controller = null;
    _notify();
    if (c != null) await _release(c);
  }

  /// The photo, taken now. Never throws: no photo comes back with the reason.
  Future<Snap> take() async {
    final pending = _starting;
    if (pending != null) {
      try {
        await pending.timeout(kCameraStartLimit);
      } catch (_) {
        // Still starting: the punch goes without a photo rather than waiting.
      }
    }
    final c = controller;
    if (c == null) {
      return Snap(problem: _problem.isNotEmpty ? _problem : kCameraFailed);
    }
    try {
      final shot = await c.takePicture().timeout(kShutterLimit);
      return Snap(path: shot.path);
    } catch (_) {
      return const Snap(problem: 'The photo could not be taken, so this punch went without one.');
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _wanted = false;
    _generation++;
    final c = _controller;
    _controller = null;
    if (c != null) unawaited(_release(c));
    super.dispose();
  }

  static Future<void> _release(CameraController c) async {
    try {
      await c.dispose();
    } catch (_) {
      // Already gone with the screen; nothing left to free.
    }
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }
}
