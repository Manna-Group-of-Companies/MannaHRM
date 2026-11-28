import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/landing.dart';
import 'package:manna_hr_app/core/roster.dart';
import 'package:manna_hr_app/core/session.dart';
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

/// The light green look (25 November 2026): an off-white page, white cards,
/// a deep green button, white fields held by a hairline, the serif for
/// headings. Values are ui/brand.dart's.
ThemeData mannaTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: kGreen,
    brightness: Brightness.light,
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
    fontFamily: 'PlusJakartaSans',
    colorScheme: scheme,
    brightness: Brightness.light,
    scaffoldBackgroundColor: kPage,
    dividerColor: kLine,
    dividerTheme: const DividerThemeData(color: kLine, space: 1),
    appBarTheme: AppBarTheme(
      backgroundColor: kPage,
      foregroundColor: kInk,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      shape: const Border(),
      systemOverlayStyle: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
      titleTextStyle: serif(22),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: kAccent,
        backgroundColor: kGreenSoft,
        side: BorderSide.none,
        minimumSize: const Size(0, 48),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, fontFamily: 'PlusJakartaSans'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: kCard,
      surfaceTintColor: Colors.transparent,
      dragHandleColor: kFieldLine,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: kCard,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      titleTextStyle: serif(20),
    ),
    drawerTheme: const DrawerThemeData(backgroundColor: kBrandDeep),
    listTileTheme: const ListTileThemeData(iconColor: kInk2, textColor: kInk),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: kBrandDeep,
      contentTextStyle: const TextStyle(color: Colors.white, fontFamily: 'PlusJakartaSans'),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? kPrimary : null),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: kAccent,
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontFamily: 'PlusJakartaSans'),
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: kGreen, linearTrackColor: kBrandTint),
    cardTheme: CardThemeData(
      elevation: 0,
      color: kCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: kCardLine),
      ),
      margin: const EdgeInsets.symmetric(vertical: 6),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: kPrimary,
        foregroundColor: kOnPrimary,
        disabledBackgroundColor: kFieldLine,
        minimumSize: const Size.fromHeight(50),
        textStyle: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, fontFamily: 'PlusJakartaSans'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: kCard,
      labelStyle: const TextStyle(color: kInk2),
      hintStyle: const TextStyle(color: kFaint),
      prefixIconColor: kInk2,
      suffixIconColor: kInk2,
      border: field,
      enabledBorder: field,
      focusedBorder: field.copyWith(borderSide: const BorderSide(color: kPrimary, width: 1.6)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    tabBarTheme: const TabBarThemeData(
      labelColor: kAccent,
      unselectedLabelColor: kInk2,
      indicatorColor: kPrimary,
      labelStyle: TextStyle(fontWeight: FontWeight.w700, fontFamily: 'PlusJakartaSans'),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: kCard,
      selectedItemColor: kAccent,
      unselectedItemColor: kFaint,
      type: BottomNavigationBarType.fixed,
      elevation: 0,
      selectedLabelStyle: TextStyle(fontWeight: FontWeight.w800, fontSize: 11.5),
      unselectedLabelStyle: TextStyle(fontWeight: FontWeight.w500, fontSize: 11.5),
    ),
  );
}

/// Every screen, on every phone and tablet: the text never grows past what the
/// layouts were drawn for, and on a screen wider than [kMaxContentWidth] the
/// app is drawn at that width in the middle, the page colour either side.
/// Dialogs and sheets are told the narrower width too, so they open over the
/// app, not the glass.
Widget fitScreen(BuildContext context, Widget? child) {
  final mq = MediaQuery.of(context);
  final text = mq.textScaler.clamp(minScaleFactor: .85, maxScaleFactor: 1.3);
  final app = child ?? const SizedBox();
  if (mq.size.width <= kMaxContentWidth) {
    return MediaQuery(
      data: mq.copyWith(textScaler: text),
      child: app,
    );
  }
  return ColoredBox(
    color: kPage,
    child: Center(
      child: SizedBox(
        width: kMaxContentWidth,
        child: MediaQuery(
          data: mq.copyWith(textScaler: text, size: Size(kMaxContentWidth, mq.size.height)),
          child: app,
        ),
      ),
    ),
  );
}

