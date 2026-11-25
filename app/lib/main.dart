import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:manna_hr_app/app.dart';

/// Manna HR — the phone half of the attendance system.
///
/// Punch in, punch out, the month behind them, and the correction that fixes a
/// day the machines missed. Everything it writes goes straight to the ERPNext
/// site as the person signed in; nothing here decides anything (CLAUDE.md §1).
///
/// Upright only (25 November 2026): the screen never turns on its own. The
/// Android activity is locked to portrait too (AndroidManifest.xml), so it holds
/// before Flutter has started.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations(const [DeviceOrientation.portraitUp]);
  runApp(const MannaHrApp());
}
