/**
 * Every page this site has, in one table.
 *
 * This used to be three tables spread down App.jsx — the menus, the components
 * they dispatch to, and the nav rail in `data/sections.js` — and keeping them
 * in step was on whoever remembered. `MODULES` joins them at load: a module
 * with a menu entry and no page, or a page nobody can reach, is now visible in
 * one place instead of three.
 *
 * It is also what the URLs are built from. `routes/router.js` reads this to
 * turn `/employees/salary` into a page and back again, so adding a page here
 * gives it an address without touching anything else.
 */

import { SECTIONS } from "@/data/sections";
import { COMPANY_PAGES } from "@/data/companies";
import { OVERVIEW, DEFAULT_SECTION } from "@/routes/paths";

import Home from "@/features/dashboard/Home";
import Updates from "@/features/dashboard/Updates";
import { AttendanceDash, HrDash, PayrollDash } from "@/features/dashboard/CompanyDash";
import companyDashboard from "@/features/dashboard/companyDashboard";
import moduleAll from "@/features/shared/ModuleAll";
import report from "@/features/reports/makeReport";
import { blueprintPages } from "@/features/reports/makeBlueprint";
import { managedPages, managedTabs } from "@/features/records/makeManaged";
import Approvals from "@/features/approvals/Approvals";
import Onboarding from "@/features/onboard/Onboarding";
import LetterForm from "@/features/onboard/LetterForm";
import Documents from "@/features/onboard/Documents";
import Assets from "@/features/onboard/Assets";
import AssetAssign from "@/features/onboard/AssetAssign";
import SalaryMaster from "@/features/employees/SalaryMaster";
import SalaryRevision from "@/features/employees/SalaryRevision";
import EmployeeDetail from "@/features/employees/EmployeeDetail";
import EmployeeProfile from "@/features/employees/EmployeeProfile";
import Ctc from "@/features/employees/Ctc";
import Categories from "@/features/employees/Categories";
import Calendar from "@/features/employees/Calendar";
import EmployeeMaster from "@/features/employees/EmployeeMaster";
import CreateEmployee from "@/features/employees/CreateEmployee";
import ImportOnboarding from "@/features/employees/ImportOnboarding";
import Regularization from "@/features/attendance/Regularization";
import { AbsentReport, OtReport, WeeklyReport } from "@/features/attendance/RangeReports";
import SubmitAttendance from "@/features/attendance/SubmitAttendance";
import InOut from "@/features/attendance/InOut";
import AppPunches from "@/features/attendance/AppPunches";
import DailyDetail from "@/features/attendance/DailyDetail";
import MonthlyBasic from "@/features/attendance/MonthlyBasic";
import MonthlySummary from "@/features/attendance/MonthlySummary";
import Statutory from "@/features/attendance/Statutory";
import Shifts from "@/features/attendance/Shifts";
import ApplyLeave from "@/features/leave/ApplyLeave";
import LeaveMonthly from "@/features/leave/LeaveMonthly";
import LeaveBalances from "@/features/leave/LeaveBalances";
import PayrollRun from "@/features/payroll/PayrollRun";
import SalarySetup from "@/features/payroll/SalarySetup";
import ActualSalary from "@/features/payroll/ActualSalary";
import EmployeeImport from "@/features/employees/EmployeeImport";
import HierarchyChart from "@/features/employees/HierarchyChart";
import CompanyChart from "@/features/employees/CompanyChart";
import Increments from "@/features/payroll/Increments";
import AdvancesLoans from "@/features/payroll/AdvancesLoans";
import Payslips from "@/features/payroll/Payslips";
import BankSheet from "@/features/payroll/BankSheet";
import Adhoc from "@/features/payroll/Adhoc";
import FrappePayroll from "@/features/payroll/FrappePayroll";
import SalaryProcess from "@/features/payroll/SalaryProcess";
import SalarySheet from "@/features/payroll/SalarySheet";
import FnF from "@/features/payroll/FnF";
import ITDeclarations from "@/features/payroll/ITDeclarations";
import BankTransfer from "@/features/payroll/BankTransfer";
import BonusReport from "@/features/payroll/BonusReport";
import Payslip from "@/features/payroll/Payslip";
import SalaryRegister from "@/features/payroll/SalaryRegister";
import ProfTax from "@/features/payroll/ProfTax";
import LoanApplication from "@/features/loans/LoanApplication";
import LoanRegister from "@/features/loans/LoanRegister";
import LoanProjection from "@/features/loans/LoanProjection";
import Survey from "@/features/simple/Survey";
import ReportsHub from "@/features/reports/ReportsHub";
import Settings from "@/features/settings/Settings";
import Coverage from "@/features/settings/Coverage";
import Security from "@/features/settings/Security";
import CompanyDocuments from "@/features/documents/Documents";
import News from "@/features/news/News";

