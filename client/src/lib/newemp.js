import { NEW_EMP_ELSEWHERE, NEW_EMP_STEPS, punchesOnApp, punchesOnMachine } from "../data/employees.js";
import { ageOn, todayIso } from "./format.js";
import { LEAVE_TYPE_NAME, notMonthly, perMonthProblem } from "./monthlyleave.js";

/* ---------------------------------------------------------------------------
   What the Create Employee wizard will send, and what it refuses to send,
   worked out without a browser.

   Everything here is a pure function of what somebody typed, so the two checks
   that actually matter — a duplicate Emp Code and a duplicate Machine Code —
   can be argued about in `tests/newemp.test.js` with no site and no React. The
   posting itself is `api/employee.js`; this is only what it will do, and
   `features/employees/CreateEmployee.jsx` is only how it is asked.

   Relative imports, not the `@` alias, for exactly that reason: `npm test` runs
   these files in Node, where the alias does not exist. Same rule as
   `lib/salary.js` and `routes/paths.js`. CLAUDE.md §2.

   **None of this is enforcement.** It runs in a browser, and a rule enforced in
   a client is a suggestion to anyone holding curl — CLAUDE.md §1. The site is
   what actually validates the document. What these functions buy is the class
   of mistake the site does *not* catch, which is the machine code one below.
   --------------------------------------------------------------------------- */

/** An untouched wizard, and the only definition of what one is.

    `status` is seeded rather than left empty because a new hire is Active, and
    that is true of every record this form will ever create — a required box
    whose answer is never in doubt is a click charged for nothing. `leave_type`
    is seeded for the same reason — Casual Leave is HR's rule for everybody
    (24 September 2026) — and how many a month is left empty, because that is
    the question. Nothing else is: a default on a name, a code or a date would be a guess, and a guess
    pre-filled into a form is a guess that gets saved.

    The store holds one of these and the page resets to another, which is why it
    is a function rather than an object — two screens sharing one mutable
    literal is how a cleared form comes back holding the last hire's typing. */
export const NEW_EMP_BLANK = () => ({
	step: 0, f: { status: "Active", leave_type: LEAVE_TYPE_NAME }, busy: "", done: null, err: "",
});

/** Whether nothing has been typed yet, seeded values not counting as typing.

    What it decides is whether the page offers to clear itself and whether it
    warns that leaving keeps the draft — both of which are noise over a form
    nobody has touched. */
export function isBlank(f) {
	const seed = NEW_EMP_BLANK().f;
	return Object.keys({ ...seed, ...f })
		.every((k) => String(f[k] ?? "").trim() === String(seed[k] ?? ""));
}

/** The rows of one step, with its groups flattened away.

    A step is groups of fields and only the page cares about that: what is
    required, what will be sent and what clashes are all questions about fields.
    So the shape is unwrapped here, once, rather than at each of the four places
    that ask. */
export const fieldsOf = (step) => (NEW_EMP_STEPS[step]?.[2] || []).flatMap((g) => g[1]);

/** Every field the wizard knows how to store, flattened out of the step table.

    Built from the table rather than listed again, so a field added to a step
    reaches the payload without a second edit — the drift a second list
    guarantees. Rows with no fieldname are the ones this site has nowhere to
    put; see NEW_EMP_NOFIELD. Rows stored on another document are left out
    too; see NEW_EMP_ELSEWHERE. */
export const NEW_EMP_FIELDS = NEW_EMP_STEPS
	.flatMap((_, i) => fieldsOf(i))
	.filter((r) => r[0] && !NEW_EMP_ELSEWHERE[r[0]])
	.map((r) => r[0]);

/** What is typed, as ERPNext wants it: trimmed, and blanks left out entirely.

    Left out rather than sent empty, because an empty string is a value on a
    Link field and ERPNext validates it as one — `department: ""` is a request
    to link to a Department named "", which fails, where sending nothing at all
    simply leaves the field unset.

    Not sent at all: `employee_name`. hrms builds it from the three name fields
    on validate, and a value sent here would be overwritten on the way in. A
    field that looks set and is not is worse than one that is plainly derived. */
export function employeeDoc(f) {
	const doc = {};
	for (const k of NEW_EMP_FIELDS) {
		const v = typeof f[k] === "string" ? f[k].trim() : f[k];
		if (v !== "" && v != null) doc[k] = v;
	}
	return doc;
}

/** The required fields of one step that are still empty, by their label.

    By label rather than by fieldname because the only thing this answer is used
    for is telling somebody what to go and fill in, and `final_confirmation_date`
    is not what the box over it says. */
export function missing(step, f) {
	const rows = fieldsOf(step);
	const out = rows
		.filter((r) => r[3] && r[0] && !String(f[r[0]] ?? "").trim())
		.map((r) => r[1]);
	return out.concat(punchGaps(f).filter((g) => rows.some((r) => r[0] === g.on)).map((g) => g.label));
}

const typed = (v) => String(v ?? "").trim() !== "";

