import 'package:flutter/material.dart';

import 'package:manna_hr_app/app.dart';
import 'package:manna_hr_app/core/constants.dart';
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// The login's own settings, from either side.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: brandBar('Settings'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Panel(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(children: [
              MenuRow(
                icon: Icons.lock_outline,
                label: 'Change Password',
                onTap: () => showDialog<void>(context: context, builder: (_) => const _ChangePassword()),
              ),
              MenuRow(
                icon: Icons.info_outline,
                label: 'About App',
                subtitle: 'Version $kAppVersion',
                onTap: () => showAboutDialog(
                  context: context,
                  applicationName: 'Manna HR',
                  applicationVersion: kAppVersion,
                  applicationIcon: Image.asset('assets/manna_logo.png', height: 32),
                  children: [Text('Signed in to ${Session.I.siteUrl} as ${Session.I.user}.')],
                ),
              ),
            ]),
          ),
          const SizedBox(height: 24),
          Material(
            color: kBadSoft,
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => signOut(context),
              child: const Padding(
                padding: EdgeInsets.symmetric(vertical: 14),
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.logout_rounded, color: kBad),
                  SizedBox(width: 8),
                  Text('Sign out', style: TextStyle(color: kBad, fontWeight: FontWeight.w700)),
                ]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChangePassword extends StatefulWidget {
  const _ChangePassword();

  @override
  State<_ChangePassword> createState() => _ChangePasswordState();
}

class _ChangePasswordState extends State<_ChangePassword> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();
  bool _busy = false;
  String _error = '';

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_next.text != _again.text) {
      setState(() => _error = 'The two new passwords are not the same.');
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await Api.changePassword(current: _current.text, next: _next.text);
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop();
      messenger.showSnackBar(const SnackBar(content: Text('Password changed ✓')));
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Change Password'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: _current, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
            const SizedBox(height: 12),
            TextField(controller: _next, obscureText: true, decoration: const InputDecoration(labelText: 'New password')),
            const SizedBox(height: 12),
            TextField(controller: _again, obscureText: true, decoration: const InputDecoration(labelText: 'New password again')),
            if (_error.isNotEmpty) ...[const SizedBox(height: 12), Note(_error)],
          ]),
        ),
        actions: [
          TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: const Text('Cancel')),
          TextButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save')),
        ],
      );
}
