/// Rupees and months as a payslip shows them. Pure — `test/money_test.dart`.
library;

const List<String> kMonthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/// `56820` → `₹ 56,820`; `123456.5` → `₹ 1,23,456.50`. Indian grouping —
/// three, then twos — because that is how every salary sheet here is written,
/// and a lakh drawn as `123,456` is read wrong by the person it is paid to.
String rupees(Object? value) {
  final n = value is num ? value.toDouble() : double.tryParse('${value ?? ''}') ?? 0;
  final negative = n < 0;
  final fixed = n.abs().toStringAsFixed(2);
  final whole = fixed.split('.').first;
  final paise = fixed.split('.').last;
  String grouped;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    final last3 = whole.substring(whole.length - 3);
    var rest = whole.substring(0, whole.length - 3);
    final pairs = <String>[];
    while (rest.length > 2) {
      pairs.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) pairs.insert(0, rest);
    grouped = '${pairs.join(',')},$last3';
  }
  return '${negative ? '-' : ''}₹ $grouped${paise == '00' ? '' : '.$paise'}';
}

/// `2026-09-01` → `September 2026`.
String monthTitle(String iso) {
  if (iso.length < 7) return iso;
  final m = int.tryParse(iso.substring(5, 7)) ?? 0;
  if (m < 1 || m > 12) return iso;
  return '${kMonthNames[m - 1]} ${iso.substring(0, 4)}';
}