/** What the chosen Punch Method needs that is not filled in yet, with the field
    each gap belongs on so `missing` can report it on the step that holds it.

    A machine punch with no Machine Code is dropped by the bridge without a
    word (docs/NEW_EMPLOYEE.md). An app punch needs a login, and the login is
    matched to the Employee on its email (tools/setup_phone_punch.py) — so a
    phone user with no email is a phone user who can never sign in. */
export function punchGaps(f) {
	const m = f.custom_punch_method;
	const out = [];
	if (punchesOnMachine(m) && !typed(f.attendance_device_id)) {
		out.push({ on: "attendance_device_id", label: "Machine Code (needed for Fingerprint Machine)" });
	}
	if (punchesOnApp(m) && !typed(f.company_email) && !typed(f.personal_email)) {
		out.push({ on: "company_email", label: "Company Email or Personal Email (needed for Mobile App)" });
	}
	return out;
}

/** The dates that cannot all be true at once.

    Only impossibilities are listed, never anything merely unusual. A joining
    date in the future is a normal thing to type — people are hired before they
    start — and a form that argues with that is a form people learn to click
    past, which is how the real refusals stop being read. */
export function dateProblems(f) {
	const out = [];
	const dob = f.date_of_birth;
	const doj = f.date_of_joining;
	const conf = f.final_confirmation_date;

	if (dob && dob > todayIso()) out.push("Date Of Birth is in the future.");
	if (dob && doj && dob >= doj) out.push("Date Of Birth is on or after Date Of Joining.");
	/* Fourteen rather than eighteen. The floor is here to catch a mistyped year
	   — 2005 for 1905 — not to enforce employment law, which is the site's job
	   and HR's. A number set at the legal age would refuse apprentices, and
	   refusing somebody who is really there is the expensive mistake.

	   `ageOn` answers null for a pair it cannot read, and null is not a young
	   employee. Tested explicitly, because `null < 14` is true and that is the
	   shape this check would otherwise have. */
	const age = ageOn(dob, doj);
	if (age != null && age < 14) {
		out.push(`That is ${age} years old on the joining date — check the year.`);
	}
	if (conf && doj && conf < doj) out.push("Confirmation Date is before Date Of Joining.");
	return out;
}

/** Whom this record would collide with, on the two fields where a collision is
    silent. One sentence per clash, or an empty array.

    Both are checked against the employees the page already holds rather than
    against the site, which is a real limit and worth knowing: a record created
    in another tab since this page loaded will not be seen here.

    That limit is acceptable for Emp Code, where the site has its own unique
    constraint and would refuse the duplicate anyway. It is the whole point for
    **Machine Code**: `attendance_device_id` has no unique index on it, so the
    site accepts a duplicate without a word, and what happens next is that every
    punch on that finger lands on whichever of the two people the join finds
    first. Nothing downstream reports it as an error — it reports it as one
    person present and another absent. CLAUDE.md §5. */
export function clashes(f, employees) {
	const out = [];
	const rows = employees || [];
	const code = String(f.employee_number || "").trim();
	const dev = String(f.attendance_device_id || "").trim();

	if (code) {
		const twin = rows.find((e) => String(e.employee_number || "").trim() === code);
		if (twin) out.push(`Emp Code ${code} is already ${twin.employee_name} (${twin.name}).`);
	}
	if (dev) {
		/* Active only. A machine code freed by somebody who has left is a code
		   that can be issued again — refusing it would leave the numbers on a
		   fingerprint machine permanently spent, and these machines have few. */
		const twin = rows.find(
			(e) => e.status === "Active" && String(e.attendance_device_id || "").trim() === dev,
		);
		if (twin) {
			out.push(
				`Machine Code ${dev} is already on ${twin.employee_name} (${twin.name}), who is Active. `
				+ "Two active people on one code means every punch on it lands on whichever of them is "
				+ "found first.",
			);
		}
	}
	return out;
}

/** What is wrong with the leave once something is typed in it. Empty is a
    gap, not a mistake — `missing` reports that one. A type that is not
    monthly matters only when some leave is asked for: 0 of it writes nothing. */
export function leaveProblems(f, leaveTypes) {
	if (!typed(f.leaves_a_month)) return [];
	const p = perMonthProblem(f.leaves_a_month);
	if (p) return [p];
	const t = Number(f.leaves_a_month) > 0 ? notMonthly(f.leave_type, leaveTypes) : null;
	return t ? [t] : [];
}

/** Everything wrong with the form as it stands, whatever step it is on.

    One function across all three steps, so the last one cannot show a live
    Create button over a required field left empty on the first.

    `gaps` is what is merely unfinished and `bad` is what is wrong, kept apart
    because they are answered differently: an empty field is filled in, and a
    duplicate machine code means somebody has to go and find out which of two
    people owns it. */
export function problemsOf(f, employees, leaveTypes) {
	return {
		gaps: NEW_EMP_STEPS.flatMap((_, i) => missing(i, f)),
		bad: dateProblems(f).concat(clashes(f, employees), leaveProblems(f, leaveTypes)),
	};
}
