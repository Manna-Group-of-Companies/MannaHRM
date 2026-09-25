import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manna_attendance/core/console.dart';
import 'package:manna_attendance/core/shared.dart';
import 'package:manna_attendance/main.dart';
import 'package:manna_attendance/screens/machines.dart';

/// What the console would say, without a console, a machine or a site.
class FakeConsole extends Console {
  FakeConsole() : super('k');
  final asked = <String>[];

  static final Map<String, Answer> answers = {
    'bridge': {
      'state': 'Running',
      'unsent': 3,
      'devices': [
        {'device_id': 'BIO-MRP-GATE1', 'total': 90, 'unsent': 3, 'newest': '2026-09-23 09:01:00', 'last_error': null},
      ],
      'log': ['09:00 pass: 3 new, 0 sent'],
    },
    'machines': {
      'site': 'https://mannarubber.m.frappe.cloud',
      'site_clock': '2026-09-23 10:00:00',
      'machines': [
        {'name': 'BIO-MRP-GATE1', 'host': '192.168.1.201', 'port': 4370, 'reachable': true, 'users': 412, 'drift': -463},
        {'name': 'BIO-PUSH', 'host': '', 'port': 4370, 'reachable': false, 'why': 'pushes to this PC (ADMS)'},
      ],
    },
    'choices': {'companies': ['Manna Rubber'], 'genders': ['Male', 'Female'], 'shifts': ['General'], 'branches': []},
    'backups': {'files': []},
    'find': {
      'scanned': 2,
      'found': [
        {'host': '192.168.1.40', 'already': 'BIO-MRP-GATE1', 'model': 'K40', 'serial': 'CGKK1', 'users': 444},
        {'host': '192.168.1.41', 'already': '', 'model': 'K40', 'serial': 'CGKK2', 'users': 12, 'suggested': 'BIO-CGKK2'},
        {'host': '192.168.1.42', 'already': '', 'why': 'timed out'},
      ],
    },
  };
  final posted = <String, Map<String, Object?>>{};

  @override
  Future<Answer> get(String job, [Map<String, String?> args = const {}]) async {
    asked.add(job);
    return answers[job] ?? <String, dynamic>{};
  }

  @override
  Future<Answer> post(String job, Map<String, Object?> body) async {
    asked.add(job);
    posted[job] = body;
    return {'ok': true, 'said': 'Done.'};
  }
}

void main() {
  testWidgets('every screen opens against a small site, and none of them throws', (tester) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final console = FakeConsole();
    await tester.pumpWidget(MaterialApp(home: Home(Shared(console))));
    await tester.pumpAndSettle();
    expect(find.text('Running'), findsOneWidget);

    for (final page in pages.skip(1)) {
      await tester.tap(find.text(page.$1).first);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: page.$1);
    }

    // The bridge screen polls; take it away so no timer outlives the test.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('the devices screen says how far a clock is out, in words', (tester) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(home: Home(Shared(FakeConsole()))));
    await tester.tap(find.text('Devices'));
    await tester.pumpAndSettle();
    expect(find.text('7m 43s slow'), findsOneWidget);
    expect(find.text('ADMS push'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a program that cannot find the bridge says why, and offers to try again', (tester) async {
    await tester.pumpWidget(MannaAttendance(open: () async => throw const Refused(r'No bridge found in C:\MannaBridge.')));
    await tester.pumpAndSettle();
    expect(find.text(r'No bridge found in C:\MannaBridge.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  test('the button on Devices goes to the search screen, wherever the menu puts it', () {
    expect(pages[searchPage].$1, 'Search devices');
  });

  test('a found machine reads as connected, already added, or not answering', () {
    expect(foundState({'host': 'a'}), 'Connected');
    expect(foundState({'host': 'a', 'already': 'BIO-1'}), 'Already added as BIO-1');
    expect(foundState({'host': 'a', 'why': 'timed out'}), 'Did not answer');
  });

  testWidgets('search, pick the one new machine that answered, add it, and Devices reads again', (tester) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final console = FakeConsole();
    final shared = Shared(console);
    var reread = 0;
    shared.machinesChanged.addListener(() => reread++);
    await tester.pumpWidget(MaterialApp(home: Home(shared)));
    await tester.tap(find.text('Devices'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Search for devices'));
    await tester.pumpAndSettle();
    expect(find.text('Search and add devices'), findsOneWidget);

    await tester.tap(find.text('Search the network'));
    await tester.pumpAndSettle();
    expect(find.text('Already added as BIO-MRP-GATE1'), findsOneWidget);
    expect(find.text('Did not answer'), findsOneWidget);
    // The only new machine that answered is picked, and named, by itself.
    expect(find.text('192.168.1.41 — Connected, K40'), findsOneWidget);

    await tester.tap(find.text('Add this machine'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Yes'));
    await tester.pumpAndSettle();
    expect(console.posted['add-machine'], containsPair('host', '192.168.1.41'));
    expect(console.posted['add-machine'], containsPair('name', 'BIO-CGKK2'));
    expect(reread, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('connect with no address says where to find one, and asks nothing', (tester) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final console = FakeConsole();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: AddDeviceScreen(Shared(console)))));
    await tester.tap(find.text('Connect'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Menu > Comm > Ethernet'), findsOneWidget);
    expect(console.asked, isNot(contains('find')));
  });
}