/* Factor HR's second-level menus, under the module each belongs to, in its
   order. Only pages the tenant has actually been seen to have are listed:
   Survey is absent because nobody has captured its sub-menu yet, and an
   invented menu is worse than a missing one. Loans was in that sentence too
   until its menu was screenshotted on 29 Aug 2026.

   Employees is Factor HR's seven, in its order, and then one it has no menu
   item for, appended rather than interleaved so the first seven still compare
   item for item.

   **Employee Profile** does exist there, but as a *record page* reached by
   clicking somebody rather than as a menu item — which is how it is reached
   here too. It is on the bar as well because a screen with no way back to it
   after a refresh is a screen people conclude is gone.

   **Reporting lines** was the second appended page and was removed on 29 Aug
   2026. It reported the six active employees with no Reporting Manager — a
   real finding, and one that now has nowhere of its own to be said. The field
   itself is untouched: Approvals still routes on it and still calls out a
   request nobody owns, and Apply Leave still offers it in place of the leave
   approver nobody has set. */
const TABS = {
	/* Factor HR's Welcome page has three tabs — Start Up, Approvals, Product
	   Updates — and read on 8 September 2026 there is **no Engagement tab**.
	   Mood Analysis, Wish Celebration, CEO Speak, Announcements and Important
	   Files are all panels on Start Up itself. So the Engagement page here went
	   and its contents moved onto the front page, which is where somebody
	   comparing the two screens will look for them.

	   **Their three come first and the four company dashboards are appended**,
	   not interleaved — the reason the Employees and Leave menus below give, that
	   the items Factor HR also has should still compare item for item. These four
	   have no counterpart there at all, because Factor HR is one tenant per
	   company and this is one site for the whole group; that difference is the
	   entire reason these pages exist. `data/companies.js` is the table. */
	/* `overview` is the HRDashboard reference's Dashboard since 21 October 2026
	   (D16), at the address Start Up had; Start Up's panels are the foot of its
	   Layout 2, so nothing on them went. */
	dashboard: [["overview", "Overview"], ["approvals", "Approvals"],
		/* The three company dashboards, asked for 16 Sep 2026 — no Factor HR menu
		   item behind them, so they sit after Approvals rather than among theirs. */
		["hr", "HR Dashboard"], ["attendance", "Attendance Dashboard"], ["payroll", "Payroll Dashboard"],
		...managedTabs("dashboard"), ["updates", "Product Updates"],
		...COMPANY_PAGES.map((c) => [c.slug, c.label])],
	/* `overview` is now Onboarding, the employee's own Google Form entry point,
	   asked for 22 September 2026 — see Onboarding.jsx. The three that used to
	   be here are still real pages (`documents`, `assets`, `assignment` — Create
	   Letter / Form moved under `letters`) but are hidden from this bar, per the
	   same ask: one visible onboarding page rather than four. Nothing was
	   deleted — `PAGES.onboard` below still answers all four addresses, so a
	   bookmark or a link out of `all` still opens, and `OFF_MENU` is not the
	   right list for them because they still have a strip on the pages that
	   still reach them the ordinary way; they are simply not offered here. */
	onboard: [["overview", "Onboarding"],
		...managedTabs("onboard"), ["all", "All"]],
	/* Employees is Factor HR's own menu, in its order, and then Employee Profile
	   appended — that one exists there as a *record page* reached by clicking
	   somebody rather than as a menu item, which is how it is reached here too.
	   It is on the bar as well because a screen with no way back to it after a
	   refresh is a screen people conclude is gone.

	   **Employee Master was removed on 4 September 2026 and put back the same
	   day**, and `All` went with it and did not come back — that one was the
	   only page in this module with no screen of Factor HR's behind it, an
	   appended index counting statuses off records already loaded. Reporting
	   Manager was the other appended page and went on 29 Aug 2026. So the seven
	   below are their menu items plus Employee Profile, and nothing invented. */
	employees: [["overview", "Employee Master"], ["salary", "Salary Master"], ["detail", "Employee Detail"],
		/* Categories was hidden from this bar on 24 Sep 2026, asked for by IT —
		   the same way On Board's three are above: `PAGES.employees` still
		   answers `/employees/categories`, so the link on All still opens it. */
		["ctc", "CTC / Earnings"], ["calendar", "Calendar"],
		["profile", "Employee Profile"],
		/* Five of their Employees reports, built 8 Sep 2026 off data the site
		   already holds. Their menu titles, so the tab reads as theirs. */
		["joining", "New Joining"],
		["directory", "Employees Directory"], ["weekoff", "Weekoff Holiday Report"],
		["orgchart", "Organization Chart"],
		/* The seven-level ladder, asked for 10 October 2026. Not theirs: Factor
		   HR's Organization Chart is the reports_to tree above. */
		["hierarchy", "Hierarchy Chart"], ...managedTabs("employees"), ["all", "All"]],
	/* Factor HR's own Attendance menu, captured 28 Aug 2026, item for item and
	   in its order. `overview` is Attendance Regularization because that is the
	   first item on their menu and the one page here with a live queue behind
	   it — so clicking Attendance in the nav lands on it. */
	attendance: [["overview", "Employee Attendance Regularization"], ["submit", "Submit Attendance"],
		["inout", "In Out Activities Report"], ["daily", "Daily Detail Attendance Report"],
		["monthly", "Monthly Basic Attendance"], ["summary", "Monthly Summary Attendance"],
		["statutory", "Statutory Reports"],
		["shifts", "Manage Shift"],
		["present", "Present Report"], ["absent", "Absent Report"], ["msp", "MSP Report"],
		["iocount", "In / Out Count Report"], ["shiftrep", "Employee Shift Report"],
		["headcount", "Head Count And Attendance"],
		/* Two of ours, asked for 16 Sep 2026 — see features/attendance/RangeReports.
		   A third, asked for 21 Sep 2026: the phone app's own punches, sliced out
		   of In Out Activities Report rather than read as a second query. */
		["ot", "OT Report"], ["weekly", "Weekly Report"],
		["app", "App Punches"], ...managedTabs("attendance"), ["all", "All"]],
	/* Factor HR's own Leave menu, captured 29 Aug 2026 — three items where
	   Attendance has eight, which is the finding rather than a gap on our side.
	   `overview` is Apply Leave because it is the first item on their menu, so
	   clicking Leave in the nav lands on it. `all` has no menu item there and is
	   appended rather than interleaved, so the first two still compare item for
	   item. */
	leave: [["overview", "Apply Leave"], ["balances", "Leave Balance Report"],
		["history", "Leave Application History"], ["pending", "Pending Leave Applications"],
		["availed", "Leave Availed Detail"], ["monthly", "Leave Monthly Availed"], ["all", "All"]],
	/* Factor HR's Payroll menu, captured 29 Aug 2026, in its order. The capture
	   starts at Adhoc Payments/Deductions — whatever sits above it there has not
	   been seen — so that is where this menu starts too, and `overview` is it:
	   clicking Payroll in the rail lands on the first item of their own menu,
	   the way On Board, Attendance and Leave already do.

	   Their menu says Final Settlement where §1 read the same screen as
	   "F&F Summary"; their name is the one on the tab. */
	/* Frappe Payroll, 29 Sep 2026 — the payroll hrms already runs on the site.
	   It opened the module for an afternoon and was hidden the same day (see
	   HIDDEN_PAGES in data/sections.js). 2 Oct 2026: `overview` is now the Payroll
	   page — one guided page that runs the month (features/payroll/PayrollRun.jsx)
	   — beside four more of ours: Salary Setup, Advances & Loans, Payslips and
	   Bank Transfer. The older tabs are hidden, not deleted. 5 Oct 2026:
	   Increments, January's raises from HR's Excel sheet. */
	payroll: [["overview", "Payroll"], ["setup", "Salary Setup"], ...managedTabs("payroll"), ["increments", "Increments"], ["advances", "Advances & Loans"], ["slips", "Payslips"],
		["transfer", "Bank Transfer"], ["adhoc", "Adhoc Payments/Deductions"], ["process", "Salary Process"],
		["sheet", "Salary Sheet"], ["payslip", "Salary Payslip"], ["register", "Salary Register"],
		["bank", "Bank Transfer"], ["frappe", "Frappe Payroll"], ["fnf", "Final Settlement"],
		["itdec", "IT Declarations"], ["bonus", "Bonus Working Report"], ["ptax", "Prof. Tax Statement"], ["all", "All"]],
	/* Captured 29 Aug 2026, the menu and nothing else. None of the four pages
	   under it has been opened, and no doctype on this site can hold a loan, so
	   each is a reading of what the name has to mean rather than a copy. */
	loans: [["overview", "Loan Application"], ["register", "Loan Register"],
		["projection", "Loan Projection"], ...managedTabs("loans"), ["all", "All"]],
	survey: [["overview", "Survey"], ...managedTabs("survey")],
	reports: [["overview", "All Reports"]],
	documents: [["overview", "Documents"]],
	news: [["overview", "News"]],
	/* Security is ours, 29 Sep 2026: which pages everybody is shown, for the
	   one login in data/menus.js PAGE_ADMINS and nobody else's strip. */
	settings: [["overview", "Setup readiness"], ["coverage", "Module coverage"], ["security", "Security"]],
};

