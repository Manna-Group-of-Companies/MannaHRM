import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/roster.dart';
import 'package:manna_hr_app/screens/login_screen.dart';
import 'package:manna_hr_app/screens/punch_screen.dart';
import 'package:manna_hr_app/services/api.dart';

/// The colours a day is drawn in.
///
/// **The same key as the dashboard**, taken off `client/src/styles/themes.css`
/// rather than picked again — the two screens are read side by side when
/// somebody disputes a day, and a green that means "full day" on one and
/// something else on the other is worse than no colour at all.
///
/// Every one of them is drawn with its word beside it. Eight states over
/// thirty-one cells is exactly the chart that fails on colour alone, and this
/// is a screen somebody reads to check a wage.
const Map<DayStatus, Color> kStatusColour = {
  DayStatus.present: Color(0xFF0EA372),
  DayStatus.onFloor: Color(0xFFC77A0B),
  DayStatus.onLeave: Color(0xFF3B82F6),
  DayStatus.leavePending: Color(0xFFC77A0B),
  DayStatus.holiday: Color(0xFFEA580C),
  DayStatus.weeklyOff: Color(0xFF9AA5B8),
  DayStatus.unmarked: Color(0xFFCBD2DC),
  DayStatus.absent: Color(0xFFDC2626),
};

class MannaHrApp extends StatelessWidget {
  const MannaHrApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Manna HR',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFEA580C),
          primary: const Color(0xFFEA580C),
          secondary: const Color(0xFF3F3F3F),
        ),
        scaffoldBackgroundColor: const Color(0xFFF7F7F8),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF3F3F3F),
          foregroundColor: Colors.white,
          elevation: 0,
          centerTitle: false,
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFFECECEC)),
          ),
          margin: const EdgeInsets.symmetric(vertical: 6),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ),
      home: const _Gate(),
    );
  }
}

/// What the app opens on.
///
/// A stored session is restored before anything is drawn, so somebody who
/// signed in last week opens on the punch button rather than on a login form
/// they have to dismiss. A failure here is not an error screen: it is the login
/// form, which is the correct answer to "there is no session".
class _Gate extends StatefulWidget {
  const _Gate();

  @override
  State<_Gate> createState() => _GateState();
}

class _GateState extends State<_Gate> {
  bool _checking = true;
  bool _signedIn = false;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    try {
      await Api.restore();
      // Signed in is a live session, not a resolved employee: somebody whose
      // Employee record carries no `user_id` is legitimately signed in and has
      // nothing to punch against, and the punch screen says so and names the
      // fix. Sending them back to a login form would say the password was
      // wrong, which it was not.
      final who = await Api.whoami();
      _signedIn = who.isNotEmpty && who != 'Guest';
    } catch (_) {
      _signedIn = false;
    }
    if (mounted) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return _signedIn ? const PunchScreen() : const LoginScreen();
  }
}
