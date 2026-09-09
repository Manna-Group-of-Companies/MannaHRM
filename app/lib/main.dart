import 'package:flutter/material.dart';

import 'package:manna_hr_app/app.dart';

/// Manna HR — the phone half of the attendance system.
///
/// Punch in, punch out, the month behind them, and the correction that fixes a
/// day the machines missed. Everything it writes goes straight to the ERPNext
/// site as the person signed in; nothing here decides anything (CLAUDE.md §1).
void main() => runApp(const MannaHrApp());
