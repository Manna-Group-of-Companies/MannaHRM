import { useEffect, useRef } from "react";
import { SECTIONS } from "@/data/sections";
import { useApp, set, getState } from "@/state/store";
import { load, loadOnBoard, loadShiftAssignments } from "@/api/load";

import Dashboard from "@/sections/dashboard/Dashboard";
import Engagement from "@/sections/dashboard/Engagement";
import Approvals from "@/sections/approvals/Approvals";
import LetterForm from "@/sections/onboard/LetterForm";
import Candidates from "@/sections/onboard/Candidates";
import Documents from "@/sections/onboard/Documents";
import Assets from "@/sections/onboard/Assets";
import AssetAssign from "@/sections/onboard/AssetAssign";
import OnboardAll from "@/sections/onboard/OnboardAll";
import EmployeeMaster from "@/sections/employees/EmployeeMaster";
import SalaryMaster from "@/sections/employees/SalaryMaster";
import EmployeeDetail from "@/sections/employees/EmployeeDetail";
import EmployeeProfile from "@/sections/employees/EmployeeProfile";
import Ctc from "@/sections/employees/Ctc";
import Categories from "@/sections/employees/Categories";
import Calendar from "@/sections/employees/Calendar";
import AllEmployees from "@/sections/employees/AllEmployees";
import Regularization from "@/sections/attendance/Regularization";
import SubmitAttendance from "@/sections/attendance/SubmitAttendance";
import InOut from "@/sections/attendance/InOut";
import DailyDetail from "@/sections/attendance/DailyDetail";
import MonthlyBasic from "@/sections/attendance/MonthlyBasic";
import Statutory from "@/sections/attendance/Statutory";
import Shifts from "@/sections/attendance/Shifts";
import AttendanceAll from "@/sections/attendance/AttendanceAll";
import ApplyLeave from "@/sections/leave/ApplyLeave";
import LeaveBalances from "@/sections/leave/LeaveBalances";
import LeaveAll from "@/sections/leave/LeaveAll";
import Adhoc from "@/sections/payroll/Adhoc";
import SalaryProcess from "@/sections/payroll/SalaryProcess";
import FnF from "@/sections/payroll/FnF";
import ITDeclarations from "@/sections/payroll/ITDeclarations";
import BankTransfer from "@/sections/payroll/BankTransfer";
import BonusReport from "@/sections/payroll/BonusReport";
import Payslip from "@/sections/payroll/Payslip";
import SalaryRegister from "@/sections/payroll/SalaryRegister";
import ProfTax from "@/sections/payroll/ProfTax";
import LoanApplication from "@/sections/loans/LoanApplication";
import LoanRegister from "@/sections/loans/LoanRegister";
import LoanProjection from "@/sections/loans/LoanProjection";
import LoansAll from "@/sections/loans/LoansAll";
import Survey from "@/sections/simple/Survey";
import Settings from "@/sections/settings/Settings";
import Coverage from "@/sections/settings/Coverage";

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
export const SUBTABS = {
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
		profile: EmployeeProfile },
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

function Nav() {
	const { section } = useApp();
	return (
		<nav aria-label="Modules">
			{SECTIONS.map((s) => (
				<button
					key={s.key}
					className="nav"
					aria-current={section === s.key ? "page" : undefined}
					onClick={() => set({ section: s.key, subtab: "overview" })}
				>
					<svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
						<path d={s.icon} />
					</svg>
					<span>{s.label}</span>
				</button>
			))}
		</nav>
	);
}

function TopBar() {
	const { companies, company, q, conn, connState } = useApp();
	return (
		<div className="topbar">
			<span className="co">{(company || "MANNA GROUP").toUpperCase()}</span>
			<select
				aria-label="Company"
				value={company}
				onChange={(e) => set({ company: e.target.value })}
			>
				<option value="">All companies</option>
				{companies.map((c) => (
					<option key={c.name}>{c.name}</option>
				))}
			</select>
			<input
				type="search"
				placeholder="Search name, code, designation…"
				aria-label="Search"
				value={q}
				onChange={(e) => set({ q: e.target.value })}
			/>
			<span className="me">
				Hi admin &nbsp;·&nbsp;
				<span className="status">
					<span className={"dot " + connState} />
					<span>{conn}</span>
				</span>
			</span>
		</div>
	);
}

function SubBar() {
	const { section, subtab } = useApp();
	const bar = useRef(null);
	const tabs = SUBTABS[section];

	/* On a phone this strip is one scrolling row rather than five wrapped ones,
	   which means the selected tab can sit off the right-hand edge — landing on
	   Manage Shift and seeing "Attendance Regularization" highlighted nowhere is
	   worse than the five rows were.

	   `scrollLeft` rather than `scrollIntoView`, which also scrolls the page
	   vertically and would jump the panel you just opened out of view. */
	useEffect(() => {
		const el = bar.current;
		const active = el?.querySelector('[aria-current="page"]');
		if (!el || !active || el.scrollWidth <= el.clientWidth) return;
		const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		el.scrollTo({
			left: Math.max(0, active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2),
			behavior: smooth ? "smooth" : "auto",
		});
	}, [section, subtab]);

	if (!tabs) return <div className="subbar" />;
	/* `aria-current="page"`, not `aria-selected`, and a `<nav>` rather than a
	   tablist. Factor HR draws this strip as tabs and so do we, but what it
	   does is move between the pages of a module — the same job the rail does
	   one level up, which already says `aria-current="page"`. Calling it a
	   tablist would promise arrow-key movement between panes that are not
	   panes, and would describe the two halves of the same navigation in two
	   different words. */
	return (
		<nav className="subbar" ref={bar} aria-label="Pages in this module">
			{tabs.map((t) => (
				<button
					key={t[0]}
					className="subtab"
					aria-current={subtab === t[0] ? "page" : undefined}
					onClick={() => set({ subtab: t[0] })}
				>
					{t[1]}
				</button>
			))}
		</nav>
	);
}

