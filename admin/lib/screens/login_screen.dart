import 'package:flutter/material.dart';

import 'package:manna_hr_admin/core/constants.dart';
import 'package:manna_hr_admin/core/errors.dart';
import 'package:manna_hr_admin/screens/home_screen.dart';
import 'package:manna_hr_admin/services/api.dart';

/// Sign in with the same ERPNext login used on the website. Every read after
/// this is made as that login, under its own roles.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _site = TextEditingController(text: kDefaultSiteUrl);
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _showSite = false;
  bool _hide = true;
  String _error = '';

  Future<void> _signIn() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Type your email and password.');
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final who = await Api.login(
          siteUrl: _site.text.trim().replaceAll(RegExp(r'/+$'), ''),
          email: _email.text.trim(),
          password: _password.text);
      if (!await Api.isAdmin()) {
        await Api.logout();
        throw const Refused('This app is for HR. Your login is not an HR User or HR Manager on the site — '
            'use the Manna HR app to see your own attendance.');
      }
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => HomeScreen(user: who)));
    } catch (e) {
      setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(Icons.fingerprint, size: 56, color: theme.colorScheme.primary),
                    const SizedBox(height: 12),
                    Text('Manna HR Admin', textAlign: TextAlign.center, style: theme.textTheme.headlineSmall),
                    const SizedBox(height: 4),
                    Text('Punches, absents and leave, for everybody, day by day.',
                        textAlign: TextAlign.center, style: theme.textTheme.bodyMedium),
                    const SizedBox(height: 28),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(labelText: 'Email'),
                      textInputAction: TextInputAction.next,
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _password,
                      obscureText: _hide,
                      autofillHints: const [AutofillHints.password],
                      decoration: InputDecoration(
                        labelText: 'Password',
                        suffixIcon: IconButton(
                          tooltip: _hide ? 'Show password' : 'Hide password',
                          icon: Icon(_hide ? Icons.visibility : Icons.visibility_off),
                          onPressed: () => setState(() => _hide = !_hide),
                        ),
                      ),
                      onSubmitted: (_) => _busy ? null : _signIn(),
                    ),
                    if (_showSite) ...[
                      const SizedBox(height: 14),
                      TextField(
                        controller: _site,
                        keyboardType: TextInputType.url,
                        decoration: const InputDecoration(labelText: 'Site'),
                      ),
                    ],
                    if (_error.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      Text(_error, style: TextStyle(color: theme.colorScheme.error)),
                    ],
                    const SizedBox(height: 22),
                    FilledButton(
                      onPressed: _busy ? null : _signIn,
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                      child: _busy
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Sign in'),
                    ),
                    TextButton(
                      onPressed: () => setState(() => _showSite = !_showSite),
                      child: Text(_showSite ? 'Hide the site address' : 'A different site'),
                    ),
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
