import 'package:flutter_test/flutter_test.dart';
import 'package:manna_hr_app/services/address.dart';

void main() {
  test('an address is its parts in order, joined by commas', () {
    expect(describeAddress(['4F6J+23R', 'Perumbavoor', 'Kerala', '683542']),
        '4F6J+23R, Perumbavoor, Kerala, 683542');
  });

  test('a part the geocoder repeats is printed once', () {
    expect(describeAddress(['4F6J+23R', '4F6J+23R', 'Perumbavoor', 'perumbavoor', 'Kerala']),
        '4F6J+23R, Perumbavoor, Kerala');
  });

  test('blank and missing parts are left out, so nothing reads as ", ,"', () {
    expect(describeAddress([null, '', '  ', 'Kerala', null]), 'Kerala');
    expect(describeAddress([null, '']), '');
  });
}
