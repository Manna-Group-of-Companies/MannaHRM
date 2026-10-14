/* ---------------------------------------------------------------------------
   The employee hierarchy — seven levels, and who sits on each.

   The rule is manna_hr/hierarchy.py and this is its copy: the levels in order,
   and the words of a designation that put a job on one. tests/hierarchy.test.js
   reads the Python and fails if the two drift. Pure.

   A level is **read off `Employee.grade`** (an hrms Employee Grade, one of the
   seven) and **suggested off the designation** where the grade is blank. The
   two are kept apart all the way to the screen: a suggestion is drawn as one
   until HR saves it, because a chart that shows a guess as a fact is a chart
   somebody acts on.
   --------------------------------------------------------------------------- */

/** Top down. The index is the rank. */
export const LEVELS = [
	"Executive Director",
	"Vice President",
	"Head",
	"Manager",
	"Assistant Manager",
	"In-charge",
	"Trainee",
];

/** Tried in this order — Assistant Manager before Manager. See the Python. */
export const LEVEL_WORDS = [
	["EXECUTIVE DIRECTOR", "Executive Director"],
	["VICE PRESIDENT", "Vice President"],
	["ASSISTANT MANAGER", "Assistant Manager"],
	["ASST MANAGER", "Assistant Manager"],
	["GENERAL MANAGER", "Head"],
	["HEAD", "Head"],
	["MANAGER", "Manager"],
	["IN CHARGE", "In-charge"],
	["INCHARGE", "In-charge"],
	["TRAINEE", "Trainee"],
];

export const wordsOf = (designation) =>
	String(designation || "").replace(/[.,/\-]+/g, " ").toUpperCase().split(/\s+/).filter(Boolean).join(" ");

/** The level a designation names, or "" — a job with no rung on this ladder. */
export function levelOf(designation) {
	const text = ` ${wordsOf(designation)} `;
	for (const [words, level] of LEVEL_WORDS) if (text.includes(` ${words} `)) return level;
	return "";
}

export const rank = (level) => (LEVELS.includes(level) ? LEVELS.indexOf(level) : LEVELS.length);

const byName = (a, b) => String(a.employee_name || "").localeCompare(String(b.employee_name || ""));

/**
 * Everybody onto the chart.
 *
 * @param {object[]} employees  the (scoped) Employee rows
 * @returns {{tiers: {level: string, held: object[], suggested: object[]}[],
 *            unplaced: object[], stray: object[]}}
 *   `held` sit on the rung by their grade; `suggested` by their designation
 *   only; `unplaced` match neither and are listed under the chart; `stray`
 *   hold a grade that is none of the seven, which the chart cannot draw and
 *   must not hide.
 */
export function placeAll(employees) {
	const tiers = LEVELS.map((level) => ({ level, held: [], suggested: [] }));
	const unplaced = [];
	const stray = [];
	for (const e of (employees || []).filter((x) => x.status === "Active").sort(byName)) {
		if (e.grade && LEVELS.includes(e.grade)) tiers[rank(e.grade)].held.push(e);
		else if (e.grade) stray.push(e);
		else {
			const level = levelOf(e.designation);
			if (level) tiers[rank(level)].suggested.push(e);
			else unplaced.push(e);
		}
	}
	return { tiers, unplaced, stray };
}

/** The writes that make every suggestion a grade: `[name, {grade}]`. */
export const suggestedWrites = (placed) =>
	placed.tiers.flatMap((t) => t.suggested.map((e) => [e.name, { grade: t.level }]));

/* ---------------------------------------------------------------------------
   The group chart (10 October 2026, second ask): the head office on top, an
   arrow to every company under it. Clicking the head office opens the ladder
   above for its people; clicking any other company lists only its office
   staff — the floor is not drawn there, on purpose.
   --------------------------------------------------------------------------- */

/** The Company that is the head office. By name, because the site has one
    and the chart has to know which node goes on top; a site whose company is
    named otherwise falls back to the first whose name says so. */
export const HEAD_OFFICE = "Manna Group Headquarters";

export function headOfficeOf(companies) {
	const names = (companies || []).map((c) => (typeof c === "string" ? c : c.name));
	if (names.includes(HEAD_OFFICE)) return HEAD_OFFICE;
	return names.find((n) => /head\s*quarters|head\s*office/i.test(n)) || names[0] || "";
}

