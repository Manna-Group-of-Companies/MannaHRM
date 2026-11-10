import 'package:flutter/material.dart';

import 'package:manna_hr_app/app.dart';
import 'package:manna_hr_app/core/auth_store.dart';
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/first_password.dart';
import 'package:manna_hr_app/core/landing.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// Choose a new password — the only screen somebody sees while their password
/// is still the first one HR gave them: their date of birth (see
/// core/first_password.dart, and Landing.newPassword).
///
/// No way past it but a new password or signing out. A birthday is something
/// colleagues know, and this app writes the punches pay is made from.
class NewPasswordScreen extends StatefulWidget {
  const NewPasswordScreen({super.key});

  @override
  State<NewPasswordScreen> createState() => _NewPasswordScreenState();
}

class _NewPasswordScreenState extends State<NewPasswordScreen> {
  final _password = TextEditingController();
  final _again = TextEditingController();
  bool _busy = false;
  bool _show = false;
  String _error = '';

  @override
  void dispose() {
    _password.dispose();
    _again.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final code = '${Session.I.employee?['employee_number'] ?? ''}';
    final dob = await Api.birthDate();
    final problem = newPasswordProblem(_password.text, _again.text, isoDate: dob, empCode: code);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final old = (await AuthStore.load()).password;
      await Api.changePassword(current: old, next: _password.text);
      final admin = await Api.isAdmin();
      if (!mounted) return;
      goTo(context, landingFor(signedIn: true, isAdmin: admin));
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = Session.I.employeeName;
    return Scaffold(
      backgroundColor: kPage,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Panel(
                  padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    const Text('Choose a new password',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: kInk)),
                    const SizedBox(height: 8),
                    Text(
                      '${name.isEmpty ? 'You' : name} signed in with the first password HR gave you — '
                      'your date of birth. Choose your own before you punch.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 13.5, color: kInk2),
                    ),
                    const SizedBox(height: 20),
                    const FieldLabel('New password'),
                    TextField(
                      key: const Key('new-password'),
                      controller: _password,
                      obscureText: !_show,
                      autofillHints: const [AutofillHints.newPassword],
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.lock_rounded),
                        suffixIcon: IconButton(
                          tooltip: _show ? 'Hide password' : 'Show password',
                          icon: Icon(_show ? Icons.visibility_off : Icons.visibility),
                          onPressed: () => setState(() => _show = !_show),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const FieldLabel('Type it again'),
                    TextField(
                      key: const Key('new-password-again'),
                      controller: _again,
                      obscureText: !_show,
                      onSubmitted: (_) => _busy ? null : _save(),
                      decoration: const InputDecoration(prefixIcon: Icon(Icons.lock_rounded)),
                    ),
                    const SizedBox(height: 8),
                    const Text('At least 8 characters, and not your date of birth or Emp Code.',
                        style: TextStyle(fontSize: 12.5, color: kInk2)),
                    const SizedBox(height: 18),
                    if (_error.isNotEmpty) Note(_error),
                    FilledButton(
                      onPressed: _busy ? null : _save,
                      child: _busy
                          ? const SizedBox(
                              height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: kOnPrimary))
                          : const Text('Save password'),
                    ),
                    const SizedBox(height: 4),
                    TextButton(
                      onPressed: _busy ? null : () => signOut(context),
                      child: const Text('Sign out'),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
