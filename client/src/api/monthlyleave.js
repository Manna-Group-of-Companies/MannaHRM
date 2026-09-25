import { apiCreate, apiCreateSubmitted, apiWrite, getDoc, listAll } from "@/api/client";
import {
	LEAVE_TYPE, LEAVE_TYPE_NAME, assignmentFor, isMonthly, leavePolicy, notMonthly, policyTitle,
	typeDiffers,
} from "@/lib/monthlyleave";

/* ---------------------------------------------------------------------------
   Give monthly leave: what tools/setup_monthly_leave.py does, from the page.

   Written as the signed-in person, under their own roles — an HR User or HR
   Manager can, anybody else is refused by the site. What each person gets is
   not decided here: the policy says twelve a year, hrms turns that into one on
   the 1st of each month, and the allocation it creates on submit is hrms's
   arithmetic, not this file's.
   --------------------------------------------------------------------------- */

/** The Leave Type and the Leave Policy for `perMonth` of `leaveType` a month,
    made or brought into line. Returns the policy's name. Throws the site's
    words on a refusal: nothing after this can work without both.

    Only Casual Leave is made monthly here; any other type must already be,
    and is refused otherwise — see notMonthly in lib/monthlyleave.js. */
export async function ensurePolicy(perMonth = 1, leaveType = LEAVE_TYPE_NAME) {
	if (leaveType !== LEAVE_TYPE_NAME) return otherTypePolicy(perMonth, leaveType);
	const type = await getDoc("Leave Type", LEAVE_TYPE_NAME);
	if (!type) {
		await apiCreate("Leave Type", { ...LEAVE_TYPE });
	} else {
		const patch = typeDiffers(type);
		if (Object.keys(patch).length) {
			const r = await apiWrite("Leave Type", LEAVE_TYPE_NAME, patch);
			if (!r.ok) throw new Error(`Leave Type ${LEAVE_TYPE_NAME} could not be made monthly: ${r.error}`);
		}
	}

	return findOrMakePolicy(perMonth, LEAVE_TYPE_NAME);
}

async function otherTypePolicy(perMonth, leaveType) {
	const type = await getDoc("Leave Type", leaveType);
	if (!type) throw new Error(`There is no Leave Type ${leaveType} on the site.`);
	if (!isMonthly(type)) throw new Error(notMonthly(leaveType, [type]));
	return findOrMakePolicy(perMonth, leaveType);
}

async function findOrMakePolicy(perMonth, leaveType) {
	const have = await listAll("Leave Policy", ["name"],
		[["title", "=", policyTitle(perMonth, leaveType)], ["docstatus", "=", 1]]);
	if (have.length) return have[0].name;
	const made = await apiCreateSubmitted("Leave Policy", leavePolicy(perMonth, leaveType));
	return made.name;
}

/** Give one new joiner `perMonth` leaves a month, from the Create Employee
    wizard, once the Employee exists.

    Never throws: the person is on the site by now, and a refusal here is a
    sentence on the done screen, not a reason to lose that.
    @returns {Promise<{ok: true, from: string, policy: string} | {ok: false, error: string}>} */
export async function giveNewJoinerLeave(emp, perMonth, today, leaveType = LEAVE_TYPE_NAME) {
	try {
		const policy = await ensurePolicy(perMonth, leaveType);
		const doc = assignmentFor(emp, policy, today);
		if (!doc) {
			return { ok: false, error: "They join after the end of this year, so there is no year to assign yet." };
		}
		await apiCreateSubmitted("Leave Policy Assignment", doc);
		return { ok: true, from: doc.effective_from, policy };
	} catch (e) {
		return { ok: false, error: String(e.message || e) };
	}
}

/** Give the monthly leave to each of `emps` who has no assignment this year.

    One at a time, so one refusal names one person and the rest still go.
    @returns {Promise<{given: string[], had: string[], refused: {emp: string, error: string}[]}>} */
export async function giveMonthlyLeave(emps, today, onStep = () => {}) {
	const policy = await ensurePolicy();
	const year = today.slice(0, 4);
	const held = new Set((await listAll("Leave Policy Assignment", ["employee"], [
		["docstatus", "=", 1],
		["effective_to", ">=", today],
		["effective_from", "<=", year + "-12-31"],
	])).map((r) => r.employee));

	const out = { given: [], had: [], refused: [] };
	for (const e of emps) {
		if (held.has(e.name)) {
			out.had.push(e.name);
			continue;
		}
		const doc = assignmentFor(e, policy, today);
		if (!doc) continue;
		try {
			await apiCreateSubmitted("Leave Policy Assignment", doc);
			out.given.push(e.name);
		} catch (err) {
			out.refused.push({ emp: e.name, error: String(err.message || err) });
		}
		onStep(out);
	}
	return out;
}
