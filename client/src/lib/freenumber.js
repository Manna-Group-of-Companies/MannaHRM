/* ---------------------------------------------------------------------------
   Picking a Machine Code nobody holds.

   **A number free in ERPNext is not a number free on the machine.** On
   18 September 2026 one record was given 899, then 999, then 912, and all three
   were already somebody's on the gate — Sunit Thithiyo, Plansing A Sangma,
   Chandan Kumar, each with fingers enrolled. ERPNext held 150 numbers that day
   and the machine held 444, so a number picked by looking at ERPNext alone had
   roughly a four-in-five chance of belonging to somebody else.

   What that costs: the machine sends only the number, so the other person's
   finger pays their attendance into this record, and neither of them is told.

   So a number is free only when **both** lists say so, and when the machine's
   list cannot be read the answer is "cannot tell" — never "free". The safe
   default is the range above everything the gate has ever issued.
   --------------------------------------------------------------------------- */

/** Where suggestions start. The gate's highest user id was 1045 in September
    2026; starting well above it keeps a suggested number clear of whatever the
    gate or eSSL hands out next. */
export const SUGGEST_FROM = 9001;

const digits = (v) => String(v ?? "").trim();

/** Every number ERPNext already holds, whatever the person's status. A leaver
    still holding one still catches its punches. */
export function heldOnSite(employees) {
	const out = new Map();
	for (const e of employees || []) {
		const n = digits(e.attendance_device_id);
		if (n) out.set(n, e);
	}
	return out;
}

/** Every number the machines hold, from the roster the bridge writes. */
export function heldOnMachines(rosterRows) {
	const out = new Map();
	for (const r of rosterRows || []) {
		const n = digits(r.device_user_id);
		if (n) out.set(n, r);
	}
	return out;
}

/**
 * What is wrong with a number, as a sentence, or null.
 *
 * `machines` is null when the machines' list could not be read — and then a
 * number that looks free is reported as unchecked rather than as free.
 */
export function numberProblem(number, { site, machines }) {
	const n = digits(number);
	if (!n) return null;
	if (!/^[0-9]{1,9}$/.test(n)) {
		return { kind: "bad", text: "A machine number is plain digits, 1 to 9 of them. The machine truncates anything longer, silently." };
	}
	const taken = site?.get(n);
	if (taken) {
		return {
			kind: "site",
			text: `${n} already belongs to ${taken.name} (${taken.employee_name || "no name"}, ${taken.status || "?"}) in ERPNext.`,
		};
	}
	const onMachine = machines?.get(n);
	if (onMachine) {
		return {
			kind: "machine",
			text: `The machine ${onMachine.device_id || ""} already calls ${n} “${onMachine.name_on_device || "no name"}”.`
				+ " Their finger would pay their attendance into this record.",
		};
	}
	if (!machines) {
		return {
			kind: "unchecked",
			text: `${n} is free in ERPNext, but the machines' user lists are not on this site yet, so nothing here can say whether the gate has already given ${n} to somebody.`
				+ " Take the number from eSSL or from the machine itself.",
		};
	}
	return null;
}

/** The first number no list holds, from `from` upward. Null when the machines
    cannot be read: suggesting one then would be the same guess that caused the
    trouble, made by a computer. */
export function nextFreeNumber({ site, machines, from = SUGGEST_FROM, limit = 2000 }) {
	if (!machines) return null;
	for (let n = from; n < from + limit; n += 1) {
		const s = String(n);
		if (!site?.has(s) && !machines.has(s)) return s;
	}
	return null;
}
