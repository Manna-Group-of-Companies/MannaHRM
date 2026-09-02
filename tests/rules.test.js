/**
 * Tests for the rules that need no site.
 *
 * Each test states the rule in its name — a test called "filter works" teaches
 * nothing when it fails at midnight, and these are the rules somebody will be
 * arguing about when it does.
 *
 * Ported from `manna_hr/tests/test_rules.py`, case for case, when the Python
 * app was removed on 31 August 2026.
 *
 *     npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import * as rules from "../client/src/lib/rules.js";

/* ------------------------------------------------------------ day statuses */

test("a punch beats an approved leave record", () => {
	// Somebody who cancelled their leave and came in anyway must not be marked
	// on leave because the request was never withdrawn.
	assert.equal(
		rules.resolveDayStatus({
			hasPunchIn: true, hasPunchOut: true, leaveStatus: "Approved",
			isHoliday: false, isPastDay: true,
		}),
		rules.PRESENT,
	);
});

test("one punch is still in, not present", () => {
	// An open shift has no measured end, so counting it as a full day would pay
	// somebody on the strength of a missing punch.
	assert.equal(
		rules.resolveDayStatus({
			hasPunchIn: true, hasPunchOut: false, leaveStatus: null,
			isHoliday: false, isPastDay: true,
		}),
		rules.ON_FLOOR,
	);
});

test("an undecided leave request is not time off", () => {
	// Treating it as leave would let unapproved absence disappear into the
	// leave column, which is exactly the number HR is chasing.
	assert.equal(
		rules.resolveDayStatus({
			hasPunchIn: false, hasPunchOut: false, leaveStatus: "Open",
			isHoliday: false, isPastDay: true,
		}),
		rules.LEAVE_PENDING,
	);
});

test("a rejected request explains nothing", () => {
	// Decided, and the answer was no. It must not sit in the pending column
	// looking like something still being handled.
	assert.equal(
		rules.resolveDayStatus({
			hasPunchIn: false, hasPunchOut: false, leaveStatus: "Rejected",
			isHoliday: false, isPastDay: true,
		}),
		rules.ABSENT,
	);
});

test("a holiday is nobody's absence", () => {
	assert.equal(
		rules.resolveDayStatus({
			hasPunchIn: false, hasPunchOut: false, leaveStatus: null,
			isHoliday: true, isPastDay: true,
		}),
		rules.HOLIDAY,
	);
});

test("today is unmarked, not absent", () => {
	// The rule that stops the whole group being marked absent at nine in the
	// morning, every morning.
	assert.equal(
		rules.resolveDayStatus({
			hasPunchIn: false, hasPunchOut: false, leaveStatus: null,
			isHoliday: false, isPastDay: false,
		}),
		rules.UNMARKED,
	);
});

test("absent survives only when nothing else explains the day", () => {
	assert.equal(
		rules.resolveDayStatus({
			hasPunchIn: false, hasPunchOut: false, leaveStatus: null,
			isHoliday: false, isPastDay: true,
		}),
		rules.ABSENT,
	);
});

test("a period with an open shift is not payroll ready", () => {
	assert.equal(rules.isPayrollReady([rules.PRESENT, rules.ON_FLOOR, rules.ON_LEAVE]), false);
	assert.equal(rules.isPayrollReady([rules.PRESENT, rules.ON_LEAVE, rules.ABSENT]), true);
});

/* ------------------------------------------------------------ punch window */

test("the window includes both of its ends", () => {
	const opens = rules.minuteOfDay(5, 0);
	const closes = rules.minuteOfDay(21, 30);
	assert.equal(rules.isWithinPunchWindow(opens, opens, closes), true);
	assert.equal(rules.isWithinPunchWindow(closes, opens, closes), true);
	assert.equal(rules.isWithinPunchWindow(opens - 1, opens, closes), false);
	assert.equal(rules.isWithinPunchWindow(closes + 1, opens, closes), false);
});