class MannaHrApp extends StatelessWidget {
  const MannaHrApp({super.key, this.home});

  /// For the tests: a screen to open on instead of the session check.
  final Widget? home;

  /// The app's navigator, for the one message that can come from anywhere:
  /// the kept password stopped working (see [_SignInAgain]).
  static final navigator = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Manna HR',
    debugShowCheckedModeBanner: false,
    theme: mannaTheme(),
    navigatorKey: navigator,
    builder: (context, child) => _SignInAgain(child: fitScreen(context, child)),
    home: home ?? const _Gate(),
  );
}

/// When the password this phone keeps stops working — HR reset it, or it was
/// changed on the website — the app says so once and offers the sign-in form,
/// with the email filled in. Before, every screen said "check your signal"
/// while the app kept retrying a password the site locks the login over.
class _SignInAgain extends StatefulWidget {
  const _SignInAgain({required this.child});

  final Widget child;

  @override
  State<_SignInAgain> createState() => _SignInAgainState();
}

class _SignInAgainState extends State<_SignInAgain> {
  bool _showing = false;

  @override
  void initState() {
    super.initState();
    Session.I.signInAgain.addListener(_changed);
  }

  @override
  void dispose() {
    Session.I.signInAgain.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (!Session.I.signInAgain.value || _showing) return;
    final ctx = MannaHrApp.navigator.currentContext;
    if (ctx == null) return;
    _showing = true;
    unawaited(
      showDialog<void>(
        context: ctx,
        barrierDismissible: false,
        builder: (d) => PopScope(
          // Back must not put it away: nothing is sent until the person signs in.
          canPop: false,
          child: AlertDialog(
            title: const Text('Sign in again'),
            content: const Text(
              'Your password has changed. Sign in with your email and your new password. '
              'Punches saved on this phone stay, and are sent once you have signed in.',
            ),
            actions: [
              FilledButton(
                onPressed: () {
                  Navigator.of(d).pop();
                  final nav = MannaHrApp.navigator.currentContext;
                  if (nav != null) unawaited(signOut(nav));
                },
                child: const Text('Sign in'),
              ),
            ],
          ),
        ),
      ).whenComplete(() => _showing = false),
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
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

bool _signingOut = false;

/// Signs out and opens the sign-in screen — from either side. A second tap
/// while the first is still running does nothing: two of them stacked a second
/// sign-in form on the first, or wiped a sign-in made in between.
Future<void> signOut(BuildContext context) async {
  if (_signingOut) return;
  _signingOut = true;
  try {
    final nav = Navigator.of(context);
    await Api.logout();
    AdminApi.forget();
    nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
  } finally {
    _signingOut = false;
  }
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

/// How long the splash waits on a slow network before opening on what the
/// phone remembers. A phone connected to nothing otherwise waited out every
/// time-out — twenty to forty seconds at a gate — before it could punch.
const Duration kSlowStart = Duration(seconds: 8);

class _GateState extends State<_Gate> {
  /// A signed-in phone with no signal and nothing remembered to open on.
  bool _noSignal = false;
  bool _opened = false;
  Timer? _slow;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  @override
  void dispose() {
    _slow?.cancel();
    super.dispose();
  }

  void _open(Landing l) {
    if (_opened || !mounted) return;
    _opened = true;
    _slow?.cancel();
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (_, _, _) => screenFor(l),
        transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
      ),
    );
  }

  Future<void> _restore() async {
    setState(() => _noSignal = false);
    // Too slow: open on the remembered employee and let the start finish
    // behind it. The punch works offline; the site catches up by itself.
    _slow = Timer(kSlowStart, () async {
      if (_opened || !mounted) return;
      // HR's side needs the site: HR waits for the start rather than landing
      // on the employee side for the whole run.
      if (await Api.rememberedAdmin()) return;
      if (_opened || !mounted) return;
      if (await Api.startOfflineNow()) _open(Landing.employee);
    });
    var landing = Landing.signIn;
    try {
      final restored = await Api.restore();
      // The start has answered: the early open has nothing left to cover.
      if (!_opened) _slow?.cancel();
      if (_opened) {
        // The phone opened offline while this finished: the session it won
        // is used from here on, and nothing waits for a sign-in to send.
        if (Session.I.sid.isNotEmpty && Session.I.csrfToken.isNotEmpty) Session.I.offlineStart = false;
        return;
      }
      // No signal at start: open on the punch screen, with what this phone
      // remembers, rather than on a sign-in form for somebody who is signed in.
      // Only the employee's side — HR's reads need the site.
      if (Session.I.offlineStart) {
        _open(Landing.employee);
        return;
      }
      // Signed in is a live session, not a resolved employee: somebody whose
      // Employee record carries no `user_id` is legitimately signed in and has
      // nothing to punch against, and their home says so and names the fix.
      //
      // Signed in once stays signed in until Sign out (26 November 2026):
      // `restore` has just answered this, signing in again by itself with the
      // kept login when the site's session had run out, so a second question
      // that a weak signal fails must not send somebody to the sign-in form.
      // Signed in is what the start said, not one more question a weak
      // signal can lose: a live session, or the employee it opened on.
      final user = Session.I.user;
      final live = Session.I.sid.isNotEmpty;
      final who = user.isNotEmpty && user != 'Guest'
          ? user
          : (live || restored != null)
          ? ''
          : await Api.whoami();
      final signedIn = live || restored != null || (who.isNotEmpty && who != 'Guest');
      // Asked again on every start, not only at sign-in: a login whose HR role
      // was taken away should stop seeing everybody's day.
      final admin = signedIn && await Api.isAdmin();
      landing = landingFor(signedIn: signedIn, isAdmin: admin);
    } on NoSignalAtStart {
      // Signed in, no signal, and nothing remembered here to open on: say so
      // and offer to try again. Never the sign-in form for a signed-in phone.
      _slow?.cancel();
      if (mounted && !_opened) setState(() => _noSignal = true);
      return;
    } catch (_) {
      landing = Landing.signIn;
    }
    _open(landing);
  }

  @override
  Widget build(BuildContext context) => _noSignal
      ? SplashScreen(
          message: kNoSignal,
          onRetry: () {
            _slow?.cancel();
            _restore();
          },
        )
      : const SplashScreen();
}

/// The brand, while the session is restored.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key, this.message = '', this.onRetry});

  /// Said in place of the spinner — no signal at start — with [onRetry].
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Container(
      width: double.infinity,
      height: double.infinity,
      decoration: const BoxDecoration(gradient: kBrandGradient),
      child: SafeArea(
        child: Column(
          children: [
            const Spacer(flex: 3),
            // The lockup is dark-on-white artwork — half of it is grey — so
            // it sits on a white plate, never straight on the green.
            Container(
              width: 96,
              height: 96,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
              child: Image.asset('assets/manna_logo.png', fit: BoxFit.contain),
            ),
            const SizedBox(height: 26),
            Text('Manna HR', style: serif(34, color: Colors.white)),
            const SizedBox(height: 8),
            const Text(
              'People • Attendance • Payroll',
              style: TextStyle(color: kLime, fontSize: 14, fontWeight: FontWeight.w700),
            ),
            const Spacer(flex: 3),
            if (message.isEmpty)
              const SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            else
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  children: [
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 14),
                    FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: kLime, foregroundColor: kOnLime),
                      onPressed: onRetry,
                      child: const Text('Try again'),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 28),
            const Text('Manna Group of Companies', style: TextStyle(color: Colors.white, fontSize: 13)),
            const SizedBox(height: 24),
          ],
        ),
      ),
    ),
  );
}
