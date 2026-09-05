import { dmy, dmyTime, tidyDept } from "@/lib/format";
/* ---------------------------------------------------------------------------
   Factor HR's Leave menu, read off the tenant on 29 Aug 2026:

   > Apply Leave · Leave Balance Report · All

   Three items, against Attendance's eight — which is itself the finding. Leave
   in this tenant is one form and one report, and the report is the one we
   already hold. See docs/FACTOHR_SCREENS.md §24.

   Content, not code: the notes are hand-written HTML because several need an
   arrow or a <code> span, and they are authored here rather than coming off
   the wire — which is the whole of why rendering them as HTML is safe.
   --------------------------------------------------------------------------- */
/* Apply Leave, photographed 29 August 2026 — the form, its calendar, the
   legend under it, and the Leave History table below. Two columns: the
   application on the left, the month and the team on the right.

   The field list is still the deliverable on a page that cannot submit, so it
   stays at the bottom of the screen. What changed is that it is now a list of
   *their* fields rather than the doctype's: where the two differ, that
   difference is the finding.

   `live` means the control is bound to something real, not that anything is
   written. Nothing on this form reaches the site. */

/** The two LEAVE VALUE dropdowns, one against each date. Factor HR asks for a
    value per end of the range; Frappe HR carries one `half_day` flag and one
    `half_day_date`, so a range that is half a day at *both* ends cannot be
    represented on the doctype at all. The form says so where it happens rather
    than rounding somebody's leave silently. */
export const LEAVE_VALUES = [["1", "Full Day"], ["0.5f", "First Half"], ["0.5s", "Second Half"]];

/** Their legend, in their order and their words — `WeekOff` and
    `UnApprovedLeave` included, unspaced as they write them.

    `fill` is the swatch; `from` is what answers it here, and two of the seven
    have nothing that can. Kept in the legend anyway: a colour dropped from a
    key is a gap nobody can see. */
export const LV_LEGEND = [
  ["absent",   "Absent",           "#EF6C6C", "Attendance rows marked Absent — the site holds none yet"],
  ["weekoff",  "WeekOff",          "#26252A", "the employee's holiday list, rows flagged weekly off"],
  ["unappr",   "UnApprovedLeave",  "#F2D24B", "a Leave Application still Open"],
  ["partial",  "Partial",          "#F0932B", "a half day — <code>half_day_date</code> on the application"],
  ["holiday",  "Holiday",          "#6C63FF", "the employee's holiday list, named holidays"],
  ["appr",     "ApprovedLeave",    "#918D93", "a Leave Application that has been Approved"],
  ["opthol",   "OptionalHoliday",  "#7A3E1D",
   "<b>nothing here can fill this.</b> A stock ERPNext <code>Holiday</code> row carries a date, a description and a weekly-off flag — there is no optional flag on it, and no second list of optional days. Factor HR treats optional holidays as a category somebody picks from; rebuilding that is a decision, not a query"],
];

/** Leave History, in their column order. `Applied` is the posting date and
    `Last Action By / On` are the doctype's own `modified_by` / `modified` —
    which is who touched the row last, not necessarily who approved it. On a
    submitted-and-approved application they are the same person; on one edited
    afterwards they are not, and that is worth knowing before this column is
    read as an approval trail. */
export const LEAVE_HISTORY_COLS = [
  ["Leave Type",     r => r.leave_type || "—",        ""],
  ["From Date",      r => dmy(r.from_date),                 "mono"],
  ["Till Date",      r => dmy(r.to_date),                   "mono"],
  ["Day(s) / Hour(s)", r => (r.total_leave_days ?? "—"), "mono"],
  ["Applied",        r => dmy(r.posting_date || r.creation), "mono"],
  ["Status",         r => r.status || "—",            ""],
  ["Last Action By", r => r.modified_by || "—",       "muted"],
  ["Last Action On", r => dmyTime(r.modified),              "mono"],
];