/* One entry per page. Nested by module so the dispatch reads in the same shape
   as SUBTABS above and the two cannot drift apart unnoticed — a subtab with no
   page here falls back to the module's overview rather than blanking. */
const PAGES = {
	dashboard: { overview: Home, approvals: Approvals, updates: Updates,
		hr: HrDash, attendance: AttendanceDash, payroll: PayrollDash,
		...managedPages("dashboard"),
		/* One page per company, at `/dashboard/<abbr>` — `/dashboard/mt` is Manna
		   Treads. Each is the same Start Up with its company pinned instead of
		   read off the top-bar picker; see features/dashboard/companyDashboard. */
		...Object.fromEntries(COMPANY_PAGES.map((c) => [c.slug, companyDashboard(c)])) },
	/* `overview` is Create Letter / Form, the first tab: clicking On Board resets
	   to the one page with real work on it. Candidate Master was dropped on
	   3 Sep 2026 — no doctype behind it — and is now a row on All rather than a
	   page, which is where a decision like that belongs.

	   **All came back on 8 Sep 2026, on every module, and it is a different
	   page from the one that went.** The one that went said "the pages are on
	   the bar above". This one is Factor HR's whole menu for the module, read
	   off their tenant, with what answers each item here — 160 items against
	   this app's 39 pages. See components/ModuleMenu.jsx. */
	onboard: { overview: Onboarding, letters: LetterForm, documents: Documents,
		assets: Assets, assignment: AssetAssign, all: moduleAll("onboard", "On Board"),
		...managedPages("onboard"), ...blueprintPages("onboard") },
	employees: { overview: EmployeeMaster, salary: SalaryMaster, detail: EmployeeDetail, ctc: Ctc,
		categories: Categories, calendar: Calendar,
		profile: EmployeeProfile, new: CreateEmployee, import: ImportOnboarding, upload: EmployeeImport,
		joining: report("employees", "joining"),
		directory: report("employees", "directory"), weekoff: report("employees", "weekoff"),
		orgchart: report("employees", "orgchart"),
		hierarchy: HierarchyChart,
		chart: CompanyChart,
		all: moduleAll("employees", "Employees"),
		...managedPages("employees"), ...blueprintPages("employees") },
	attendance: { overview: Regularization, submit: SubmitAttendance, inout: InOut,
		daily: DailyDetail, monthly: MonthlyBasic, summary: MonthlySummary, statutory: Statutory,
		shifts: Shifts,
		/* Absent reads the day it is asked about; the spec version read today's
		   punches whatever date was picked. */
		present: report("attendance", "present"), absent: AbsentReport,
		ot: OtReport, weekly: WeeklyReport,
		msp: report("attendance", "msp"), iocount: report("attendance", "iocount"),
		shiftrep: report("attendance", "shiftrep"), headcount: report("attendance", "headcount"),
		app: AppPunches,
		all: moduleAll("attendance", "Attendance"),
		...managedPages("attendance"), ...blueprintPages("attendance") },
	leave: { overview: ApplyLeave, balances: LeaveBalances,
		history: report("leave", "history"), pending: report("leave", "pending"),
		availed: report("leave", "availed"), monthly: LeaveMonthly,
		all: moduleAll("leave", "Leave"),
		...blueprintPages("leave") },
	payroll: { overview: PayrollRun, setup: SalarySetup, increments: Increments, advances: AdvancesLoans, slips: Payslips, transfer: BankSheet, adhoc: Adhoc, frappe: FrappePayroll, sheet: SalarySheet, process: SalaryProcess, fnf: FnF,
		itdec: ITDeclarations, bank: BankTransfer, bonus: BonusReport, payslip: Payslip,
		register: SalaryRegister, ptax: ProfTax, all: moduleAll("payroll", "Payroll"),
		...managedPages("payroll"), ...blueprintPages("payroll"),
		/* The list, with HR's sheet uploaded above it (14 Oct 2026). */
		actualsalary: ActualSalary },
	loans: { overview: LoanApplication, register: LoanRegister,
		projection: LoanProjection, all: moduleAll("loans", "Loans"),
		...managedPages("loans"), ...blueprintPages("loans") },
	survey: { overview: Survey, ...managedPages("survey"), ...blueprintPages("survey") },
	reports: { overview: ReportsHub },
	documents: { overview: CompanyDocuments, folder: CompanyDocuments },
	news: { overview: News, item: News, new: News, edit: News },
	settings: { overview: Settings, coverage: Coverage, security: Security },
};
/* A page opened from another page rather than from a menu.

   Factor HR's Salary Master + works this way: the revision form takes the whole
   window and the master behind it is gone until you come back. So it is
   dispatched where the other pages are dispatched, rather than drawn inside
   one — and the subtab strip goes with it.

   **Hiding the strip is the point, not tidiness.** It switches page on one
   click, and this form holds figures that exist nowhere else until they are
   exported: a strip left live above it is a way to lose a half-typed pay
   revision to a mis-click. The way back is one labelled control that says what
   it is leaving.

   Returns the element to draw, or null for the ordinary dispatch. Kept as one
   function so `Body` and `SubBar` cannot disagree about whether a full page is
   up — they are the two halves of the same answer. */
