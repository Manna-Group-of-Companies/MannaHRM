/* ---------------------------------------------------------------------------
   Settings → App users (22 October 2026, asked for by HR): everybody who can
   use the phone app, and a switch that stops one of them.

   The app has no accounts of its own (docs/APP_USERS.md). A person uses it by
   signing in with their own site login, which their Employee record names in
   `user_id` — so "an app user" is an Employee with a login, and stopping one is
   turning that login's `User.enabled` off. That is the lock and it is the
   site's: a client-side "no app for you" is a suggestion (CLAUDE.md §1), while
   a disabled User is refused at sign-in and Frappe ends its open sessions.

   **One login is the app and the website.** Disabling an HR login therefore
   takes the website away from them too, so the row says so; and the login
   doing the disabling is never offered the switch, since it would lock itself
   out with nobody left to undo it.

   Pure. Nothing is read or written here.
   --------------------------------------------------------------------------- */

/** Roles that open the website's HR side. A login holding one is more than an
    app user, and switching it off is more than stopping the app. */
export const WEBSITE_ROLES = ["System Manager", "HR Manager", "HR User", "Administrator"];

const later = (a, b) => (String(a || "") > String(b || "") ? a : b);

/**
 * One row per app user.
 *
 * @param {object} d
 * @param {object[]} d.employees  Employee rows: name, employee_name, employee_number, company, status, user_id
 * @param {object[]} d.users      User rows: name, enabled, last_login, last_active
 * @param {object[]|null} d.roles Has Role rows: parent, role — null when the site would not say
 * @param {object[]} d.punches    phone punches: employee, time
 * @param {string} d.me           the signed-in login
 */
export function appUserRows({ employees = [], users = [], roles = null, punches = [], me = "" }) {
	const byLogin = new Map(users.map((u) => [String(u.name).toLowerCase(), u]));
	const rolesOf = new Map();
	for (const r of roles || []) {
		const k = String(r.parent).toLowerCase();
		rolesOf.set(k, [...(rolesOf.get(k) || []), r.role]);
	}
	const lastPunch = new Map();
	for (const p of punches) lastPunch.set(p.employee, later(lastPunch.get(p.employee), p.time));

	return employees
		.filter((e) => String(e.user_id || "").trim())
		.map((e) => {
			const login = String(e.user_id).trim();
			const key = login.toLowerCase();
			const u = byLogin.get(key);
			const r = rolesOf.get(key) || [];
			const self = key === String(me || "").toLowerCase();
			return {
				employee: e.name,
				name: e.employee_name || e.name,
				code: e.employee_number || e.name,
				company: e.company || "",
				employeeStatus: e.status || "",
				login,
				/* A login the site would not show is not known to be on or off. */
				known: Boolean(u),
				enabled: u ? Number(u.enabled) === 1 : null,
				lastSignIn: u ? later(u.last_login, u.last_active) || "" : "",
				lastAppPunch: lastPunch.get(e.name) || "",
				/* null: the site would not say what the login can do. */
				website: roles === null ? null : r.some((x) => WEBSITE_ROLES.includes(x)),
				self,
			};
		})
		.sort((a, b) => Number(b.enabled === true) - Number(a.enabled === true) || String(a.name).localeCompare(String(b.name)));
}

/** Whether the switch is offered on a row, and if not, why. */
export function toggleWhy(row) {
	if (row.self) return "This is the login you are signed in with.";
	if (!row.known) return "The site would not show this login.";
	return "";
}

/** The question asked before a login is switched off or back on. */
export function toggleQuestion(row, on) {
	if (on) return `Let ${row.name} use the app again? ${row.login} will be able to sign in.`;
	const site = row.website === true
		? " This login is also HR's on the website, and loses that too."
		: row.website === null ? " If this login is also used on the website, it loses that too." : "";
	return `Stop ${row.name} using the app? ${row.login} is switched off on the site: the app refuses it at sign-in and its open sessions end.${site}`;
}

/** The tiles over the list. */
export function appUserCounts(rows) {
	return {
		all: rows.length,
		active: rows.filter((r) => r.enabled === true).length,
		stopped: rows.filter((r) => r.enabled === false).length,
		usedApp: rows.filter((r) => r.lastAppPunch).length,
	};
}
