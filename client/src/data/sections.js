import { DEFAULT_SECTION, OVERVIEW } from "@/routes/paths";

/* One nav row: the module, its coverage (a Cov), and the path of its icon glyph.

   Factor HR's own left-hand nav, in its order, so the two can be compared
   item by item. `cov` is this build's coverage of that module. */
export const SECTIONS = [
  {key:"dashboard", label:"Dashboard", cov:"part", icon:"M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"},
  {key:"onboard",   label:"On Board",  cov:"none", icon:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8M19 8v6M22 11h-6"},
  {key:"employees", label:"Employees", cov:"live", icon:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8"},
  {key:"attendance",label:"Attendance",cov:"part", icon:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2"},
  {key:"leave",     label:"Leave",     cov:"part", icon:"M3 5h18v16H3zM3 9h18M8 3v4M16 3v4"},
  {key:"payroll",   label:"Payroll",   cov:"part", icon:"M6 4h9a4 4 0 0 1 0 8H6M6 8h12M9 12l5 8"},
  {key:"loans",     label:"Loans",     cov:"none", hidden:true, icon:"M4 8h16v11H4zM8 8V6a4 4 0 0 1 8 0v2M12 12v3"},
  {key:"reports",   label:"Reports",   cov:"live", icon:"M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"},
  {key:"survey",    label:"Survey",    cov:"none", hidden:true, icon:"M5 3h14v18H5zM9 8h6M9 12h6M9 16h3"},
  /* The HRDashboard reference's two top-bar pages, 21 Oct 2026: on the site's
     own File folders and Manna Announcement. Not on the side menu — the
     reference reaches them from the top bar — and with no Factor HR item. */
  {key:"documents", label:"Documents", cov:"live", icon:"M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"},
  {key:"news",      label:"News",      cov:"live", icon:"M4 22h16a2 2 0 0 0 2-2V4H8v16a2 2 0 0 1-4 0V9h4M12 8h6M12 12h6M12 16h4"},
  {key:"settings",  label:"Settings",  cov:"part", icon:"M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4.4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"},
];

/* `hidden` takes a module off the rail and sends its address to the front page.
   Payroll, Loans and Survey were hidden on 17 Sep 2026 — not deleted: their
   pages, menus and tests stay, and Settings → Module coverage still counts them.
   Payroll came back on 29 Sep 2026, when Salary Process started running on the
   site (api/payroll.js), and was hidden again the same evening, asked for —
   shown again on 2 Oct 2026 as one guided page that runs the month, with ERPNext
   holding only its documents (features/payroll/). To hide it
   again, put `hidden:true` back on its row. Like data/menus.js, this is a menu,
   not a permission. */
export const VISIBLE_SECTIONS = SECTIONS.filter((s) => !s.hidden);

/* Single pages hidden the same way, inside a module that is not: off the strip,
   and their address lands on the module's first page. Salary Master hidden
   17 Sep 2026; Submit Attendance 24 Sep 2026 — it waits on the app install
   anyway (CLAUDE.md §7). Profile Change Requests, Employee Detail and Category Types 24 Sep 2026.
   CTC / Earnings, Employees Directory, Weekoff Holiday Report, Organization
   Chart, Employee Letters and Statutory Reports 25 Sep 2026, asked for by IT.
   Employees → All 26 Sep 2026, the same way, and Leave Availed Detail and
   Pending Leave Applications the same day — both are now a Status choice on
   Leave Application History. Payroll → Frappe Payroll 29 Sep 2026, the day it
   was built: asked for, looked at, and put away. Payroll → everything but the
   Payroll page 2 Oct 2026: the module is five custom pages of ours (Payroll,
   Salary Setup, Advances & Loans, Payslips, Bank Transfer), and the older
   screens — modelled on another system's — stay as hidden code. Attendance →
   All 5 Oct 2026, asked for by IT, the same way as Employees → All. */
export const HIDDEN_PAGES = {
	/* Directory and Organization Chart shown again 21 Oct 2026 (D15), as the
	   HRDashboard reference's Directory and Org chart. */
	employees: ["salary", "changes", "detail", "cattypes", "ctc", "weekoff", "letters", "all"],
	attendance: ["submit", "statutory", "all"],
	leave: ["availed", "pending"],
	payroll: ["adhoc", "process", "sheet", "payslip", "register", "bank", "frappe", "fnf", "itdec", "bonus", "ptax", "all"],
};

/* ---------------------------------------------------------------------------
   Settings → Security: the same two lists, changed from a screen.

   The site's `Manna HR Settings.page_visibility` holds only what somebody
   changed — `{"employees/all": "show", "leave": "hide"}` — so the lists above
   stay the defaults, and a page hidden here by a later commit is still hidden
   on a site where nobody has touched it. Still a menu, not a permission.

   **Some things cannot be hidden, because hiding them is a lock-out.** Security
   itself, and the modules a hidden address is sent to: Dashboard is where a
   hidden module lands, Employees is the whole menu of a login that is not an
   admin (data/menus.js USER_ONLY), and Settings holds the page that would undo
   it. Nor can a module's first page — a hidden page lands there, and hiding the
   module is the way to hide that.
   --------------------------------------------------------------------------- */
export const LOCKED = new Set([DEFAULT_SECTION, "employees", "settings", "settings/security"]);

/** Whether a rule may change this module or page at all. */
export const canHide = (key, subtab) =>
  subtab === undefined ? !LOCKED.has(key) : subtab !== OVERVIEW && !LOCKED.has(key + "/" + subtab);

/** The rules the site holds, cleaned: a key that names no module, a value that
    is neither word, or text that is not JSON is dropped rather than obeyed —
    a typo in Desk must not take a page off everybody's menu. */
export function parsePageRules(text) {
  let raw;
  try { raw = typeof text === "string" ? JSON.parse(text || "{}") : text; } catch { return {}; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const [key, subtab, extra] = k.split("/");
    if (extra !== undefined || !SECTIONS.some((s) => s.key === key)) continue;
    if ((v === "show" || v === "hide") && canHide(key, subtab)) out[k] = v;
  }
  return out;
}

/** Hidden under these rules, before anything the site says. */
const byCode = (key, subtab) => subtab === undefined
  ? SECTIONS.some((s) => s.key === key && s.hidden)
  : (HIDDEN_PAGES[key] || []).includes(subtab);

/** Whether one module, or one page on its own, is hidden under `rules`. */
export function hiddenUnder(rules, key, subtab) {
  if (!canHide(key, subtab)) return false;
  const rule = rules[subtab === undefined ? key : key + "/" + subtab];
  return rule === "hide" ? true : rule === "show" ? false : byCode(key, subtab);
}

/** Whether the code alone hides it — what a rule is measured against, so only
    a difference is stored. */
export const hiddenByDefault = (key, subtab) => canHide(key, subtab) && byCode(key, subtab);

/* The rules in force. Module state rather than the store's, because the router
   asks outside React; `pageRules` in the store carries the same object so that
   anything drawing a menu redraws when it changes. api/pagerules.js is the one
   place that sets both. */
let siteRules = {};
export const setPageRules = (rules) => { siteRules = rules || {}; };

/** Whether a module — or, given a subtab, one page of it — is hidden. */
export const isHidden = (key, subtab) =>
  hiddenUnder(siteRules, key, undefined)
  || (subtab !== undefined && hiddenUnder(siteRules, key, subtab));

/** The rail's modules under the rules in force. */
export const visibleSections = () => SECTIONS.filter((s) => !isHidden(s.key));

export const COV_LABEL = {live:"Live", part:"Partial", none:"Not built", skip:"Deferred"};

/* ---------------------------------------------------------------------------
   The rail's headings.

   **The order of SECTIONS is not touched, and must not be.** These are breaks
   in a list, not a regrouping of it: `keys` below reads straight down the nine
   above in the order Factor HR puts them, and the rail renders a heading
   whenever the next item starts a new one. Move an item between groups and the
   item-for-item comparison this whole app exists to make quietly stops lining
   up — which is the kind of change nobody notices until they are arguing about
   a headcount.

   Nine items with no breaks in them is a list people re-read from the top every
   time. Two groups is enough to break it, and few enough not to be read.
   --------------------------------------------------------------------------- */
export const NAV_GROUPS = [
  /* **Two headings since 6 October 2026, where there were six.** Six headings
     over eight items was a heading for every item and a half — Overview over
     Dashboard alone, Reports over Reports — and it read as a list with its own
     table of contents. With the open module's pages now listed under it, the
     rail needs fewer breaks, not more: the people side of HR, then the money
     and the running of it. */
  { title: "Workforce", keys: ["dashboard", "onboard", "employees", "attendance", "leave"] },
  { title: "Pay & admin", keys: ["payroll", "loans", "reports", "survey", "settings"] },
];

/** The heading a module sits under, or "" for one no group claims — which is
    how a section added to SECTIONS and forgotten here still reaches the rail
    rather than disappearing off it. */
export const groupOf = (key) =>
  (NAV_GROUPS.find((g) => g.keys.includes(key)) || { title: "" }).title;
