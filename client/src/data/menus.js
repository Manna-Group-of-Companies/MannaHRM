/* ---------------------------------------------------------------------------
   Menus narrowed per login.

   Asked for on 16 September 2026: the Manna Rubber Products company login sees
   seven pages under Attendance and nothing else there — the register
   (Attendance Regularization: everybody down the side, the days across, added
   the same day), then In Out, Monthly, OT, Daily, Absent and Weekly.

   **This is a menu, not a permission.** It decides which tabs are drawn and
   where a hidden address lands. What the login may *read* is its roles and its
   User Permission on Company, on the site (tools/create_company_users.py); a
   page left off this list is still one URL away, and nothing on it is secret
   from this user for that reason alone. CLAUDE.md §1.

   Keyed by login, lower-case. A module missing from a login's entry is left
   whole.
   --------------------------------------------------------------------------- */

/* Asked for on 17 September 2026: the four company logins' Employees module is
   Employee Master, Calendar, Employee Profile and New Joining, and nothing else
   there — whether or not the site calls them admin. Their other modules are
   left to the rules below. */
const COMPANY_EMPLOYEES = ["overview", "calendar", "profile", "joining"];

export const USER_MENUS = {
	"mannarubber.products@mannarubber.com": {
		attendance: ["overview", "inout", "monthly", "ot", "daily", "absent", "weekly"],
		employees: COMPANY_EMPLOYEES,
	},
	"hitechrubber@mannarubber.com": { employees: COMPANY_EMPLOYEES },
	"mannatreads@mannarubber.com": { employees: COMPANY_EMPLOYEES },
	"mannatyreretreads@mannarubber.com": { employees: COMPANY_EMPLOYEES },
	/* Asked for on 24 September 2026: On Board is this login's alone (ONLY_FOR
	   below), and of it, Onboarding alone — Letters, Documents and Assets are
	   still built and still at their addresses, just not on its strip. Its
	   Employees module is still USER_ONLY's four. */
	"hr@mannarubber.com": { onboard: ["overview"], settings: ["overview", "coverage", "security"] },
};

/* Who may change which pages everybody is shown — Settings → Security, asked
   for on 29 September 2026. The site refuses anybody else the same change
   (`PAGE_ADMINS` in manna_hr/rules.py, pinned to this by tests/pagerules.test.jsx);
   this list only decides who is shown the page. */
export const PAGE_ADMINS = ["hr@mannarubber.com"];

/* Pages only the logins named are shown, whatever their menu says. */
export const PAGES_ONLY_FOR = {
	settings: { security: PAGE_ADMINS },
};

/* What a login that is not an admin is shown, asked for on 17 September 2026:
   four Employees pages and no other module. A login with its own entry in
   USER_MENUS keeps that entry. "Admin" is the site's answer — see
   `isAdmin` in api/client.js — and is `null` until it arrives, which draws the
   whole menu rather than moving an admin off a bookmarked page while the check
   is still in flight. Still a menu: what a user may read is their roles. */
export const USER_ONLY = {
	employees: ["overview", "calendar", "profile", "joining"],
};

/* What everybody who is shown a module sees of it, when neither rule above
   names that module. Asked for on 17 September 2026: the Dashboard is
   Start Up and Approvals and nothing else. The company dashboards and Product
   Updates are still built; opening one lands on Start Up. */
export const ALL_MENUS = {
	dashboard: ["overview", "approvals"],
};

/* Modules only the logins named here are shown, admin or not. Asked for on
   24 September 2026: On Board is the HR login's and nobody else's. Still a
   menu — `/onboard` is refused nothing by the site for being left off it. */
export const ONLY_FOR = {
	onboard: ["hr@mannarubber.com"],
};

const login = (user) => String(user || "").trim().toLowerCase();
const loginMenu = (user) => USER_MENUS[login(user)] || null;

/** Whether this login may be shown this page at all. */
export const pageAllowed = (section, subtab, user) => {
	const only = PAGES_ONLY_FOR[section]?.[subtab];
	return !only || only.includes(login(user));
};

/** Whether a module is on this login's rail at all. */
export const sectionFor = (section, admin, user) =>
	section in ONLY_FOR ? ONLY_FOR[section].includes(login(user))
		: admin !== false || section in USER_ONLY || Boolean(loginMenu(user)?.[section]);

/** The first page a user is sent to when they land somewhere off their menu. */
export const USER_HOME = ["employees", "overview"];

/** The subtabs this login is shown in a module, in the order given, or null
    for the module's whole menu. */
export function allowedFor(section, user, admin = null) {
	const m = loginMenu(user);
	if (m && m[section]) return m[section];
	if (admin === false) return USER_ONLY[section] || [];
	return ALL_MENUS[section] || null;
}

/** A module's tabs as this login sees them — the given order, not the module's. */
export function tabsFor(section, tabs, user, admin = null) {
	const only = allowedFor(section, user, admin);
	const mine = PAGES_ONLY_FOR[section] ? tabs.filter((t) => pageAllowed(section, t[0], user)) : tabs;
	if (!only) return mine;
	const by = new Map(mine.map((t) => [t[0], t]));
	return only.map((k) => by.get(k)).filter(Boolean);
}

/* Pages every login may open whatever its menu says, asked for on 17 September
   2026: Create Employee, behind Add New Employee on Employee Master. Reached from
   that button rather than the strip, so it adds no tab. Whether the Employee is
   actually created is the login's own roles on the site. */
export const EVERYONE = {
	employees: ["new"],
};

/** The subtab to actually draw: the one asked for when this login has it,
    otherwise the first it has. */
export function landingFor(section, subtab, user, admin = null) {
	if ((EVERYONE[section] || []).includes(subtab)) return subtab;
	const only = allowedFor(section, user, admin);
	const want = !only || only.includes(subtab) ? subtab : only[0];
	return pageAllowed(section, want, user) ? want : "overview";
}
