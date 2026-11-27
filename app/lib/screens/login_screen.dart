import 'package:flutter/material.dart';

import 'package:manna_hr_app/app.dart';
import 'package:manna_hr_app/core/auth_store.dart';
import 'package:manna_hr_app/core/constants.dart';
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/landing.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// Signing in — one form for everybody.
///
/// The credential is the site's — an ERPNext user and their password — and
/// nothing here keeps a copy of anything the site did not issue. What the app
/// may then read and write is what that user's roles say, which is the whole
/// security model (CLAUDE.md §1). Which side opens is `core/landing.dart`.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _showPassword = false;
  String _error = '';
  String _said = '';

  @override
  void initState() {
    super.initState();
    // The Emp Code comes back filled in; it is not a secret. An email kept by an
    // older version is not: only the Emp Code signs in now. The site is never
    // asked for or shown (core/constants.dart kDefaultSiteUrl).
    AuthStore.load().then((c) {
      if (!mounted) return;
      if (c.email.isNotEmpty && !c.email.contains('@')) setState(() => _email.text = c.email);
    });
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Type your Emp Code and password.');
      return;
    }
    // Emp Code only, never an email (HR, 27 November 2026): every app user
    // signs in with their Emp Code and date of birth. Refused here, before the
    // site is asked, because the site itself takes an email for any login.
    if (_email.text.contains('@')) {
      setState(() => _error = 'Sign in with your Emp Code (for example MRP-103), not an email.');
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
      _said = '';
    });
    try {
      await Api.login(email: _email.text.trim(), password: _password.text);
      final admin = await Api.isAdmin();
      if (!mounted) return;
      goTo(context, landingFor(signedIn: true, isAdmin: admin));
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// No emailed reset link: most app logins have no mailbox behind them, and
  /// HR sets a forgotten one back to the Emp Code and date of birth from the
  /// employee's profile (Apps & access → Reset).
  void _forgot() {
    setState(() {
      _error = '';
      _said = 'Ask HR to reset it. Your password goes back to your date of birth, DDMMYYYY.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kPage,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // The FlutterFlow sign-in (29 October 2026): the logo on a
                    // white tile, the name, then the form in a card of its own.
                    Center(
                      child: Container(
                        width: 76,
                        height: 76,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: kCardLine)),
                        child: Image.asset('assets/manna_logo.png', fit: BoxFit.contain),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text('Manna HR', textAlign: TextAlign.center, style: serif(30)),
                    const SizedBox(height: 4),
                    const Text('People • Attendance • Payroll',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: kAccent)),
                    const SizedBox(height: 24),
                    Panel(
                      padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Text('Sign in to your account', textAlign: TextAlign.center, style: serif(20)),
                        const SizedBox(height: 20),
                        const FieldLabel('Emp Code'),
                        TextField(
                          controller: _email,
                          // Not an email keyboard: most people sign in with their
                          // Emp Code, which is letters and digits.
                          keyboardType: TextInputType.visiblePassword,
                          autocorrect: false,
                          autofillHints: const [AutofillHints.username],
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(prefixIcon: Icon(Icons.person_rounded), hintText: 'MRP-103'),
                        ),
                        const SizedBox(height: 16),
                        const FieldLabel('Password'),
                        TextField(
                          controller: _password,
                          obscureText: !_showPassword,
                          autofillHints: const [AutofillHints.password],
                          onSubmitted: (_) => _busy ? null : _signIn(),
                          decoration: InputDecoration(
                            prefixIcon: const Icon(Icons.lock_rounded),
                            suffixIcon: IconButton(
                              tooltip: _showPassword ? 'Hide password' : 'Show password',
                              icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility),
                              onPressed: () => setState(() => _showPassword = !_showPassword),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text('Your password is your date of birth, DDMMYYYY — 24 March 2005 is 24032005.',
                            style: TextStyle(fontSize: 12.5, color: kInk2)),
                        const SizedBox(height: 18),
                        if (_error.isNotEmpty) Note(_error),
                        if (_said.isNotEmpty) Note(_said, kind: NoteKind.ok),
                        FilledButton(
                          onPressed: _busy ? null : _signIn,
                          child: _busy
                              ? const SizedBox(
                                  height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: kOnPrimary))
                              : const Text('Sign in'),
                        ),
                        const SizedBox(height: 4),
                        TextButton(onPressed: _busy ? null : _forgot, child: const Text('Forgot password?')),
                      ]),
                    ),
                    const SizedBox(height: 40),
                    const Text('v$kAppVersion',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: kFaint)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