export const APPLY_FIELDS = [
  ["Search Employee", "Link &rarr; Employee", "live",
   "Whose leave this is. Their control carries the same coloured status dot as every other screen, and it filters the same way"],
  ["Document No", "Data", "none",
   "Assigned by the site from the naming series when the row is saved. It reads <b>-</b> on their unsaved form too"],
  ["Date Of Application", "Date", "live", "<code>posting_date</code> &mdash; today"],
  ["Leave Type", "Link &rarr; Leave Type", "live",
   "Read off the site. Casual Leave and LWP are the two in real use"],
  ["Available Balance", "Float", "none",
   "<b>0 on their screen and 0 here, for the same reason on neither side.</b> Frappe HR computes it from a Leave Allocation, and no leave type has an entitlement, so there is nothing to allocate. This is the number an application is measured against"],
  ["From Date / Till Date", "Date", "live", "Inclusive of both ends"],
  ["Leave Value, per date", "Select", "live",
   "Full Day / First Half / Second Half against each date. Frappe HR carries one <code>half_day</code> flag and one <code>half_day_date</code>, so <b>a range that is half a day at both ends has nowhere to go on the doctype</b> &mdash; the form says so instead of rounding it"],
  ["Remarks", "Small Text", "live", "<code>description</code> on the doctype"],
  ["Attachment", "File", "none",
   "Their form takes a file. Attaching one writes a <code>File</code> row on the site and links it to the application, and this page proxies GET only &mdash; see <code>server/index.js</code>"],
  ["Email Notification To", "Link &rarr; Employee", "none",
   "Who is told. ERPNext notifies the <code>leave_approver</code>, which nobody has set &mdash; so the reporting manager is offered and labelled as the inference it is"],
  ["Calendar", "—", "part",
   "Their month grid, and five of its seven colours can be answered from the site. Absent needs generated Attendance and OptionalHoliday needs a field ERPNext does not have"],
  ["Other Team Member On Leave", "—", "part",
   "Who else is off over the same dates. The team is read as everybody reporting to the same manager, falling back to the same department &mdash; Factor HR's own definition of a team has not been seen"],
  ["Leave History", "—", "live",
   "Every application for the chosen person, any status, read from the site when they are picked"],
  ["Status", "Open / Approved / Rejected / Cancelled", "live",
   "An application raised here would land as <b>Open</b> and appear on Dashboard &rarr; Approvals &rarr; Leave"],
];

/* ---------------------------------------------------------------------------
   Leave Balance Report — the form, photographed 29 Aug 2026.

   Their screen carries the same toolbar the three attendance reports carry, so
   the controls on it are not restated here: Particular Employee, Employee
   Status and Filter By are the shared ones and are drawn from the shared lists.
   What is below is only what this report has of its own.
   --------------------------------------------------------------------------- */

/** Their Layout Options box holds one chip on this report, where Daily Detail's
    holds two. Kept as a list rather than a boolean because it is the same
    control, and a second chip appearing there should be one line here. */
export const LVB_LAYOUT = [["logo", "With Logo"]];

/** The output, in the order Factor HR's own Leave Balance Report reads.

    Three of the seven cannot be filled and are drawn anyway, marked `gone`:

    - **Entitled** and **Balance** need an entitlement per person per type. In
      ERPNext that is `Leave Allocation` and the ledger under it — a doctype
      that is *not* on the proxy allowlist, and one the site holds none of. Two
      separate reasons, either of which alone is enough; see `loadLeaveBalances`
      in `api/load.js` for why adding it to the allowlist is not this report's
      decision to take.
    - So **Availed is the only one of Factor HR's figures this side can answer**,
      and it is answered honestly: approved applications, clipped at the As On
      Date. That is the whole finding of this screen, and it is drawn as three
      empty columns rather than written in a footnote, because a column that is
      missing is a column nobody argues about.

    A blank column is not the same as a zero, and the two are drawn apart. */
export const LVB_COLS = [
  ["Employee Code", (r) => r.emp.employee_number || "—", "mono"],
  ["Employee Name", (r) => r.emp.employee_name || r.emp.name, ""],
  ["Department", (r) => tidyDept(r.emp.department), ""],
  ["Leave Type", (r) => r.type, ""],
  ["Entitled", () => "—", "mono gone"],
  ["Availed", (r) => r.availed.toFixed(1), "mono"],
  ["Balance", () => "—", "mono gone"],
];
