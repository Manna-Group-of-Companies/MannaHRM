import { apiCreateSubmitted, apiWrite } from "@/api/client";
import { load } from "@/api/load";
import { loadRegMonth } from "@/api/attendance";

/* ---------------------------------------------------------------------------
   Giving one person a shift, from their month on Attendance Regularization
   (16 September 2026). Two ways, because they mean different things:

     · **Working time** — `Employee.default_shift`. Every day from now on,
       wherever nothing more specific says otherwise.
     · **Shift for dates** — a submitted `Shift Assignment` from one date to
       another (or open-ended). It beats the working time on those days, which
       is how a week of night shift is given without changing anybody's
       normal hours.

   The site checks both: roles, and hrms refuses an assignment that overlaps an
   active one for the same person. Its words are shown as they came.
   --------------------------------------------------------------------------- */

export async function setWorkingTime(emp, shift, ym) {
	const r = await apiWrite("Employee", emp.name, { default_shift: shift || null });
	if (!r.ok) return { ok: false, msg: `The site refused the working time: ${r.error}` };
	await load();
	if (ym) await loadRegMonth(emp.name, ym, true);
	return { ok: true, msg: `${emp.employee_name}'s working time is now ${shift || "none"}.` };
}

export async function addShiftForDates(emp, { shift, from, to }, ym) {
	if (!shift) return { ok: false, msg: "Choose the shift." };
	if (!from) return { ok: false, msg: "Choose the date it starts." };
	if (to && to < from) return { ok: false, msg: "The end date is before the start date." };
	try {
		const made = await apiCreateSubmitted("Shift Assignment", {
			employee: emp.name, employee_name: emp.employee_name, company: emp.company,
			department: emp.department || undefined,
			shift_type: shift, start_date: from, end_date: to || undefined, status: "Active",
		});
		if (ym) await loadRegMonth(emp.name, ym, true);
		return { ok: true, msg: `${made && made.name ? made.name + ": " : ""}${shift} from ${from}${to ? ` to ${to}` : " onwards"}.` };
	} catch (e) {
		return { ok: false, msg: `The site refused the shift: ${e.message}` };
	}
}
