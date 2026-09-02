/**
 * The site: one read on open, the URL kept in step, and the chrome around it.
 *
 * What used to be here — the menus, the page table, the rail, the top bar and
 * the page strip — moved out in the restructure of 31 August 2026. The menus
 * and pages are `routes/registry.jsx`; the addresses are `routes/router.js`;
 * the chrome is `layout/`. What is left is the three things that are genuinely
 * about the whole site rather than about one part of it: the first read, the
 * URL, and the click that closes whatever menu is open.
 */

import { useEffect } from "react";
import { set, getState } from "@/store";
import { load } from "@/api/load";
import { startRouter } from "@/routes/router";
import AppShell from "@/layout/AppShell";

export default function App() {
	/* Before the first read, so a refresh on /attendance/shifts draws that page
	   rather than drawing the Dashboard and then replacing it. */
	useEffect(() => startRouter(), []);

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
			if (s.empmenu || s.empnew || s.reg.menu || dda || mb || lv || lvb || sreg || psl || s.sal.menu
				|| s.adhoc.menu || s.io.menu || s.io.fmenu || s.ctcMenu) {
				set({
					empmenu: false, reg: { ...s.reg, menu: false }, sal: { ...s.sal, menu: false },
					// Employee Master's Add New Employee caret — its import list.
					empnew: false,
					// CTC / Earnings → CTC Rating Data Import, which is two items.
					ctcMenu: false,
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

	return <AppShell />;
}