export function fullPage(s) {
	/* Only from Salary Master. The flag survives leaving the screen — `rev` is
	   deliberately not cleared on navigation, because `rev.by` holds figures
	   that exist nowhere else — so without this test a form left open would
	   seize the window the next time anybody opened the module. */
	if (!s.rev.open || s.section !== "employees" || s.subtab !== "salary") return null;
	/* Null when nobody is picked, and that is a state the form draws rather than
	   a reason not to open it: it asks who it is for at its own top. Null also
	   covers a picked name the employee list no longer holds — a company filter
	   changed under a form left open — which reads the same way and asks again. */
	return <SalaryRevision emp={(s.sal.emp && s.byName[s.sal.emp]) || null} />;
}
/* A page with an address but no menu item, reached from a control on another
   page. `{ section: [subtab, …] }`, the same shape as everything else here.

   **The strip goes with it**, for the reason `fullPage` above gives — a form
   holding several steps of typing must not sit under a row of one-click page
   switches. This is the other way of doing that, and the difference is the URL:
   Salary Revision is a store flag and has no address, so it cannot be linked to
   or refreshed back into. Create Employee has one, `/employees/new`, which is
   what CLAUDE.md §4 asks for — anything reachable has an address.

   So a page listed here is dispatched by `pageFor` like any other, and only the
   strip treats it differently. That is why it is a set of names rather than
   another `fullPage` branch: nothing here has to know what the page is.

   **`import` is the second one**, added 4 Sep 2026: Employee Master's ⋯ →
   Import From Onboarding, at `/employees/import`. It has no half-typed form to
   lose, so the argument above for hiding the strip is weaker here — it is
   listed anyway because it is reached the same way Create Employee is, from a
   control on Employee Master, and two pages that arrive by the same route
   should not differ in whether they look like they belong to the menu.

   **`upload` is the third**, 5 Oct 2026: Add New Employee's ▾ → File Import,
   new people and corrections from an Excel sheet, at `/employees/upload`. */
