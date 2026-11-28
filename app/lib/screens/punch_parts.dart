/// The pieces of the Punch screen (27 November 2026, from the screen HR
/// showed): the time big, the face live in a circle off the front camera, a
/// map of where the person stands, the street, and one wide button.
///
/// Each piece has a calm state for a phone that cannot do its part — no front
/// camera, the camera refused, no GPS, no signal for the map — because the
/// punch itself never waits on any of them.
library;

import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart' show Geolocator;
import 'package:latlong2/latlong.dart';

import 'package:manna_hr_app/services/location.dart';
import 'package:manna_hr_app/services/photo.dart';
import 'package:manna_hr_app/ui/brand.dart';

const _days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String _two(int n) => n.toString().padLeft(2, '0');

/// `05:03:45 PM` — the clock as somebody at a gate reads it.
String clock12(DateTime t) {
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  return '${_two(h)}:${_two(t.minute)}:${_two(t.second)} ${t.hour < 12 ? 'AM' : 'PM'}';
}

/// `Friday, 27 Nov 2026`.
String dayLine(DateTime t) => '${_days[t.weekday - 1]}, ${t.day} ${_months[t.month - 1]} ${t.year}';

/// The time, big, with the day under it. [note] is said under both — the
/// phone's own clock being wrong, when it is.
class PunchClock extends StatelessWidget {
  const PunchClock({super.key, required this.now, this.note = ''});

  final DateTime now;
  final String note;

  @override
  Widget build(BuildContext context) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          clock12(now),
          key: const Key('punch-clock'),
          style: const TextStyle(
            fontSize: 40,
            fontWeight: FontWeight.w800,
            color: kInk,
            letterSpacing: .5,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
      ),
      const SizedBox(height: 2),
      Text(dayLine(now),
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: kInk2)),
      if (note.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(note, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, color: kWarn)),
        ),
    ]);
  }
}

/// The face, live, in a circle — the front camera only. The photo is taken off
/// this at the press.
class SelfieView extends StatelessWidget {
  const SelfieView({super.key, required this.camera, required this.size});

  final SelfieCamera camera;
  final double size;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: camera,
      builder: (context, _) {
        final live = camera.controller;
        final problem = camera.problem;
        return Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            key: const Key('selfie'),
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: kBrandTint,
              border: Border.all(color: kGreen, width: 4),
              boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 16, offset: Offset(0, 6))],
            ),
            child: ClipOval(child: live != null ? _live(live) : _waiting(problem.isNotEmpty)),
          ),
          if (problem.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(problem,
                textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: kWarn, height: 1.35)),
            Wrap(alignment: WrapAlignment.center, spacing: 4, children: [
              TextButton(onPressed: () => unawaited(camera.start()), child: const Text('Try again')),
              if (camera.refused)
                TextButton(
                  onPressed: () => unawaited(Geolocator.openAppSettings().then((_) {}, onError: (_) {})),
                  child: const Text('Open settings'),
                ),
            ]),
          ],
        ]);
      },
    );
  }

  Widget _live(CameraController c) {
    // The sensor reports its picture lying down; the preview stands it up. A
    // box that tall, scaled to cover the circle, keeps the face unsquashed.
    final s = c.value.previewSize;
    final ratio = s == null || s.width <= 0 || s.height <= 0 ? 4 / 3 : s.width / s.height;
    return FittedBox(
      fit: BoxFit.cover,
      clipBehavior: Clip.hardEdge,
      child: SizedBox(width: size, height: size * ratio, child: CameraPreview(c)),
    );
  }

  /// Still, not a spinner: the camera can take a second to open, and a wheel
  /// turning for ever on a phone with no camera reads as the app hanging.
  Widget _waiting(bool failed) => Center(
        child: Icon(
          failed ? Icons.no_photography_outlined : Icons.face_outlined,
          size: size * .4,
          color: kGreen.withValues(alpha: .55),
        ),
      );
}

/// A point a map can draw: Web Mercator has no room for the poles, and a
/// broken fix of 0,0 is the sea off Africa, not a gate.
bool mappable(double? lat, double? lng) =>
    lat != null &&
    lng != null &&
    lat.isFinite &&
    lng.isFinite &&
    lat.abs() <= 85 &&
    lng.abs() <= 180 &&
    !(lat == 0 && lng == 0);

/// Where the person stands, on OpenStreetMap — the map the field-sales and
/// driver apps draw, with no key and nothing to pay. With no signal the tiles
/// already seen still draw, the dot is still placed, and it says the map needs
/// signal; the punch never waits on it.
class PunchMap extends StatefulWidget {
  const PunchMap({
    super.key,
    required this.fix,
    required this.locating,
    required this.height,
    required this.onLocate,
  });

  /// The last fix, or null before the first.
  final Fix? fix;

  /// A fix is being taken now.
  final bool locating;
  final double height;

  /// Take a fresh fix — the "where I am" button, and Try again.
  final VoidCallback onLocate;

  @override
  State<PunchMap> createState() => _PunchMapState();
}

class _PunchMapState extends State<PunchMap> {
  final _map = MapController();
  bool _ready = false;
  bool _noTiles = false;

  static const double _zoom = 17;

