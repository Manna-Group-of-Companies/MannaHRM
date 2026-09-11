import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:manna_hr_app/screens/correction_sheet.dart';
import 'package:manna_hr_app/screens/login_screen.dart';
import 'package:manna_hr_app/screens/punch_screen.dart' show initialOf;

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

  testWidgets('the correction sheet rides above the keyboard, Send included',
      (tester) async {
    // A short phone with the keyboard up: 800 logical pixels tall, 320 of them
    // keys. Before the fix the sheet read its inset off the caller's context,
    // captured before the keyboard existed, and sat underneath it.
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (ctx) => TextButton(
            onPressed: () => showCorrectionSheet(ctx,
                iso: '2026-09-09', seedIn: '08:30', note: 'gate did not read'),
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    tester.view.viewInsets = const FakeViewPadding(bottom: 320);
    await tester.pumpAndSettle();

    final send = find.widgetWithText(FilledButton, 'Send for approval');
    await tester.ensureVisible(send);
    await tester.pumpAndSettle();
    // Above the top of the keys, so a thumb can reach it.
    expect(tester.getBottomLeft(send).dy, lessThanOrEqualTo(800 - 320));
  });

  test('an employee with a blank name still gets an avatar, not a crash', () {
    // `.characters.first` on an empty string is a StateError, and it took the
    // whole punch screen down — button included — for one blank field.
    expect(initialOf(''), '?');
    expect(initialOf('   '), '?');
    expect(initialOf(null), '?');
    expect(initialOf('ebin joy'), 'E');
  });
}
