/* ---------------------------------------------------------------------------
   Settings → App users (22 October 2026, asked for by HR): everybody who can
   use the phone app, and a switch that stops one of them.

   The app has no accounts of its own (docs/APP_USERS.md). A person uses it by
   signing in with their own site login, which their Employee record names in
   `user_id` — so "an app user" is an Employee with a login, and stopping one is
   turning that login's `User.enabled` off. That is the lock and it is the
   site's: a client-side "no app for you" is a suggestion (CLAUDE.md §1), while
   a disabled User is refused at sign-in and Frappe ends its open sessions.

   **The app's own login, when there is one** (28 November 2026). Somebody
   whose `user_id` is their login into everything else — the sales app, the
   desk, their own email and password — signs in to the app with a second
   login on `custom_app_login`: Emp Code and date of birth. That one is the
   row's login, and stopping it leaves their own login exactly as it is.

   **Otherwise one login is the app and the website.** Disabling an HR login therefore
   takes the website away from them too, so the row says so; and the login
   doing the disabling is never offered the switch, since it would lock itself
   out with nobody left to undo it.

   Pure. Nothing is read or written here.
   --------------------------------------------------------------------------- */

/** Roles that open the website's HR side. A login holding one is more than an
    app user, and switching it off is more than stopping the app. */
export const WEBSITE_ROLES = ["System Manager", "HR Manager", "HR User", "Administrator"];

/** The login the app signs in with: the app's own when there is one, else `user_id`. */
export const appLoginOf = (e) => String(e?.custom_app_login || e?.user_id || "").trim();

const later = (a, b) => (String(a || "") > String(b || "") ? a : b);

/**
 * One row per app user.
 *
 * @param {object} d
 * @param {object[]} d.employees  Employee rows: name, employee_name, employee_number, company, status, user_id
 * @param {object[]} d.users      User rows: name, enabled, last_login, last_active
 * @param {object[]|null} d.roles Has Role rows: parent, role — null when the site would not say
 * @param {object[]} d.punches    phone punches: employee, time
 * @param {object[]|null} d.salesLogs Attendance Log rows (owner, punch_in_time, remarks) — the Sales app's
 *                                    punches; null when the site would not say
 * @param {string} d.me           the signed-in login
 */
export function appUserRows({ employees = [], users = [], roles = null, punches = [], salesLogs = null, me = "" }) {
	const byLogin = new Map(users.map((u) => [String(u.name).toLowerCase(), u]));
	const rolesOf = new Map();
	for (const r of roles || []) {
		const k = String(r.parent).toLowerCase();
		rolesOf.set(k, [...(rolesOf.get(k) || []), r.role]);
	}
	const lastPunch = new Map();
	for (const p of punches) lastPunch.set(p.employee, later(lastPunch.get(p.employee), p.time));
	/* The Sales app, by what it writes: an Attendance Log is owned by whoever
	   was signed in when it was made. A row HR corrected on the desk is HR's
	   hand and not the rep's phone, so it does not count as the app. */
	const lastSales = new Map();
	for (const l of salesLogs || []) {
		if (/^Corrected by HR/i.test(String(l.remarks || ""))) continue;
		const k = String(l.owner || "").toLowerCase();
		lastSales.set(k, later(lastSales.get(k), l.punch_in_time || l.creation));
	}

	return employees
		.filter((e) => appLoginOf(e))
		.map((e) => {
			const login = appLoginOf(e);
			const own = String(e.custom_app_login || "").trim() ? String(e.user_id || "").trim() : "";
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
				/* Their own login, beside the app's: never touched from here. */
				ownLogin: own,
				/* A login the site would not show is not known to be on or off. */
				known: Boolean(u),
				enabled: u ? Number(u.enabled) === 1 : null,
				lastSignIn: u ? later(u.last_login, u.last_active) || "" : "",
				lastAppPunch: lastPunch.get(e.name) || "",
				/* Which app, from what it wrote (APPS): in the order they are
				   named, each with when it was last used. null: not known. */
				apps: appsUsed(lastPunch.get(e.name) || "", salesLogs === null ? null : lastSales.get((own || login).toLowerCase()) || ""),
				/* null: the site would not say what the login can do. */
				website: own ? false : roles === null ? null : r.some((x) => WEBSITE_ROLES.includes(x)),
				self,
			};
		})
		.sort((a, b) => Number(b.enabled === true) - Number(a.enabled === true) || String(a.name).localeCompare(String(b.name)));
}

/** The apps a login is used in, by name, each with its last use — `[]` when it
    is in none of them in the window, so the row can say "not used" rather
    than leave a gap. `sales` null means the Sales app's records could not be
    read, which is "not known" and shown so, never as unused. */
export function appsUsed(hr, sales) {
	const out = [];
	if (hr) out.push({ app: "HR app", last: hr });
	if (sales) out.push({ app: "Sales app", last: sales });
	return out;
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
	if (row.ownLogin) {
		return `Stop ${row.name} using the app? ${row.login} is switched off on the site: the app refuses it at sign-in and its open sessions end. ${row.ownLogin} is not changed.`;
	}
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
		/* Used in more than one app — the logins worth knowing about before one
		   is stopped, since Stop ends all of them. */
		bothApps: rows.filter((r) => r.apps.length > 1).length,
	};
}
