import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/store";
import { loadPayroll, payKey } from "@/api/payroll";
import { loadHomeReads } from "@/api/payrollhome";
import { periodOf } from "@/lib/payroll";
import { homeSteps } from "@/lib/payrollhome";
import { payRows } from "@/features/payroll/shared";
import { MONTHS, thisMonth } from "@/lib/format";
import { deskUrl } from "@/lib/desk";
import { Desk, Note, Panel, Tile, Tiles } from "@/components/ui";
import Link from "@/routes/Link";

/* PAYROLL → PAYROLL. Ours, 2 October 2026 — the first page of the module, for
   the person who has to get a month paid and wants to be told what comes next.

   Four steps, each with where it stands on the site right now and a way into
   the page that does it. It reads and counts and writes nothing: the pages it
   points to are where anything is made, and the figures are hrms's own
   (lib/payrollhome.js). The same four steps are the order of the tabs. */

/** Last month, which is the month being paid at the start of this one. */
const lastMonth = () => {
	const [y, m] = thisMonth().split("-").map(Number);
	const d = new Date(y, m - 2, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthChoices = () => {
	const [y, m] = thisMonth().split("-").map(Number);
	return Array.from({ length: 19 }, (_, i) => {
		const d = new Date(y, m - 1 - i, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	});
};

const rupees = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const CHIP = {
	done: ["submitted", "Done"],
	warn: ["draft", "Needs you"],
	wait: ["", "Working"],
	todo: ["", "To do"],
	unknown: ["", "Not known"],
};

/** The way into the page that does each step. */
const ACTIONS = {
	setup: [],
	extras: [{ section: "payroll", subtab: "adhoc", label: "Adhoc Payments/Deductions" }, { section: "payroll", subtab: "sheet", label: "Loan deductions" }],
	run: [{ section: "payroll", subtab: "process", label: "Salary Process" }],
	review: [
		{ section: "payroll", subtab: "sheet", label: "Salary Sheet" },
		{ section: "payroll", subtab: "payslip", label: "Payslips" },
		{ section: "payroll", subtab: "register", label: "Salary Register" },
		{ section: "payroll", subtab: "bank", label: "Bank Transfer" },
	],
};

export default function PayrollHome() {
	const s = useApp();
	const { company, site } = s;
	const [ym, setYm] = useState(lastMonth);
	const [reads, setReads] = useState({ components: undefined, extras: undefined, counts: null });

	const per = periodOf(ym);
	const [start, end] = per.iso;
	const pay = (s.pay || {})[payKey(company, start, end)];

	useEffect(() => { void loadPayroll(company, start, end); }, [company, start, end]);
	useEffect(() => {
		let live = true;
		setReads({ components: undefined, extras: undefined, counts: null });
		loadHomeReads(company, start, end).then((r) => { if (live) setReads(r); });
		return () => { live = false; };
	}, [company, start, end]);

	const refresh = () => {
		void loadPayroll(company, start, end, { fresh: true });
		setReads({ components: undefined, extras: undefined, counts: null });
		loadHomeReads(company, start, end).then(setReads);
	};

	const people = payRows(s);
	const view = useMemo(
		() => homeSteps({
			setup: { components: reads.components === undefined ? undefined : reads.components },
			extras: reads.extras === undefined ? undefined : reads.extras,
			pay,
			people,
			end,
		}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[reads, pay, s.employees, company, end],
	);

	const label = `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
	const t = view.totals;
	const doing = view.steps[view.current];

	return (
		<>
			<div className="emhead">
				<h2>Payroll</h2>
				<span className="n">{label} · {company || "all companies"}</span>
				<span className="right">
					<label className="sr-only" htmlFor="phmonth">Month</label>
					<select id="phmonth" value={ym} onChange={(e) => setYm(e.target.value)}>
						{monthChoices().map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
					</select>
					<button type="button" className="embtn" onClick={refresh}>Refresh</button>
				</span>
			</div>

			<Tiles>
				<Tile k="People to pay" n={people.length} s={company || "all companies"} />
				<Tile k="Slips made" n={t ? t.count : "—"} s={t && t.count ? `${t.submitted} submitted` : ""} />
				<Tile k="Net pay" n={t && t.count ? rupees(t.net) : "—"} />
				<Tile k="Next" n={doing ? doing.title : "All done"} />
			</Tiles>

			<Panel title={`Getting ${label} paid`} ico="✔">
				<ol className="list-decimal pl-[1.2rem] leading-[1.8]">
					{view.steps.map((st, i) => {
						const [cls, word] = CHIP[st.state];
						const next = i === view.current;
						return (
							<li key={st.id} aria-current={next ? "step" : undefined}>
								<b>{st.title}</b>{" "}
								<span className={"fpstate " + cls}>{word}</span>
								{next && <span className="muted"> — do this next</span>}
								<div>{st.text}</div>
								{st.bare && st.bare.length > 0 && (
									<small className="muted block">
										{st.bare.slice(0, 8).map((e) => e.employee_name || e.name).join(", ")}
										{st.bare.length > 8 ? ` and ${st.bare.length - 8} more` : ""}
									</small>
								)}
								<div className="ctl" style={{ margin: ".25rem 0 .6rem" }}>
									{ACTIONS[st.id].map((a) => (
										<span key={a.subtab + a.label}><Link section={a.section} subtab={a.subtab}>{a.label}</Link>{" "}</span>
									))}
									{st.id === "setup" && st.state !== "done" && (
										<>
											<Desk className="embtn" href={site && deskUrl(site, "Salary Component")} label="Open Salary Component in Frappe">
												Open Salary Component
											</Desk>{" "}
											<Desk className="embtn" href={site && deskUrl(site, "Salary Structure Assignment")} label="Open Salary Structure Assignment in Frappe">
												Open Salary Structure Assignment
											</Desk>
										</>
									)}
									{st.id === "extras" && st.drafts > 0 && (
										<Desk className="embtn" href={site && deskUrl(site, "Additional Salary")} label="Open Additional Salary in Frappe">
											Submit them in Frappe
										</Desk>
									)}
								</div>
							</li>
						);
					})}
				</ol>
				{view.steps[0].missing && view.steps[0].missing.length > 0 && (
					<Note className="warn">
						The salary components above can be made on the site in one go: run <code>python tools/setup_payroll.py</code>
						{" "}to see what it would do, then again with <code>--apply</code>. docs/PAYROLL_SETUP.md says how.
					</Note>
				)}
			</Panel>
		</>
	);
}
