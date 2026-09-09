import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isRealCoordinate, metresBetween } from "../src/lib/geo.js";
import { resolveDayStatus } from "../src/lib/rules.js";

/* ---------------------------------------------------------------------------
   The rules that exist twice, asserted from one file.

   `shared/fixtures/` holds the cases; this loads them and runs them against
   `lib/rules.js` and `lib/geo.js`. The server's
   `manna_hr/tests/test_shared_fixtures.py` loads exactly the same JSON and
   asserts exactly the same answers.

   `shared/README.md` says when to start using that directory: the first time a
   rule is written twice. These two are — the server decides, and these copies
   exist so a screen can answer without a round trip — and the sales repo next
   door learned what happens without this: two implementations of the discount
   ceiling disagreed within a day of each other, and a careful prose document
   did not stop it.

   **A case fails here in the same words it fails on the server**, so the name
   in the output is enough to find the disagreement without opening anything.

   Read from disk rather than imported: `shared/` is outside this package and
   outside Vite's root, and a JSON import would be bundled — which is the one
   thing that would let this copy go stale while still passing.

   Resolved from `process.cwd()` and not from `import.meta.url`. Vite rewrites a
   test module's URL to its own `/@fs/` form, so `new URL("../..", …)` resolves
   to a path that does not exist and the suite fails to collect with an ENOENT
   naming a directory nobody wrote. Vitest runs from `client/`, which is what
   the `..` below is relative to.
   --------------------------------------------------------------------------- */

const load = (name) =>
	JSON.parse(readFileSync(resolve(process.cwd(), "../shared/fixtures", name), "utf8"));

const dayStatus = load("day_status.json");
const geo = load("geo.json");

describe("shared: where one person stood on one day", () => {
	for (const c of dayStatus.cases) {
		it(c.name, () => {
			const got = resolveDayStatus({
				hasPunchIn: c.given.has_punch_in,
				hasPunchOut: c.given.has_punch_out,
				leaveStatus: c.given.leave_status,
				isHoliday: c.given.is_holiday,
				isPastDay: c.given.is_past_day,
			});
			/* The `why` goes into the failure, because a name alone still leaves
			   the next reader deciding which implementation is the wrong one. */
			expect(got, c.why).toBe(c.then);
		});
	}
});

describe("shared: how far apart two points are", () => {
	for (const c of geo.distances) {
		it(c.name, () => {
			const got = metresBetween(c.from[0], c.from[1], c.to[0], c.to[1]);
			expect(Math.abs(got - c.metres), c.why).toBeLessThanOrEqual(c.tolerance);
		});
	}
});

describe("shared: what counts as a coordinate", () => {
	for (const c of geo.coordinates) {
		it(c.name, () => {
			expect(isRealCoordinate(c.lat, c.lng), c.why).toBe(c.then);
		});
	}
});

it("every shared case says why it exists", () => {
	/* `shared/README.md` makes this a rule of the directory: a case named
	   `case_7` teaches nothing when it fails at midnight, and the sentence is
	   the point. Asserted rather than trusted, because the next person adding a
	   case will be in a hurry. */
	for (const group of [dayStatus.cases, geo.distances, geo.coordinates]) {
		for (const c of group) {
			expect(c.name).toBeTruthy();
			expect(c.why, `unexplained case: ${c.name}`).toBeTruthy();
		}
	}
});