/* `chart` is the fourth (10 Oct 2026): one company's flow chart, opened by
   clicking its box on Hierarchy Chart. */
/* Documents' one folder and News' post, new post and edit (21 Oct 2026) are
   pages of the reference's that it opens from a card, with a back arrow. */
const OFF_MENU = { employees: ["new", "import", "upload", "chart"], documents: ["folder"], news: ["item", "new", "edit"] };

/** What the breadcrumb calls an off-menu page. These have no tab to be named
    by, and before 10 Oct 2026 every one of them read "Overview" up there. */
const OFF_MENU_TITLE = {
	"employees/new": "Create Employee",
	"employees/import": "Import From Onboarding",
	"employees/upload": "File Import",
	"employees/chart": "Company Chart",
	"documents/folder": "Folder",
	"news/item": "News detail",
	"news/new": "Create news",
	"news/edit": "Edit news",
};
export const offMenuTitle = (section, subtab) => OFF_MENU_TITLE[`${section}/${subtab}`] || "";

/** Whether this page is reached from a control rather than from the strip —
 *  which is to say, whether the strip should be there at all. Read by SubNav. */
export function offMenu(section, subtab) {
	return (OFF_MENU[section] || []).includes(subtab);
}

/* `OVERVIEW` and `DEFAULT_SECTION` live in routes/paths.js, which is where the
   URL grammar is. Re-exported here so a caller reading this table does not have
   to know that — and defined in one place, because the table and the grammar
   have to agree on the word. */
