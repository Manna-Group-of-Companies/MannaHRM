import { api, apiWrite, listAll } from "@/api/client";
import { PHONE_PREFIX } from "@/lib/punchplace";
import { isoAgo } from "@/lib/format";

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
	const employees = await listAll("Employee",
		["name", "employee_name", "employee_number", "company", "status", "user_id"], [["user_id", "is", "set"]], 1000);
	const logins = [...new Set(employees.map((e) => String(e.user_id || "").trim()).filter(Boolean))];
	if (!logins.length) return { employees, users: [], roles: [], punches: [] };

	const [users, roles, punches] = await Promise.all([
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
	]);
	return { employees, users, roles, punches };
}

/** Switch a login off (`on` false) or back on. Frappe ends a disabled login's
    sessions itself, so the app is out at its next request, not only its next
    sign-in. @returns {Promise<{ok: boolean, error?: string}>} */
export const setLoginEnabled = (login, on) => apiWrite("User", login, { enabled: on ? 1 : 0 });