/** The companies under the head office, in the order the site lists them. */
export const branchesOf = (companies) => {
	const head = headOfficeOf(companies);
	return (companies || []).map((c) => (typeof c === "string" ? c : c.name)).filter((n) => n && n !== head);
};

/**
 * Office staff: the same people Casual Leave calls office (lib/monthlyleave.js),
 * plus anybody the ladder has a rung for — so a Head of Maintenance is office
 * staff even though the leave rule does not list the designation.
 */
export const isOfficeStaff = (e, officeGroup) =>
	Boolean(levelOf(e.designation)) || officeGroup(e.designation) === "Office";

export const activeOf = (employees, company) =>
	(employees || []).filter((e) => e.status === "Active" && e.company === company).sort(byName);

/**
 * The flow chart for one company (third ask, 10 October 2026): the levels
 * top down, each a box of people with an arrow to the next — and only the
 * levels somebody is on, because a chain of seven empty boxes says nothing.
 *
 * The head office draws everybody; any other company draws office staff only
 * (`officeOnly`). Whoever has no level goes in one last box so the chart still
 * adds up to the people it was given.
 *
 * @returns {{boxes: {level: string, held: object[], suggested: object[]}[],
 *            rest: object[], stray: object[]}}
 */
export function flowOf(people, { officeOnly = false, officeGroup = () => "", keep = [] } = {}) {
	const rows = officeOnly ? (people || []).filter((e) => isOfficeStaff(e, officeGroup)) : people;
	const placed = placeAll(rows);
	/* `keep` is levels drawn even with nobody on them — a seat somebody left
	   (lib/vacancy.js) is still a seat on its level. */
	return {
		boxes: placed.tiers.filter((t) => t.held.length || t.suggested.length || keep.includes(t.level)),
		rest: placed.unplaced,
		stray: placed.stray,
	};
}

/**
 * The head office's chart, as HR laid it out (10 October 2026): the General
 * Manager on the first row, and on the second, side by side, HR and the
 * department heads. Each seat is filled by Emp Code; a seat with no code is
 * drawn "Not assigned" rather than left out, so a missing head is visible.
 *
 * **Chart only.** The people keep their Employee records where they are — pay
 * and leave stay with the company that holds them — and are left off their own
 * company's chart so nobody is drawn twice.
 *
 * The codes were picked off the live site's designations on 10 October 2026;
 * Logistics, R&D and Plant Head had nobody whose designation says so.
 */
export const HEAD_OFFICE_CHART = [
	["General Manager", [["General Manager", "MT-001"]]],
	["Department heads", [
		["HR", "MT-003"],
		["Logistics", ""],
		["Sales", "MRP-167"],
		["Purchase", "HPT-003"],
		["Operations", "HPT-075"],
		["R&D", ""],
		["Plant Head", ""],
		["Maintenance Head", "MRP-306"],
		["Accounts", "HPT-052"],
	]],
];

/** Every Emp Code seated on the head office chart. */
export const HEAD_OFFICE_ALSO = new Set(HEAD_OFFICE_CHART.flatMap(([, seats]) => seats.map(([, code]) => code)).filter(Boolean));

/** The head office chart filled in: `{label, seats: [{role, e}]}` per row —
    `e` is the Employee row, or null where the seat is not assigned or that
    person is not Active. */
export function headOfficeSeats(employees) {
	const byCode = new Map((employees || []).filter((e) => e.status === "Active")
		.map((e) => [String(e.employee_number || ""), e]));
	return HEAD_OFFICE_CHART.map(([label, seats]) => ({
		label,
		seats: seats.map(([role, code]) => ({ role, e: (code && byCode.get(code)) || null })),
	}));
}

export const CHART_HIDDEN = new Set(["MHQ-001"]);

/** One company's people for the chart: the head office gets its own plus
    HEAD_OFFICE_ALSO; every other company gets its own minus them. */
export function peopleOf(employees, company, head) {
	const also = (e) => HEAD_OFFICE_ALSO.has(String(e.employee_number || ""));
	const rows = (employees || []).filter((e) => e.status === "Active" && !CHART_HIDDEN.has(String(e.employee_number || "")));
	const mine = company === head
		? rows.filter((e) => e.company === company || also(e))
		: rows.filter((e) => e.company === company && !also(e));
	return mine.sort(byName);
}
