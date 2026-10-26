/// Where somebody lands once they are signed in — one app for everybody.
///
/// Pure, so the rule can be argued about without a phone (`test/landing_test.dart`).
///
/// **The two sides are a menu, not the security.** What HR's side shows is
/// whatever the signed-in login's roles let it read on the site; an employee
/// who reached it would find a group with nobody in it. The rule exists so an
/// ordinary employee is never shown a door that leads nowhere.
library;

enum Landing { signIn, employee, admin }

/// - Not signed in: the sign-in screen.
/// - Not HR: their own attendance, and nothing else is offered.
/// - HR: HR's side, which also carries their own punch, month, leave and
///   payslips when an Employee record is theirs — every function in one menu
///   (asked for 21 October 2026), so HR never chooses a side.
Landing landingFor({required bool signedIn, required bool isAdmin}) {
  if (!signedIn) return Landing.signIn;
  return isAdmin ? Landing.admin : Landing.employee;
}