export { OVERVIEW, DEFAULT_SECTION };

/** The join: one entry per module, carrying its rail label, its menu and its
 *  pages. Built from SECTIONS so the rail's order is the site's order and
 *  neither can be reordered without the other.
 *
 *  `tabs` is deliberately allowed to be empty — Survey has a rail entry and one
 *  page but no menu anybody has ever captured, and an invented menu is worse
 *  than a missing one. An empty menu draws an empty strip, which is what it did
 *  before this table existed. */
export const MODULES = Object.fromEntries(
	SECTIONS.map((s) => [s.key, {
		key: s.key,
		label: s.label,
		tabs: TABS[s.key] || [],
		pages: PAGES[s.key] || {},
	}]),
);

/** The component for a page, falling back to the module's overview.
 *
 *  A subtab with no page falls back rather than blanking, which is the same
 *  bargain the menus make: a menu item that leads nowhere is a bug worth seeing
 *  on a page, not a white screen. */
export function pageFor(section, subtab) {
	const mod = MODULES[section] || MODULES[DEFAULT_SECTION];
	return mod.pages[subtab] || mod.pages[OVERVIEW];
}

/* Kept for the coverage report, which lists every module's pages by name.
   `MODULES` is the table; this is the shape that page already reads. */
export const SUBTABS = TABS;
