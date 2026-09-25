import 'package:flutter/foundation.dart';

import 'console.dart';
import 'format.dart';

/// What more than one screen needs, read once and kept.
///
/// The machine list is a read of every machine and takes seconds; the site's
/// companies and shifts change rarely. A failed read is not kept, so the next
/// screen to ask tries again.
class Shared {
  Shared(this.console);

  final Console console;

  /// The screen the menu should show — so a screen can send somebody to
  /// another, as Devices does with "Search for devices".
  final page = ValueNotifier<int>(0);

  /// Bumped when this bridge gains a machine, so a screen already drawn with
  /// the old list reads the new one without anybody pressing Refresh.
  final machinesChanged = ValueNotifier<int>(0);

  Future<Answer>? _machines;
  Future<Answer>? _choices;

  Future<Answer> machines({bool fresh = false}) {
    if (fresh || _machines == null) {
      _machines = console.get('machines')
        ..catchError((Object e) {
          _machines = null;
          return <String, dynamic>{};
        });
    }
    return _machines!;
  }

  Future<List<String>> readableMachines() async => readable(rowsOf((await machines())['machines']));

  Future<Map<String, List<String>>> choices() {
    _choices ??= console.get('choices')
      ..catchError((Object e) {
        _choices = null;
        return <String, dynamic>{};
      });
    return _choices!.then((a) => {
          for (final k in ['companies', 'genders', 'shifts', 'branches'])
            k: [for (final v in (a[k] as List? ?? const [])) '$v'],
        });
  }
}
