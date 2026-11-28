import { api, apiWrite, listAll } from "@/api/client";
import { PHONE_PREFIX } from "@/lib/punchplace";
import { isoAgo } from "@/lib/format";
import { appLoginOf } from "@/lib/appusers";

/* ---------------------------------------------------------------------------
   Settings → App users: the reads, and the one write — a login switched off
   or on. The rules are lib/appusers.js.
   --------------------------------------------------------------------------- */

/** How far back "last punched from the app" looks. A punch older than this is
    shown as none, which on this page reads the same: not using the app. */
const PUNCH_DAYS = 120;

/** Everything the page draws. Each read that is refused leaves its part empty
    rather than failing the page: roles and punches are what a row adds, the
    Employee read is the list. */
export async function loadAppUsers() {
	/* `custom_app_login` is the app's own login for somebody whose `user_id` is
	   their login into everything else (28 November 2026); a site without the
	   field yet is read without it. */
	const FIELDS = ["name", "employee_name", "employee_number", "company", "status", "user_id"];
	const employees = await listAll("Employee", [...FIELDS, "custom_app_login"], [["user_id", "is", "set"]], 1000)
		.catch(() => listAll("Employee", FIELDS, [["user_id", "is", "set"]], 1000));
	const logins = [...new Set(employees.map(appLoginOf).filter(Boolean))];
	if (!logins.length) return { employees, users: [], roles: [], punches: [], salesLogs: [] };

	const [users, roles, punches, salesLogs] = await Promise.all([
		listAll("User", ["name", "enabled", "last_login", "last_active"], [["name", "in", logins]], 1000)
			.catch(() => listAll("User", ["name", "enabled"], [["name", "in", logins]], 1000))
			.catch(() => []),
		/* A child table is read with its parent named, or Frappe refuses it. */
		api("/api/resource/Has Role", {
			parent: "User",
			fields: JSON.stringify(["parent", "role"]),
			filters: JSON.stringify([["parent", "in", logins]]),
			limit_page_length: 0,
		}).then((r) => r.data || []).catch(() => null),
		listAll("Employee Checkin", ["employee", "time"],
			[["device_id", "like", `${PHONE_PREFIX}%`], ["time", ">=", `${isoAgo(PUNCH_DAYS)} 00:00:00`]], 20000)
			.catch(() => []),
		/* The Sales app's punches (an Attendance Log is owned by the login that
		   made it), for which app each login is used in. null when the site has
		   no such doctype or would not say — "not known", not "unused". */
		listAll("Attendance Log", ["owner", "punch_in_time", "remarks", "creation"],
			[["owner", "in", [...logins, ...employees.map((e) => String(e.user_id || "").trim()).filter(Boolean)]], ["attendance_date", ">=", isoAgo(PUNCH_DAYS)]], 20000)
			.catch(() => null),
	]);
	return { employees, users, roles, punches, salesLogs };
}

/** Switch a login off (`on` false) or back on. Frappe ends a disabled login's
    sessions itself, so the app is out at its next request, not only its next
    sign-in. @returns {Promise<{ok: boolean, error?: string}>} */
export const setLoginEnabled = (login, on) => apiWrite("User", login, { enabled: on ? 1 : 0 });
