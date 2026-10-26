import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:manna_hr_app/core/landing.dart';
import 'package:manna_hr_app/core/roster.dart';
import 'package:manna_hr_app/screens/admin/admin_shell.dart';
import 'package:manna_hr_app/screens/employee_shell.dart';
import 'package:manna_hr_app/screens/login_screen.dart';
import 'package:manna_hr_app/services/admin_api.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// The colours a day is drawn in.
///
/// **The same key as the dashboard**, taken off `client/src/styles/themes.css`
/// rather than picked again — the two screens are read side by side when
/// somebody disputes a day, and a green that means "full day" on one and
/// something else on the other is worse than no colour at all. Its text
/// shades (`live`, `part`, `bad`, `skip`), since 22 October 2026. Two are the
/// app's own: leave is the website's blue rather than its second green, since
/// here a day is a dot and a word and two greens would read as one state, and
/// a holiday is its teal week-off bar.
///
/// Every one of them is drawn with its word beside it. Eight states over
/// thirty-one cells is exactly the chart that fails on colour alone, and this
/// is a screen somebody reads to check a wage.
const Map<DayStatus, Color> kStatusColour = {
  DayStatus.present: kGood,
  DayStatus.onFloor: kWarn,
  DayStatus.onLeave: kInfo,
  DayStatus.leavePending: kWarn,
  DayStatus.holiday: kTeal,
  DayStatus.weeklyOff: kInk2,
  DayStatus.unmarked: kFaint,
  DayStatus.absent: kBad,
};

/// The HRDashboard kit's dark look (26 October 2026): a navy page, cards a
/// step lighter, white buttons with navy text, outlined fields, green for what
/// is selected. Values are `ui/brand.dart`'s, which says where each comes from.
ThemeData mannaTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: kGreen,
    brightness: Brightness.dark,
    primary: kPrimary,
    onPrimary: kOnPrimary,
    secondary: kAccent,
    surface: kCard,
    onSurface: kInk,
    surfaceTint: Colors.transparent,
  );
  final field = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: const BorderSide(color: kFieldLine),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: kPage,
    dividerColor: kLine,
    appBarTheme: const AppBarTheme(
      backgroundColor: kCard,
      foregroundColor: kInk,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: true,
      shape: Border(bottom: BorderSide(color: kLine)),
      systemOverlayStyle: SystemUiOverlayStyle.light,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: kInk),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: kInk,
        side: const BorderSide(color: kFieldLine),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: kCard, surfaceTintColor: Colors.transparent),
    dialogTheme: const DialogThemeData(backgroundColor: kCard, surfaceTintColor: Colors.transparent),
    drawerTheme: const DrawerThemeData(backgroundColor: kCard),
    listTileTheme: const ListTileThemeData(iconColor: kInk2, textColor: kInk),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: kRaised,
      contentTextStyle: TextStyle(color: kInk),
      behavior: SnackBarBehavior.floating,
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? kGreen : null),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: kAccent)),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: kGreen, linearTrackColor: kBrandTint),
    cardTheme: CardThemeData(
      elevation: 0,
      color: kCard,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: kLine)),
      margin: const EdgeInsets.symmetric(vertical: 6),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: kPrimary,
        foregroundColor: kOnPrimary,
        minimumSize: const Size.fromHeight(50),
        textStyle: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: kPage,
      labelStyle: const TextStyle(color: kInk2),
      hintStyle: const TextStyle(color: kFaint),
      prefixIconColor: kInk2,
      suffixIconColor: kInk2,
      border: field,
      enabledBorder: field,
      focusedBorder: field.copyWith(borderSide: const BorderSide(color: kGreen, width: 1.6)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    tabBarTheme: const TabBarThemeData(
      labelColor: kAccent,
      unselectedLabelColor: kInk2,
      indicatorColor: kGreen,
      labelStyle: TextStyle(fontWeight: FontWeight.w700),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: kCard,
      selectedItemColor: kAccent,
      unselectedItemColor: kInk2,
      type: BottomNavigationBarType.fixed,
      selectedLabelStyle: TextStyle(fontWeight: FontWeight.w700, fontSize: 11.5),
      unselectedLabelStyle: TextStyle(fontSize: 11.5),
    ),
  );
}

class MannaHrApp extends StatelessWidget {
  const MannaHrApp({super.key, this.home});

  /// For the tests: a screen to open on instead of the session check.
  final Widget? home;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Manna HR',
        debugShowCheckedModeBanner: false,
        theme: mannaTheme(),
        home: home ?? const _Gate(),
      );
}

/// The screen for a [Landing].
Widget screenFor(Landing l) => switch (l) {
      Landing.signIn => const LoginScreen(),
      Landing.employee => const EmployeeShell(),
      Landing.admin => const AdminShell(),
    };

/// Opens [l] in place of everything behind it.
void goTo(BuildContext context, Landing l) {
  Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => screenFor(l)), (_) => false);
}

/// Signs out and opens the sign-in screen — from either side.
Future<void> signOut(BuildContext context) async {
  final nav = Navigator.of(context);
  await Api.logout();
  AdminApi.forget();
  nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
}

/// What the app opens on: the splash, while a stored session is restored.
///
/// Somebody who signed in last week opens on their own home rather than on a
/// login form they have to dismiss. A failure here is not an error screen: it
/// is the login form, which is the correct answer to "there is no session".
class _Gate extends StatefulWidget {
  const _Gate();

  @override
  State<_Gate> createState() => _GateState();
}

class _GateState extends State<_Gate> {
  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    var landing = Landing.signIn;
    try {
      await Api.restore();
      // Signed in is a live session, not a resolved employee: somebody whose
      // Employee record carries no `user_id` is legitimately signed in and has
      // nothing to punch against, and their home says so and names the fix.
      final who = await Api.whoami();
      final signedIn = who.isNotEmpty && who != 'Guest';
      // Asked again on every start, not only at sign-in: a login whose HR role
      // was taken away should stop seeing everybody's day.
      final admin = signedIn && await Api.isAdmin();
      landing = landingFor(signedIn: signedIn, isAdmin: admin);
    } catch (_) {
      landing = Landing.signIn;
    }
    if (!mounted) return;
    Navigator.of(context).pushReplacement(PageRouteBuilder(
      pageBuilder: (_, _, _) => screenFor(landing),
      transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
    ));
  }

  @override
  Widget build(BuildContext context) => const SplashScreen();
}

/// The brand, while the session is restored.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Container(
          width: double.infinity,
          height: double.infinity,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [kCard, kPage],
            ),
          ),
          child: SafeArea(
            child: Column(children: [
              const Spacer(flex: 3),
              // The lockup is dark-on-white artwork — half of it is grey — so
              // it sits on a white plate, never straight on the navy.
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(22)),
                child: Image.asset('assets/manna_logo.png', height: 54, fit: BoxFit.contain),
              ),
              const SizedBox(height: 26),
              const Text('Manna HR',
                  style: TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              const Text('People  •  Attendance  •  Payroll',
                  style: TextStyle(color: Colors.white, fontSize: 14)),
              const Spacer(flex: 3),
              const SizedBox(
                  height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
              const SizedBox(height: 28),
              const Text('Manna Group of Companies', style: TextStyle(color: Colors.white, fontSize: 13)),
              const SizedBox(height: 24),
            ]),
          ),
        ),
      );
}
