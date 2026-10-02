/// Which phone a punch came from, in words HR can read: `vivo V2111 · Android 13`.
///
/// **A description, never an identifier.** No IMEI, no Android ID: those would
/// make the punch a way to track a handset, and nothing here needs one — HR
/// reads this to notice that somebody's punches suddenly come off a different
/// phone, and a make and model is enough for that.
///
/// Never throws. A phone that will not say goes without, and the punch with it.
library;

import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';

String? _cached;

/// The handset in one line, or '' when the platform would not say.
Future<String> deviceText() async {
  if (_cached != null) return _cached!;
  try {
    final info = DeviceInfoPlugin();
    if (Platform.isAndroid) {
      final a = await info.androidInfo;
      _cached = describeDevice(a.manufacturer, a.model, 'Android ${a.version.release}');
    } else if (Platform.isIOS) {
      final i = await info.iosInfo;
      _cached = describeDevice('Apple', i.utsname.machine, '${i.systemName} ${i.systemVersion}');
    } else {
      _cached = '';
    }
  } catch (_) {
    _cached = '';
  }
  return _cached!;
}

/// The pure half. A model name that already starts with the maker's — Samsung
/// says `SM-A145F`, but Google says `Pixel 7` and some say `vivo 1906` — is not
/// repeated, so the line reads `vivo 1906` and not `vivo vivo 1906`.
String describeDevice(String maker, String model, String os) {
  final mk = maker.trim();
  final md = model.trim();
  final phone = md.isEmpty
      ? mk
      : mk.isEmpty || md.toLowerCase().startsWith(mk.toLowerCase())
          ? md
          : '$mk $md';
  return [phone, os.trim()].where((s) => s.isNotEmpty).join(' · ');
}