function Body() {
	const { section, subtab, onboardRead, shMaster, shAssignState } = useApp();

	/* On Board's extra reads are half a dozen requests against a site with a
	   daily compute limit, so they are made the first time somebody opens the
	   module and not once per page load. The flag is set inside loadOnBoard,
	   before the first await, so the re-render it triggers cannot ask again. */
	useEffect(() => {
		if (section === "onboard" && !onboardRead) void loadOnBoard();
	}, [section, onboardRead]);

	/* Work Pattern's read, on the same terms and for the same reason — one
	   request, and only for somebody who has actually asked for that half of
	   Manage Shift. loadShiftAssignments() guards itself against the re-render. */
	useEffect(() => {
		if (section === "attendance" && subtab === "shifts" && shMaster === "pattern" && !shAssignState) {
			void loadShiftAssignments();
		}
	}, [section, subtab, shMaster, shAssignState]);

	const mod = PAGES[section] || PAGES.dashboard;
	const Page = mod[subtab] || mod.overview;
	return (
		<main className="content" id="page" tabIndex={-1}>
			<Page />
		</main>
	);
}

export default function App() {
	/* One read on open. Everything after it is a refresh somebody asked for. */
	useEffect(() => {
		void load();
	}, []);

	/* Every drop-down that opens over the page — the status dots on Employee
	   Master, regularization, daily detail and salary, and the export list on
	   the In / Out report. They are the same control on their side and they
	   close the same way on ours. Bound once on the document rather than per
	   render: a menu that closes only when you click it a second time is a menu
	   people leave open. */
	useEffect(() => {
		const closeMenus = () => {
			const s = getState();
			const dda = s.dda.menu || s.dda.fmenu || s.dda.gmenu;
			const mb = s.mb.fmenu || s.mb.gmenu;
			const lv = s.apply.menu || s.apply.notifymenu;
			const lvb = s.lvb.menu || s.lvb.fmenu || s.lvb.gmenu;
			const sreg = s.sreg.menu || s.sreg.gmenu;
			const psl = s.psl.menu || s.psl.gmenu;
			if (s.empmenu || s.reg.menu || dda || mb || lv || lvb || sreg || psl || s.sal.menu
				|| s.adhoc.menu || s.io.menu || s.io.fmenu) {
				set({
					empmenu: false, reg: { ...s.reg, menu: false }, sal: { ...s.sal, menu: false },
					/* The employee dot on Adhoc Payments, which is Salary Master's control
					   on a different screen and so must not share its selection. */
					adhoc: { ...s.adhoc, menu: false },
					/* A status dot, an export list and a Generate list, spread over the
					   three attendance reports — every drop-down that opens over a page. */
					dda: { ...s.dda, menu: false, fmenu: false, gmenu: false },
					mb: { ...s.mb, fmenu: false, gmenu: false },
					io: { ...s.io, menu: false, fmenu: false },
					/* Two on Apply Leave: the employee search's dot and the one on Email
					   Notification To, which filter the same list. */
					apply: { ...s.apply, menu: false, notifymenu: false },
					/* Three on the Leave Balance Report: the status dot, the export list
					   and the Generate list — the same trio the attendance reports carry. */
					lvb: { ...s.lvb, menu: false, fmenu: false, gmenu: false },
					/* Two on the Salary Register: the status dot and the Generate list,
					   which their form pins to the tab row rather than to a bar. */
					sreg: { ...s.sreg, menu: false, gmenu: false },
					/* Two on Salary Payslip: the status dot and the Generate list. That bar
					   carries no export split button — Report Output does that job on their
					   payslip screen, so there is no third menu to close. */
					psl: { ...s.psl, menu: false, gmenu: false },
				});
			}
		};
		const onClick = (e) => {
			if (!e.target?.closest?.(".empdrop")) closeMenus();
		};
		const onKey = (e) => {
			if (e.key !== "Escape") return;
			if (getState().appdialog) return set({ appdialog: "", dlgmsg: "" });
			if (getState().ioDoc) return set({ ioDoc: "" });
			if (getState().ddaDoc) return set({ ddaDoc: "" });
			if (getState().mbDoc) return set({ mbDoc: "" });
			if (getState().lvbDoc) return set({ lvbDoc: "" });
			if (getState().pslDoc) return set({ pslDoc: "" });
			closeMenus();
		};
		document.addEventListener("click", onClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("click", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, []);

	return (
		<div className="shell">
			{/* Nine rail buttons and a toolbar stand between the top of the document
			    and the page, on every page. Somebody driving this by keyboard should
			    not pay for them twice a click. Hidden until focused, which is the one
			    time it is any use. */}
			<a className="skip" href="#page">Skip to page</a>
			<aside className="side">
				<div className="brand">
					<span className="mark">
						<span className="o">MA</span>
						<span className="c">NN</span>
						<span className="o">A</span>
					</span>
					<small>HR</small>
				</div>
				<Nav />
			</aside>
			<div className="main">
				<TopBar />
				<SubBar />
				<Body />
			</div>
		</div>
	);
}
