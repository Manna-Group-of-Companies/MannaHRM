import 'package:flutter_test/flutter_test.dart';
import 'package:manna_hr_app/services/device.dart';

void main() {
  test('a phone is its maker, its model and its Android version', () {
    expect(describeDevice('Samsung', 'SM-A145F', 'Android 14'), 'Samsung SM-A145F · Android 14');
  });

  test('a model that already names its maker does not name it twice', () {
    expect(describeDevice('vivo', 'vivo 1906', 'Android 11'), 'vivo 1906 · Android 11');
    expect(describeDevice('Google', 'Pixel 7', 'Android 15'), 'Google Pixel 7 · Android 15');
    expect(describeDevice('realme', 'REALME RMX3085', 'Android 13'), 'REALME RMX3085 · Android 13');
  });

  test('a phone that says nothing is an empty line, not a row of dots', () {
    expect(describeDevice('', '', ''), '');
    expect(describeDevice(' ', 'RMX3085', ''), 'RMX3085');
  });
}
