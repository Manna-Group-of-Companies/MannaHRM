/* One nav row: the module, its coverage (a Cov), and the path of its icon glyph.

   Factor HR's own left-hand nav, in its order, so the two can be compared
   item by item. `cov` is this build's coverage of that module. */
export const SECTIONS = [
  {key:"dashboard", label:"Dashboard", cov:"part", icon:"M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"},
  {key:"onboard",   label:"On Board",  cov:"none", icon:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8M19 8v6M22 11h-6"},
  {key:"employees", label:"Employees", cov:"live", icon:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8"},
  {key:"attendance",label:"Attendance",cov:"part", icon:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2"},
  {key:"leave",     label:"Leave",     cov:"part", icon:"M3 5h18v16H3zM3 9h18M8 3v4M16 3v4"},
  {key:"payroll",   label:"Payroll",   cov:"skip", icon:"M6 4h9a4 4 0 0 1 0 8H6M6 8h12M9 12l5 8"},
  {key:"loans",     label:"Loans",     cov:"none", icon:"M4 8h16v11H4zM8 8V6a4 4 0 0 1 8 0v2M12 12v3"},
  {key:"survey",    label:"Survey",    cov:"none", icon:"M5 3h14v18H5zM9 8h6M9 12h6M9 16h3"},
  {key:"settings",  label:"Settings",  cov:"part", icon:"M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4.4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"},
];

export const COV_LABEL = {live:"Live", part:"Partial", none:"Not built", skip:"Deferred"};
