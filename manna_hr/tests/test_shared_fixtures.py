"""The rules that exist twice, asserted from one file.

`shared/fixtures/` holds the cases; this loads them and runs them against
`rules.py` and `geo.py`. The dashboard's `client/tests/shared.test.js` loads
exactly the same JSON and asserts exactly the same answers.

That is the whole point of the directory, and `shared/README.md` says when to
start using it: the first time a rule is written twice. The day-status order and
the distance arithmetic are each written twice — here, and again in
`client/src/lib/` so a screen can answer without a round trip — and a careful
prose document did not stop the sales repo's two implementations of a discount
ceiling disagreeing within a day of each other.

**A case fails here in the same words it fails in the other suite**, so the name
in the output is enough to find the disagreement without opening anything.

Run without a bench:

    python -m pytest manna_hr/tests -q
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from manna_hr import geo  # noqa: E402
from manna_hr import rules  # noqa: E402

FIXTURES = os.path.join(
	os.path.dirname(__file__), "..", "..", "shared", "fixtures"
)


def _load(name):
	with open(os.path.join(FIXTURES, name), encoding="utf-8") as f:
		return json.load(f)


DAY_STATUS = _load("day_status.json")
GEO = _load("geo.json")


def _ids(cases):
	return [c["name"] for c in cases]


@pytest.mark.parametrize(
	"case", DAY_STATUS["cases"], ids=_ids(DAY_STATUS["cases"])
)
def test_shared_day_status_case(case):
	given = case["given"]
	got = rules.resolve_day_status(
		has_punch_in=given["has_punch_in"],
		has_punch_out=given["has_punch_out"],
		leave_status=given["leave_status"],
		is_holiday=given["is_holiday"],
		is_past_day=given["is_past_day"],
	)
	# The `why` goes into the failure, because a name alone still leaves the
	# next reader deciding which of the two implementations is the wrong one.
	assert got == case["then"], case["why"]


@pytest.mark.parametrize(
	"case", GEO["distances"], ids=_ids(GEO["distances"])
)
def test_shared_distance_case(case):
	got = geo.metres_between(
		case["from"][0], case["from"][1], case["to"][0], case["to"][1]
	)
	assert abs(got - case["metres"]) <= case["tolerance"], case["why"]


@pytest.mark.parametrize(
	"case", GEO["coordinates"], ids=_ids(GEO["coordinates"])
)
def test_shared_coordinate_case(case):
	got = geo.is_real_coordinate(case["lat"], case["lng"])
	assert got is case["then"], case["why"]


def test_every_shared_case_says_why_it_exists():
	# `shared/README.md` makes this a rule of the directory: a case named
	# `case_7` teaches nothing when it fails at midnight, and the sentence is
	# the point. Asserted rather than trusted, because the next person adding a
	# case will be in a hurry.
	for group in (DAY_STATUS["cases"], GEO["distances"], GEO["coordinates"]):
		for case in group:
			assert case.get("name"), "every case is named"
			assert case.get("why"), "every case says why: {0}".format(case.get("name"))
