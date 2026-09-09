import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/auth_store.dart';
import 'package:manna_hr_app/core/constants.dart';
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/screens/punch_screen.dart';
import 'package:manna_hr_app/services/api.dart';

/// Signing in.
///
/// The credential is the site's — an ERPNext user and their password — and
/// nothing here keeps a copy of anything the site did not issue. What the app
/// may then read and write is what that user's roles say, which is the whole
/// security model (CLAUDE.md §1).
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

  Future<void> _signIn() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await Api.login(
        siteUrl: _site.text.trim().replaceAll(RegExp(r'/+$'), ''),
        email: _email.text.trim(),
        password: _password.text,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const PunchScreen()));
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Manna HR',
                      style: TextStyle(
                          fontSize: 30, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Text('Punch in, punch out, and the month behind it.',
                      style: TextStyle(color: Colors.black.withValues(alpha: .55))),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    decoration: const InputDecoration(
                      labelText: 'Email / user id',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _password,
                    obscureText: !_showPassword,
                    onSubmitted: (_) => _busy ? null : _signIn(),
                    decoration: InputDecoration(
                      labelText: 'Password',
                      border: const OutlineInputBorder(),
                      suffixIcon: IconButton(
                        icon: Icon(_showPassword
                            ? Icons.visibility_off
                            : Icons.visibility),
                        onPressed: () =>
                            setState(() => _showPassword = !_showPassword),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  // Folded away rather than absent: nobody in the factory needs
                  // it, and whoever is testing against a bench cannot do
                  // without it.
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => setState(() => _showSite = !_showSite),
                      icon: Icon(_showSite
                          ? Icons.expand_less
                          : Icons.expand_more),
                      label: const Text('Site'),
                    ),
                  ),
                  if (_showSite)
                    TextField(
                      controller: _site,
                      keyboardType: TextInputType.url,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Site URL',
                        helperText: 'The ERPNext site this app talks to.',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF2F2),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFFECACA)),
                      ),
                      child: Text(_error,
                          style: const TextStyle(color: Color(0xFF991B1B))),
                    ),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy ? null : _signIn,
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: _busy
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white))
                          : const Text('Sign in'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
