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
  final _site = TextEditingController(text: kDefaultSiteUrl);
  bool _busy = false;
  bool _showPassword = false;
  bool _showSite = false;
  String _error = '';
  String _said = '';

  @override
  void initState() {
    super.initState();
    // The email and the site come back filled in. A bench address typed once
    // should not have to be typed again, and neither is a secret.
    AuthStore.load().then((c) {
      if (!mounted) return;
      setState(() {
        if (c.email.isNotEmpty) _email.text = c.email;
        if (c.siteUrl.isNotEmpty) _site.text = c.siteUrl;
      });
    });
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _site.dispose();
    super.dispose();
  }

  String get _siteUrl => _site.text.trim().replaceAll(RegExp(r'/+$'), '');

  Future<void> _signIn() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Type your email and password.');
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
      _said = '';
    });
    try {
      await Api.login(siteUrl: _siteUrl, email: _email.text.trim(), password: _password.text);
      final admin = await Api.isAdmin();
      if (!mounted) return;
      goTo(
        context,
        landingFor(signedIn: true, isAdmin: admin),
      );
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _forgot() async {
    setState(() {
      _error = '';
      _said = '';
    });
    try {
      await Api.resetPassword(siteUrl: _siteUrl, user: _email.text);
      if (mounted) setState(() => _said = 'The site has emailed a link to reset your password.');
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    }
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
                    // The kit's sign-in: the mark and the name on one line,
                    // then the heading large and centred.
                    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Container(
                        padding: const EdgeInsets.all(5),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
                        child: Image.asset('assets/manna_logo.png', height: 22, fit: BoxFit.contain),
                      ),
                      const SizedBox(width: 10),
                      const Text('Manna HR', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: kInk)),
                    ]),
                    const SizedBox(height: 28),
                    const Text('Sign in to your account',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: kInk, height: 1.2)),
                    const SizedBox(height: 30),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      autofillHints: const [AutofillHints.username],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Email / user id',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _password,
                      obscureText: !_showPassword,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => _busy ? null : _signIn(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          tooltip: _showPassword ? 'Hide password' : 'Show password',
                          icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility),
                          onPressed: () => setState(() => _showPassword = !_showPassword),
                        ),
                      ),
                    ),
                    if (_showSite) ...[
                      const SizedBox(height: 14),
                      TextField(
                        controller: _site,
                        keyboardType: TextInputType.url,
                        autocorrect: false,
                        decoration: const InputDecoration(labelText: 'Site URL', prefixIcon: Icon(Icons.dns_outlined)),
                      ),
                    ],
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
                    const SizedBox(height: 6),
                    TextButton(onPressed: _busy ? null : _forgot, child: const Text('Forgot password?')),
                    // Folded away rather than absent: nobody in the factory
                    // needs it, and whoever is testing against a bench cannot
                    // do without it.
                    TextButton.icon(
                      onPressed: () => setState(() => _showSite = !_showSite),
                      icon: Icon(_showSite ? Icons.expand_less : Icons.expand_more, size: 18),
                      label: const Text('Site'),
                      style: TextButton.styleFrom(foregroundColor: kInk2),
                    ),
                    const SizedBox(height: 18),
                    Center(child: Image.asset('assets/manna_logo.png', height: 24, fit: BoxFit.contain)),
                    const SizedBox(height: 8),
                    const Text('Version $kAppVersion',
                        textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: kInk2)),
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
