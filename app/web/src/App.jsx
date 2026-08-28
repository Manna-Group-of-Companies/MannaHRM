import { useEffect } from "react";
import { SECTIONS } from "@/data/sections";
import { useApp, set, getState } from "@/state/store";
import { load, loadOnBoard } from "@/api/load";

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
import Ctc from "@/sections/employees/Ctc";
import Categories from "@/sections/employees/Categories";
import Calendar from "@/sections/employees/Calendar";
import AllEmployees from "@/sections/employees/AllEmployees";
import Reporting from "@/sections/employees/Reporting";
import Regularization from "@/sections/attendance/Regularization";
import SubmitAttendance from "@/sections/attendance/SubmitAttendance";
import InOut from "@/sections/attendance/InOut";
import DailyDetail from "@/sections/attendance/DailyDetail";
import MonthlyBasic from "@/sections/attendance/MonthlyBasic";
import Statutory from "@/sections/attendance/Statutory";
import Shifts from "@/sections/attendance/Shifts";
import AttendanceAll from "@/sections/attendance/AttendanceAll";
import Leave from "@/sections/leave/Leave";
import LeaveBalances from "@/sections/leave/LeaveBalances";
import LeaveReports from "@/sections/leave/LeaveReports";
import Payroll from "@/sections/payroll/Payroll";
import FnF from "@/sections/payroll/FnF";
import PayReports from "@/sections/payroll/PayReports";
import Loans from "@/sections/simple/Loans";
import Survey from "@/sections/simple/Survey";
import Settings from "@/sections/settings/Settings";
import Coverage from "@/sections/settings/Coverage";

/* Factor HR's second-level menus, under the module each belongs to, in its
   order. Only pages the tenant has actually been seen to have are listed:
   Loans and Survey are absent because nobody has captured their sub-menu yet,
   and an invented menu is worse than a missing one.

   Employees is Factor HR's seven, in its order, and then Reporting lines,
   which Factor HR has no equivalent for. It earns the exception: a blank
   Reporting Manager is a correction request with nowhere to go, and there is
   nowhere else on the menu that says so. */
export const SUBTABS = {
	dashboard: [["overview", "Start up"], ["engagement", "Engagement"], ["approvals", "Approvals"]],
	onboard: [["candidates", "Candidate Master"], ["overview", "Create Letter / Form"],
		["documents", "Document Entry"], ["assets", "Assets Details"],
		["assignment", "Assets Assignment"], ["all", "All"]],
	employees: [["overview", "Employee Master"], ["salary", "Salary Master"], ["detail", "Employee Detail"],
		["ctc", "CTC / Earnings"], ["categories", "Categories"], ["calendar", "Calendar"], ["all", "All"],
		["reporting", "Reporting lines"]],
	/* Factor HR's own Attendance menu, captured 28 Aug 2026, item for item and
	   in its order. `overview` is Attendance Regularization because that is the
	   first item on their menu and the one page here with a live queue behind
	   it — so clicking Attendance in the nav lands on it. */
	attendance: [["overview", "Attendance Regularization"], ["submit", "Submit Attendance"],
		["inout", "In Out Activities Report"], ["daily", "Daily Detail Attendance Report"],
		["monthly", "Monthly Basic Attendance"], ["statutory", "Statutory Reports"],
		["shifts", "Manage Shift"], ["all", "All"]],
	leave: [["overview", "Leave"], ["balances", "Balances"], ["reports", "Reports"]],
	payroll: [["overview", "Payroll Summary"], ["fnf", "Full & Final"], ["reports", "Reports"]],
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
		categories: Categories, calendar: Calendar, all: AllEmployees, reporting: Reporting },
	attendance: { overview: Regularization, submit: SubmitAttendance, inout: InOut,
		daily: DailyDetail, monthly: MonthlyBasic, statutory: Statutory,
		shifts: Shifts, all: AttendanceAll },
	leave: { overview: Leave, balances: LeaveBalances, reports: LeaveReports },
	payroll: { overview: Payroll, fnf: FnF, reports: PayReports },
	loans: { overview: Loans },
	survey: { overview: Survey },
	settings: { overview: Settings, coverage: Coverage },
};

function Nav() {
	const { section } = useApp();
	return (
		<nav>
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
	const tabs = SUBTABS[section];
	if (!tabs) return <div className="subbar" />;
	return (
		<div className="subbar">
			{tabs.map((t) => (
				<button
					key={t[0]}
					className="subtab"
					aria-selected={subtab === t[0]}
					onClick={() => set({ subtab: t[0] })}
				>
					{t[1]}
				</button>
			))}
		</div>
	);
}

function Body() {
	const { section, subtab, onboardRead } = useApp();

	/* On Board's extra reads are half a dozen requests against a site with a
	   daily compute limit, so they are made the first time somebody opens the
	   module and not once per page load. The flag is set inside loadOnBoard,
	   before the first await, so the re-render it triggers cannot ask again. */
	useEffect(() => {
		if (section === "onboard" && !onboardRead) void loadOnBoard();
	}, [section, onboardRead]);

	const mod = PAGES[section] || PAGES.dashboard;
	const Page = mod[subtab] || mod.overview;
	return (
		<div className="content">
			<Page />
		</div>
	);
}

export default function App() {
	/* One read on open. Everything after it is a refresh somebody asked for. */
	useEffect(() => {
		void load();
	}, []);

	/* Both status dots — Employee Master's and the regularization screen's.
	   They are the same control on their side and they close the same way on
	   ours. Bound once on the document rather than per render: a menu that
	   closes only when you click it a second time is a menu people leave open. */
	useEffect(() => {
		const closeMenus = () => {
			const s = getState();
			if (s.empmenu || s.reg.menu || s.dda.menu) {
				set({ empmenu: false, reg: { ...s.reg, menu: false }, dda: { ...s.dda, menu: false } });
			}
		};
		const onClick = (e) => {
			if (!e.target?.closest?.(".empdrop")) closeMenus();
		};
		const onKey = (e) => {
			if (e.key !== "Escape") return;
			if (getState().appdialog) return set({ appdialog: "", dlgmsg: "" });
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
