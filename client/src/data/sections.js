/* One nav row: the module, its coverage (a Cov), and the path of its icon glyph.

   Factor HR's own left-hand nav, in its order, so the two can be compared
   item by item. `cov` is this build's coverage of that module. */
export const SECTIONS = [
  {key:"dashboard", label:"Dashboard", cov:"part", icon:"M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"},
  {key:"onboard",   label:"On Board",  cov:"none", icon:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8M19 8v6M22 11h-6"},
  {key:"employees", label:"Employees", cov:"live", icon:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8"},
  {key:"attendance",label:"Attendance",cov:"part", icon:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2"},
  {key:"leave",     label:"Leave",     cov:"part", icon:"M3 5h18v16H3zM3 9h18M8 3v4M16 3v4"},
  {key:"payroll",   label:"Payroll",   cov:"skip", hidden:true, icon:"M6 4h9a4 4 0 0 1 0 8H6M6 8h12M9 12l5 8"},
  {key:"loans",     label:"Loans",     cov:"none", hidden:true, icon:"M4 8h16v11H4zM8 8V6a4 4 0 0 1 8 0v2M12 12v3"},
  {key:"reports",   label:"Reports",   cov:"live", icon:"M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"},
  {key:"survey",    label:"Survey",    cov:"none", hidden:true, icon:"M5 3h14v18H5zM9 8h6M9 12h6M9 16h3"},
  {key:"settings",  label:"Settings",  cov:"part", icon:"M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4.4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"},
];

/* `hidden` takes a module off the rail and sends its address to the front page.
   Payroll, Loans and Survey were hidden on 17 Sep 2026 — not deleted: their
   pages, menus and tests stay, and Settings → Module coverage still counts them.
   Like data/menus.js, this is a menu, not a permission. */
export const VISIBLE_SECTIONS = SECTIONS.filter((s) => !s.hidden);

/* Single pages hidden the same way, inside a module that is not: off the strip,
   and their address lands on the module's first page. Salary Master hidden
   17 Sep 2026; Submit Attendance 24 Sep 2026 — it waits on the app install
   anyway (CLAUDE.md §7). Profile Change Requests, Employee Detail and Category Types 24 Sep 2026.
   CTC / Earnings, Employees Directory, Weekoff Holiday Report, Organization
   Chart, Employee Letters and Statutory Reports 25 Sep 2026, asked for by IT.
   Employees → All 26 Sep 2026, the same way. */
export const HIDDEN_PAGES = {
	employees: ["salary", "changes", "detail", "cattypes", "ctc", "directory", "weekoff", "orgchart", "letters", "all"],
	attendance: ["submit", "statutory"],
};

/** Whether a module — or, given a subtab, one page of it — is hidden. */
export const isHidden = (key, subtab) =>
  SECTIONS.some((s) => s.key === key && s.hidden)
  || (subtab !== undefined && (HIDDEN_PAGES[key] || []).includes(subtab));

export const COV_LABEL = {live:"Live", part:"Partial", none:"Not built", skip:"Deferred"};

/* ---------------------------------------------------------------------------
   The rail's four headings.

   **The order of SECTIONS is not touched, and must not be.** These are breaks
   in a list, not a regrouping of it: `keys` below reads straight down the nine
   above in the order Factor HR puts them, and the rail renders a heading
   whenever the next item starts a new one. Move an item between groups and the
   item-for-item comparison this whole app exists to make quietly stops lining
   up — which is the kind of change nobody notices until they are arguing about
   a headcount.

   Nine items with no breaks in them is a list people re-read from the top every
   time. Four groups of two or three is one people learn.
   --------------------------------------------------------------------------- */
export const NAV_GROUPS = [
  { title: "Overview",  keys: ["dashboard"] },
  { title: "People",    keys: ["onboard", "employees"] },
  { title: "Time off",  keys: ["attendance", "leave"] },
  { title: "Pay",       keys: ["payroll", "loans"] },
  /* Ours, not Factor HR's — they file reports under each module, and so does
     this app; this is the one place they are also all downloadable together.
     Asked for 24 Sep 2026. */
  { title: "Reports",   keys: ["reports"] },
  { title: "Company",   keys: ["survey", "settings"] },
];

/** The heading a module sits under, or "" for one no group claims — which is
    how a section added to SECTIONS and forgotten here still reaches the rail
    rather than disappearing off it. */
export const groupOf = (key) =>
  (NAV_GROUPS.find((g) => g.keys.includes(key)) || { title: "" }).title;
