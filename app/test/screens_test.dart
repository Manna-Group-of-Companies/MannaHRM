import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:manna_hr_app/screens/correction_sheet.dart';
import 'package:manna_hr_app/screens/login_screen.dart';

/// The screens open, and the one control that can quietly lose somebody's day
/// is refused before it is pressed.
///
/// A component that throws takes the whole screen with it, and on a phone that
/// reads as the app being broken rather than as one widget being wrong. These
/// are cheap and they are the check nothing else makes.
void main() {
  setUp(() {
    // `AuthStore` reads this on the first frame of the sign-in screen. Without
    // it the plugin channel has nothing behind it and the screen never settles.
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('the sign-in screen draws the two boxes somebody signs in with',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home: LoginScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Manna HR'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Email / user id'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Password'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
  });

  testWidgets('the site box is folded away until somebody asks for it',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home: LoginScreen()));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(TextField, 'Site URL'), findsNothing);
    await tester.tap(find.text('Site'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'Site URL'), findsOneWidget);
  });

  testWidgets('a correction with no time and no reason cannot be sent',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (ctx) => TextButton(
            onPressed: () => showCorrectionSheet(ctx, iso: '2026-09-09'),
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('Correction for 09/09/2026'), findsOneWidget);
    // Refused before the press, with the reason on screen — a request carrying
    // neither a time nor a reason is not asking an approver for anything.
    expect(
      find.text(
          'A correction with neither time in it is not asking for anything.'),
      findsOneWidget,
    );
    final send = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Send for approval'));
    expect(send.onPressed, isNull);
  });

  testWidgets('the correction sheet says it does not mark the day',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (ctx) => TextButton(
            onPressed: () =>
                showCorrectionSheet(ctx, iso: '2026-09-09', seedIn: '08:30'),
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    // The sentence is the whole reason this form is not called "fix my day".
    expect(find.textContaining('It does not mark the day'), findsOneWidget);
    expect(find.text('08:30'), findsOneWidget);
  });
}
