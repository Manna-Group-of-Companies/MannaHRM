# Shared rule fixtures

Empty on purpose, for now.

There is currently **one** implementation of every rule — `manna_hr/`, on the
server — so a rule cannot drift from itself and a fixture would only restate
what `manna_hr/tests` already asserts.

That changes the moment the phone app re-implements a rule to give a fast error
message before the round trip. The sales repo next door learned this the
expensive way: two implementations of the discount ceiling disagreed within a
day of each other, and a careful prose document did not stop it. See
`C:\SALES_DASHBOARD\shared\README.md`.

## When to start using this

Add a fixture here the first time a rule is written twice — in Dart or
TypeScript as well as Python. Both suites load the same JSON and assert the same
expectations, so a divergence becomes a build failure rather than something a
worker finds in their payslip.

Two rules for this directory, carried over:

- **A fixture is added only once both sides agree.** An open question belongs in
  `docs/OPEN_QUESTIONS.md`, not in a fixture where it would silently make one
  implementation the winner.
- **Every case carries a `why`.** A case named `case_7` teaches nothing when it
  fails at midnight; the sentence is the point.
