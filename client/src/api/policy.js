/** Manna Attendance Policy — manna_hr/attpolicy.py decides; this reads and
    saves the numbers. The site checks every one of them again on save
    (MannaAttendancePolicy.validate) and refuses numbers that disagree. */

import { apiCreate, apiWrite, getDoc, listAll } from "@/api/client";

export const POLICY = "Manna Attendance Policy";

/** Applies On, most specific first — the order the site picks a policy in. */
export const SCOPES = ["Employee", "Shift Type", "Designation", "Department", "Company"];

export const MODES = [
	"",
	"Alternating entries as IN and OUT during the same shift",
	"Strictly based on Log Type in Employee Checkin",
];
export const HOURS_FROM = ["", "First Check-in and Last Check-out", "Every Valid Check-in and Check-out"];
export const MSP = ["", "Present", "Half Day", "Absent"];
export const DEDUCT = ["Leave Without Pay", "Casual Leave, then Leave Without Pay"];
export const HOLIDAY = ["Nothing", "Overtime", "Comp off"];
export const OT_BASIS = ["Hours past the shift's length", "Before the start and after the end"];

/** A new policy: every rule off, as the site's own defaults. */
export const blank = () => ({
	policy_name: "", is_active: 1, is_default: 0, company: "", priority: 0, description: "",
	scopes: [], shift_types: [],
	check_in_out_mode: "", hours_based_on: "",
	full_day_hours: 0, half_day_below_hours: 0, absent_below_hours: 0,
	half_day_upto_percent: 0, absent_upto_percent: 0,
	break_minutes: 0, break_after_hours: 0, msp_status: "",
	late_grace_minutes: 0, late_half_day_after_minutes: 0, late_forgiven_per_month: -1,
	late_penalty_every: 1, late_penalty_days: "0.5",
	early_grace_minutes: 0, early_half_day_after_minutes: 0, early_forgiven_per_month: -1,
	early_penalty_every: 1, early_penalty_days: "0.5",
	penalty_deduct_from: DEDUCT[0], early_deduct_from: DEDUCT[0], hours_deduct_from: DEDUCT[0], casual_leave_type: "",
	ot_enabled: 0, ot_basis: OT_BASIS[0], ot_min_minutes: 0, ot_round_minutes: 0, ot_max_minutes: 0, holiday_work: HOLIDAY[0],
});

export const loadPolicies = () =>
	listAll(POLICY, ["name", "policy_name", "is_active", "is_default", "company", "priority", "modified",
		"half_day_below_hours", "absent_below_hours", "half_day_upto_percent", "absent_upto_percent", "break_minutes", "msp_status", "late_grace_minutes",
		"late_forgiven_per_month", "late_penalty_days", "early_forgiven_per_month", "ot_enabled"], []);

export const loadPolicy = (name) => getDoc(POLICY, name);

/** The fields a save sends: the form's own, child rows reduced to what they are. */
export function payload(doc) {
	const out = {};
	for (const k of Object.keys(blank())) out[k] = doc[k];
	out.scopes = (doc.scopes || []).map((r) => ({ applies_on: r.applies_on, value: String(r.value || "").trim() }));
	out.shift_types = (doc.shift_types || []).map((r) => ({ shift_type: r.shift_type }));
	return out;
}

/** Save; returns { ok, name, error }. */
export async function savePolicy(doc) {
	const body = payload(doc);
	if (doc.name) {
		const r = await apiWrite(POLICY, doc.name, body);
		return r.ok ? { ok: true, name: doc.name } : { ok: false, error: r.error };
	}
	try {
		const made = await apiCreate(POLICY, body);
		return { ok: true, name: made?.name || body.policy_name };
	} catch (e) {
		return { ok: false, error: e.message || String(e) };
	}
}

/** One plain sentence of what a policy does, for its card. Only what is set. */
export function summary(p) {
	const parts = [];
	if (Number(p.half_day_upto_percent) || Number(p.absent_upto_percent)) {
		parts.push(`absent up to ${Number(p.absent_upto_percent) || "—"}% of the shift, half day up to ${Number(p.half_day_upto_percent) || "—"}%`);
	} else if (Number(p.half_day_below_hours) || Number(p.absent_below_hours)) {
		parts.push(`half day under ${Number(p.half_day_below_hours) || "—"} h, absent under ${Number(p.absent_below_hours) || "—"} h`);
	}
	if (Number(p.break_minutes)) parts.push(`${p.break_minutes} min break`);
	if (p.msp_status) parts.push(`one punch = ${p.msp_status}`);
	if (Number(p.late_grace_minutes)) parts.push(`late after ${p.late_grace_minutes} min`);
	if (Number(p.late_forgiven_per_month) >= 0) {
		parts.push(`${p.late_forgiven_per_month} lates forgiven, then ${p.late_penalty_days} day`);
	}
	if (Number(p.early_forgiven_per_month) >= 0) {
		parts.push(`${p.early_forgiven_per_month} early goings forgiven`);
	}
	if (Number(p.ot_enabled)) parts.push("overtime counted");
	return parts.length ? parts.join(" · ") : "Every rule off: days are as hrms makes them.";
}
