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
import { OVERVIEW, DEFAULT_SECTION } from "@/routes/paths";

import Dashboard from "@/features/dashboard/Dashboard";
import Engagement from "@/features/dashboard/Engagement";
import Approvals from "@/features/approvals/Approvals";
import LetterForm from "@/features/onboard/LetterForm";
import Candidates from "@/features/onboard/Candidates";
import Documents from "@/features/onboard/Documents";
import Assets from "@/features/onboard/Assets";
import AssetAssign from "@/features/onboard/AssetAssign";
import OnboardAll from "@/features/onboard/OnboardAll";
import EmployeeMaster from "@/features/employees/EmployeeMaster";
import SalaryMaster from "@/features/employees/SalaryMaster";
import SalaryRevision from "@/features/employees/SalaryRevision";
import EmployeeDetail from "@/features/employees/EmployeeDetail";
import EmployeeProfile from "@/features/employees/EmployeeProfile";
import Ctc from "@/features/employees/Ctc";
import Categories from "@/features/employees/Categories";
import Calendar from "@/features/employees/Calendar";
import AllEmployees from "@/features/employees/AllEmployees";
import CreateEmployee from "@/features/employees/CreateEmployee";
import Regularization from "@/features/attendance/Regularization";
import SubmitAttendance from "@/features/attendance/SubmitAttendance";
import InOut from "@/features/attendance/InOut";
import DailyDetail from "@/features/attendance/DailyDetail";
import MonthlyBasic from "@/features/attendance/MonthlyBasic";
import Statutory from "@/features/attendance/Statutory";
import Shifts from "@/features/attendance/Shifts";
import AttendanceAll from "@/features/attendance/AttendanceAll";
import ApplyLeave from "@/features/leave/ApplyLeave";
import LeaveBalances from "@/features/leave/LeaveBalances";
import LeaveAll from "@/features/leave/LeaveAll";
import Adhoc from "@/features/payroll/Adhoc";
import SalaryProcess from "@/features/payroll/SalaryProcess";
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
import LoansAll from "@/features/loans/LoansAll";
import Survey from "@/features/simple/Survey";
import Settings from "@/features/settings/Settings";
import Coverage from "@/features/settings/Coverage";

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
	dashboard: [["overview", "Start up"], ["engagement", "Engagement"], ["approvals", "Approvals"]],
	onboard: [["candidates", "Candidate Master"], ["overview", "Create Letter / Form"],
		["documents", "Document Entry"], ["assets", "Assets Details"],
		["assignment", "Assets Assignment"], ["all", "All"]],
	employees: [["overview", "Employee Master"], ["salary", "Salary Master"], ["detail", "Employee Detail"],
		["ctc", "CTC / Earnings"], ["categories", "Categories"], ["calendar", "Calendar"], ["all", "All"],
		["profile", "Employee Profile"]],
	/* Factor HR's own Attendance menu, captured 28 Aug 2026, item for item and
	   in its order. `overview` is Attendance Regularization because that is the
	   first item on their menu and the one page here with a live queue behind
	   it — so clicking Attendance in the nav lands on it. */
	attendance: [["overview", "Attendance Regularization"], ["submit", "Submit Attendance"],
		["inout", "In Out Activities Report"], ["daily", "Daily Detail Attendance Report"],
		["monthly", "Monthly Basic Attendance"], ["statutory", "Statutory Reports"],
		["shifts", "Manage Shift"], ["all", "All"]],
	/* Factor HR's own Leave menu, captured 29 Aug 2026 — three items where
	   Attendance has eight, which is the finding rather than a gap on our side.
	   `overview` is Apply Leave because it is the first item on their menu, so
	   clicking Leave in the nav lands on it. `all` has no menu item there and is
	   appended rather than interleaved, so the first two still compare item for
	   item. */
	leave: [["overview", "Apply Leave"], ["balances", "Leave Balance Report"], ["all", "All"]],
	/* Factor HR's Payroll menu, captured 29 Aug 2026, in its order. The capture
	   starts at Adhoc Payments/Deductions — whatever sits above it there has not
	   been seen — so that is where this menu starts too, and `overview` is it:
	   clicking Payroll in the rail lands on the first item of their own menu,
	   the way On Board, Attendance and Leave already do.

	   Their menu says Final Settlement where §1 read the same screen as
	   "F&F Summary"; their name is the one on the tab. */
	payroll: [["overview", "Adhoc Payments/Deductions"],
		["process", "Salary Process"], ["fnf", "Final Settlement"], ["itdec", "IT Declarations"],
		["bank", "Bank Transfer"], ["bonus", "Bonus Working Report"], ["payslip", "Salary Payslip"],
		["register", "Salary Register"], ["ptax", "Prof. Tax Statement"]],
	/* Captured 29 Aug 2026, the menu and nothing else. None of the four pages
	   under it has been opened, and no doctype on this site can hold a loan, so
	   each is a reading of what the name has to mean rather than a copy. */
	loans: [["overview", "Loan Application"], ["register", "Loan Register"],
		["projection", "Loan Projection"], ["all", "All"]],
	settings: [["overview", "Setup readiness"], ["coverage", "Module coverage"]],
};

/* One entry per page. Nested by module so the dispatch reads in the same shape
   as SUBTABS above and the two cannot drift apart unnoticed — a subtab with no
   page here falls back to the module's overview rather than blanking. */
const PAGES = {
	dashboard: { overview: Dashboard, engagement: Engagement, approvals: Approvals },
	/* `overview` is Create Letter / Form rather than the first tab: clicking On
	   Board resets to it, and landing on the one page with real work on it beats
	   landing on a page that is empty on both sides. */
	onboard: { overview: LetterForm, candidates: Candidates, documents: Documents,
		assets: Assets, assignment: AssetAssign, all: OnboardAll },
	employees: { overview: EmployeeMaster, salary: SalaryMaster, detail: EmployeeDetail, ctc: Ctc,
		categories: Categories, calendar: Calendar, all: AllEmployees,
		profile: EmployeeProfile, new: CreateEmployee },
	attendance: { overview: Regularization, submit: SubmitAttendance, inout: InOut,
		daily: DailyDetail, monthly: MonthlyBasic, statutory: Statutory,
		shifts: Shifts, all: AttendanceAll },
	leave: { overview: ApplyLeave, balances: LeaveBalances, all: LeaveAll },
	payroll: { overview: Adhoc, process: SalaryProcess, fnf: FnF,
		itdec: ITDeclarations, bank: BankTransfer, bonus: BonusReport, payslip: Payslip,
		register: SalaryRegister, ptax: ProfTax },
	loans: { overview: LoanApplication, register: LoanRegister,
		projection: LoanProjection, all: LoansAll },
	survey: { overview: Survey },
	settings: { overview: Settings, coverage: Coverage },
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
   another `fullPage` branch: nothing here has to know what the page is. */
const OFF_MENU = { employees: ["new"] };

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
