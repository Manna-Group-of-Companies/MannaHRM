/* ---------------------------------------------------------------------------
   The side menu, in the HRDashboard reference's groups (21 October 2026).

   Asked for (docs/kit-pages.md, D2): the reference's menu — a green
   Dashboard button, then Employees, Checklist, Time Off, Attendance, Payroll,
   Performance and Recruitment, each opening onto its pages — with every page
   this app already has kept, under its own name and at its own address, in
   the closest group.

   **A group is a list of modules, not of pages.** Its pages are read the way
   they always were — `pagesOf`, which is `tabsFor` and `isHidden` — so a
   login's own menu (data/menus.js) and Settings → Security decide what is in a
   group exactly as they decided what was in the strip. Nothing here can offer
   a page somebody's menu would not; tests/goto.test.jsx holds it to that.

   A module named here that does not exist yet (Checklist's own pages,
   Performance, Recruitment) is skipped, and a group with nothing to show is
   left off the menu rather than drawn empty. They arrive as their sections
   are built, by adding their key to `SECTIONS` — this list already names
   them.

   Still a menu, not a permission. The site decides what a page can read.
   --------------------------------------------------------------------------- */

import { MODULES } from "@/routes/registry";
import { sectionFor, tabsFor } from "@/data/menus";
import { isHidden } from "@/data/sections";

/** The pages of one module as this login is shown them. The same list the
    strip over the page draws, so the two can never disagree. */
export function pagesOf(section, user, admin) {
	return tabsFor(section, MODULES[section]?.tabs || [], user, admin)
		.filter((t) => !isHidden(section, t[0]));
}

/** The reference's groups, in its order, with the reference's icon for each.
    `sections` are this app's modules, in the order their pages are listed.

    Where ours went: On Board is onboarding, so it is under Checklist; Survey
    is about people, so it is under Employees; Loans are money, so they are
    under Payroll. Reports and Settings are not groups in the reference — the
    first is the header's Report link and the second the menu foot's Setting —
    and their pages are switched by the strip over the page. */
export const NAV = [
	{ key: "employees", label: "Employees", icon: "users", sections: ["employees", "survey"] },
	{ key: "checklist", label: "Checklist", icon: "check", sections: ["checklist", "onboard"] },
	{ key: "timeoff", label: "Time Off", icon: "clock", sections: ["leave"] },
	{ key: "attendance", label: "Attendance", icon: "cal", sections: ["attendance"] },
	{ key: "payroll", label: "Payroll", icon: "wallet", sections: ["payroll", "loans"] },
	{ key: "performance", label: "Performance", icon: "trend", sections: ["performance"] },
	{ key: "recruitment", label: "Recruitment", icon: "brief", sections: ["recruitment"] },
];

/** Where the menu foot and the header send somebody, outside the groups. */
export const DASHBOARD = "dashboard";
export const FOOT = ["help", "settings"];
export const HEADER_LINKS = [
	{ label: "Documents", section: "documents", subtab: "overview" },
	{ label: "News", section: "news", subtab: "overview" },
	/* The signed-in person's own payslips: the header sets the find box to
	   their Employee before it goes (TopBar). */
	{ label: "Payslip", section: "payroll", subtab: "slips", mine: true },
	{ label: "Report", section: "reports", subtab: "overview" },
];

/* Where a header link goes while its own page is not built: the nearest page
   that is. Asked for on 21 October 2026 — a link that goes nowhere reads as a
   broken app, and one that opens something close reads as a shortcut. */
export const NEAREST = {
	documents: { section: "onboard", subtab: "documents" },
	news: { section: "dashboard", subtab: "overview" },
};

/** The header's links as this login is shown them, each resolved to a page
    that exists: its own, else its nearest, else left off. */
export function headerLinks(user, admin) {
	const out = [];
	for (const l of HEADER_LINKS) {
		if (MODULES[l.section]?.pages?.[l.subtab]) {
			if (shown(l.section, user, admin)) out.push(l);
			continue;
		}
		const near = NEAREST[l.section];
		if (near && shown(near.section, user, admin)) out.push({ ...l, ...near, near: true });
	}
	return out;
}

/** Whether this login is shown a module at all: on its menu, not hidden by
    Settings → Security, and a module this build has. */
export const shown = (section, user, admin) =>
	Boolean(MODULES[section]) && !isHidden(section) && sectionFor(section, admin, user);

/** The groups as this login sees them: each with the pages it holds, and
    only the groups that hold any. */
export function groupsFor(user, admin) {
	const out = [];
	for (const g of NAV) {
		const items = [];
		for (const section of g.sections) {
			if (!shown(section, user, admin)) continue;
			for (const [subtab, label] of pagesOf(section, user, admin)) items.push({ section, subtab, label });
		}
		if (items.length) out.push({ ...g, items });
	}
	return out;
}

/** The group a module belongs to, or null for one the groups do not hold
    (the Dashboard, Reports, Settings). */
export const groupOfSection = (section) => NAV.find((g) => g.sections.includes(section)) || null;

/** Whether a module's pages are listed in the side menu — and so need no
    strip over the page on a desktop. The Dashboard's are, under its button. */
export const inRail = (section) => section === DASHBOARD || Boolean(groupOfSection(section));

/** Modules whose pages list themselves on the page, as the reference's
    Settings does down its left side — no strip over them, at any width. */
export const OWN_NAV = ["settings"];

/* ---------------------------------------------------------------------------
   The phone's bottom bar: four destinations and Menu, as the reference has
   it. Its fourth is Chat, and there is no chat here (D12), so Attendance —
   the module somebody on a phone opens most — takes its place.
   --------------------------------------------------------------------------- */
export const BAR = [
	{ section: "dashboard", label: "Home", icon: "grid" },
	{ section: "employees", label: "People", icon: "users" },
	{ section: "leave", label: "Time off", icon: "clock" },
	{ section: "attendance", label: "Attendance", icon: "cal" },
];

/** The bar for this login: the four it is shown, topped up from its groups
    in menu order when it is shown fewer — a bar two buttons wide is a bar
    with nothing on it. */
export function barFor(user, admin) {
	const out = BAR.filter((b) => shown(b.section, user, admin));
	for (const g of NAV) {
		if (out.length >= BAR.length) break;
		const section = g.sections.find((s) => shown(s, user, admin) && !out.some((b) => b.section === s));
		if (section) out.push({ section, label: g.label, icon: g.icon });
	}
	return out;
}
