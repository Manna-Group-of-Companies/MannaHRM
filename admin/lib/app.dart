import 'package:flutter/material.dart';

import 'package:manna_hr_admin/screens/home_screen.dart';
import 'package:manna_hr_admin/screens/login_screen.dart';
import 'package:manna_hr_admin/services/api.dart';

/// The Manna orange that fills a button — the website's `brand-dark`, which
/// white text clears AA on. The logo's own `#EF6C29` does not, so it is not
/// used for anything a person reads.
const kBrand = Color(0xFFC2410C);

ThemeData _theme(Brightness b) {
  final scheme = ColorScheme.fromSeed(seedColor: kBrand, brightness: b, primary: b == Brightness.light ? kBrand : null);
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    visualDensity: VisualDensity.standard,
    cardTheme: const CardThemeData(margin: EdgeInsets.zero, elevation: 0),
    inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder(), isDense: true),
  );
}

class MannaAdmin extends StatelessWidget {
  const MannaAdmin({super.key, this.home});

  /// For the tests: a screen to open on instead of the session check.
  final Widget? home;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Manna HR Admin',
        debugShowCheckedModeBanner: false,
        theme: _theme(Brightness.light),
        darkTheme: _theme(Brightness.dark),
        home: home ?? const _Gate(),
      );
}

/// Signed in already, or the sign-in screen. The password is kept on the phone
/// so an HR login is not asked to type every six hours when Frappe's session
/// expires — the same trade the employee app makes (`core/auth_store.dart`).
class _Gate extends StatefulWidget {
  const _Gate();

  @override
  State<_Gate> createState() => _GateState();
}

class _GateState extends State<_Gate> {
  late final Future<String> _who = _restore();

  Future<String> _restore() async {
    final who = await Api.restore();
    if (who.isEmpty) return '';
    // Checked again on every start, not only at sign-in: a login whose HR role
    // was taken away should stop seeing everybody's day.
    return await Api.isAdmin() ? who : '';
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<String>(
        future: _who,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          final who = snap.data ?? '';
          return who.isEmpty ? const LoginScreen() : HomeScreen(user: who);
        },
      );
}