  LatLng? get _at {
    final f = widget.fix;
    if (f == null || !mappable(f.latitude, f.longitude)) return null;
    return LatLng(f.latitude!, f.longitude!);
  }

  @override
  void didUpdateWidget(PunchMap old) {
    super.didUpdateWidget(old);
    final at = _at;
    if (at == null) {
      _ready = false;
      return;
    }
    if (old.fix?.latitude != at.latitude || old.fix?.longitude != at.longitude) {
      _noTiles = false;
      _move(at, null);
    }
  }

  @override
  void dispose() {
    _map.dispose();
    super.dispose();
  }

  void _move(LatLng to, double? zoom) {
    if (!_ready) return;
    try {
      _map.move(to, zoom ?? _map.camera.zoom);
    } catch (_) {
      // The map is not drawn yet; it opens on the new place anyway.
    }
  }

  void _zoomBy(double d) {
    if (!_ready) return;
    try {
      final c = _map.camera;
      _map.move(c.center, (c.zoom + d).clamp(5.0, 19.0));
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final at = _at;
    final f = widget.fix;
    final Widget body;
    if (at == null) {
      final looking = widget.locating || f == null;
      body = _Blank(
        icon: looking ? Icons.my_location : Icons.location_off_outlined,
        text: looking
            ? 'Finding where you are…'
            : (f.problem.isNotEmpty ? f.problem : 'The phone could not say where it is.'),
        action: looking ? null : TextButton(onPressed: widget.onLocate, child: const Text('Try again')),
      );
    } else {
      final accuracy = f?.accuracy ?? 0;
      body = Stack(children: [
        FlutterMap(
          mapController: _map,
          options: MapOptions(
            initialCenter: at,
            initialZoom: _zoom,
            minZoom: 5,
            maxZoom: 19,
            backgroundColor: kRaised,
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
            onMapReady: () => _ready = true,
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.mannagroup.manna_hr_app',
              maxNativeZoom: 19,
              errorTileCallback: (tile, error, stack) {
                if (!_noTiles && mounted) setState(() => _noTiles = true);
              },
            ),
            if (accuracy > 0)
              CircleLayer(circles: [
                CircleMarker(
                  point: at,
                  radius: accuracy,
                  useRadiusInMeter: true,
                  color: kInfo.withValues(alpha: .14),
                  borderColor: kInfo.withValues(alpha: .45),
                  borderStrokeWidth: 1,
                ),
              ]),
            MarkerLayer(markers: [Marker(point: at, width: 24, height: 24, child: const _Dot())]),
            const SimpleAttributionWidget(source: Text('OpenStreetMap contributors')),
          ],
        ),
        Positioned(
          right: 8,
          top: 8,
          child: Column(children: [
            _MapButton(icon: Icons.add, tip: 'Zoom in', onTap: () => _zoomBy(1)),
            const SizedBox(height: 6),
            _MapButton(icon: Icons.remove, tip: 'Zoom out', onTap: () => _zoomBy(-1)),
          ]),
        ),
        // Bottom left, clear of the zoom buttons on a 150-high map.
        Positioned(
          left: 8,
          bottom: 8,
          child: _MapButton(
            icon: Icons.my_location,
            tip: 'Where I am',
            onTap: () {
              _move(at, _zoom);
              widget.onLocate();
            },
          ),
        ),
        if (_noTiles)
          Positioned(
            left: 8,
            top: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: kCard, borderRadius: BorderRadius.circular(20)),
              child: const Text('Map needs signal',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: kInk2)),
            ),
          ),
      ]);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(
        key: const Key('punch-map'),
        height: widget.height,
        width: double.infinity,
        child: ColoredBox(color: kRaised, child: body),
      ),
    );
  }
}

class _Blank extends StatelessWidget {
  const _Blank({required this.icon, required this.text, this.action});

  final IconData icon;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, color: kGreen, size: 30),
          const SizedBox(height: 8),
          Text(text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: kInk2, height: 1.35)),
          ?action,
        ]),
      ),
    );
  }
}

/// The blue dot of "you are here".
class _Dot extends StatelessWidget {
  const _Dot();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: kInfo,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 4)],
      ),
    );
  }
}

class _MapButton extends StatelessWidget {
  const _MapButton({required this.icon, required this.tip, required this.onTap});

  final IconData icon;
  final String tip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: kCard,
      shape: const CircleBorder(),
      elevation: 2,
      child: IconButton(
        tooltip: tip,
        visualDensity: VisualDensity.compact,
        constraints: const BoxConstraints.tightFor(width: 38, height: 38),
        padding: EdgeInsets.zero,
        icon: Icon(icon, size: 20, color: kInk),
        onPressed: onTap,
      ),
    );
  }
}

/// The street, with a pin — or what is known instead.
class PlaceLine extends StatelessWidget {
  const PlaceLine({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Padding(
        padding: EdgeInsets.only(top: 1),
        child: Icon(Icons.location_on, color: kBad, size: 20),
      ),
      const SizedBox(width: 6),
      Expanded(
        child: Text(text, style: const TextStyle(fontSize: 14, color: kInk, height: 1.35)),
      ),
    ]);
  }
}
