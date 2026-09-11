/* The date boundaries, in the timezone this office actually runs in.

   A suite running in UTC cannot see any of these bugs — local and UTC agree
   there, and every assertion below passes against the broken code. So the
   timezone is set here rather than assumed: these are the rules for Kochi, and
   Kochi is where the punches come from. */

process.env.TZ = "Asia/Kolkata";

import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { isoAgo, monthEnd, monthStart, nowStamp, thisMonth, todayIso } from "@/lib/format";

const at = (iso) => vi.setSystemTime(new Date(iso));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the month boundary", () => {
	test("month_end_is_the_last_day_of_the_month_not_the_one_before_it", () => {
		// The one that was wrong every day of the year, not only at the edges.
		at("2026-09-09T17:30:00+05:30");
		expect(monthEnd()).toBe("2026-09-30");
	});

	test("month_end_knows_a_31_day_month", () => {
		at("2026-08-09T17:30:00+05:30");
		expect(monthEnd()).toBe("2026-08-31");
	});

	test("month_end_knows_february_in_a_leap_year", () => {
		at("2028-02-09T17:30:00+05:30");
		expect(monthEnd()).toBe("2028-02-29");
	});
});

describe("before half past five in the morning", () => {
	/* UTC+5:30 means local midnight is 18:30 UTC the day before, so everything
	   from 00:00 to 05:29 named the wrong day. That window is the night shift
	   and the early gate. */

	test("today_is_today_for_somebody_opening_the_app_at_half_past_midnight", () => {
		at("2026-09-10T00:30:00+05:30");
		expect(todayIso()).toBe("2026-09-10");
	});

	test("the_first_of_the_month_at_two_in_the_morning_is_not_last_month", () => {
		at("2026-10-01T02:00:00+05:30");
		expect(thisMonth()).toBe("2026-10");
		expect(monthStart()).toBe("2026-10-01");
	});

	test("a_week_ago_is_counted_in_local_days", () => {
		at("2026-10-01T02:00:00+05:30");
		expect(isoAgo(7)).toBe("2026-09-24");
	});

	test("a_log_line_carries_the_local_time_it_was_written_at", () => {
		// 02:00 local read back as 20:30 the previous evening, which reads as
		// somebody filing a correction the night before they filed it.
		at("2026-10-01T02:00:00+05:30");
		expect(nowStamp()).toBe("2026-10-01 02:00");
	});
});

describe("the ordinary case is unchanged", () => {
	test("an_afternoon_in_the_middle_of_the_month_reads_the_same_as_it_always_did", () => {
		at("2026-09-09T17:30:00+05:30");
		expect(todayIso()).toBe("2026-09-09");
		expect(thisMonth()).toBe("2026-09");
		expect(monthStart()).toBe("2026-09-01");
		expect(nowStamp()).toBe("2026-09-09 17:30");
	});
});
