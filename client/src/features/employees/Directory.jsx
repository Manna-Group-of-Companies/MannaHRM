/** Directory, as the HRDashboard reference draws it (21 October 2026, D15):
 *  everybody active in the company picked as a card — initials, name, title,
 *  department, how to reach them — under a row of department tabs and a
 *  search. The reference's Message button is Email here (D12: no chat).
 *
 *  It took the address of Factor HR's Employees Directory report, which is
 *  still on Reports to download as a sheet.
 */

import { useState } from "react";
import { useApp } from "@/store";
import { isOn, scoped } from "@/lib/scope";
import { tidyDept } from "@/lib/format";
import { openEmployee } from "@/features/employees/openEmployee";
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";
import { EmptyState, PageHead, SegTabs, stagger } from "@/components/kit/ui";

const mailOf = (e) => e.prefered_email || e.company_email || e.personal_email || "";

export default function Directory() {
	const s = useApp();
	const [dept, setDept] = useState("All");
	const [q, setQ] = useState("");
	const people = scoped(s).filter(isOn);
	const depts = [...new Set(people.map((e) => e.department).filter(Boolean))].sort();
	const t = q.trim().toLowerCase();
	const shown = people
		.filter((e) => (dept === "All" || e.department === dept)
			&& (!t || `${e.employee_name} ${e.designation} ${e.employee_number}`.toLowerCase().includes(t)))
		.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));

	return (
		<div className="kit k-enter">
			<PageHead title="Directory" sub="Find and contact anyone in the company." />
			<div className="k-card" style={{ marginBottom: 20 }}>
				<div className="k-card-h" style={{ margin: 0 }}>
					<div style={{ overflowX: "auto", maxWidth: "100%" }}>
						<SegTabs label="Department" value={dept} onChange={setDept}
							tabs={[["All", "All"], ...depts.map((d) => [d, tidyDept(d)])]}
							count={(v) => (v === "All" ? people.length : people.filter((e) => e.department === v).length)} />
					</div>
					<div className="k-inp-ic" style={{ minWidth: 240 }}>
						<KitIcon name="search" size={18} stroke={2} />
						<input className="k-inp" placeholder="Search people" value={q} aria-label="Search directory"
							onChange={(e) => setQ(e.target.value)} />
					</div>
				</div>
			</div>
			<div className="k-jobs">
				{shown.length ? shown.map((e, i) => (
					<div className="k-card k-job k-lift k-anim" style={{ ...stagger(i), textAlign: "center", alignItems: "center" }} key={e.name}>
						<button type="button" onClick={() => openEmployee(e.name)}
							style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
							<KitAvatar name={e.employee_name} size={64} />
							<b style={{ fontSize: 15 }}>{e.employee_name}</b>
							<span className="k-muted" style={{ fontSize: 13, marginTop: -6 }}>{e.designation || "—"}</span>
						</button>
						<span className="k-pill k-p-grey k-nodot">{tidyDept(e.department) || "No department"}</span>
						<div style={{ fontSize: 13, color: "rgb(var(--ink-2))", display: "flex", flexDirection: "column", gap: 4, width: "100%", borderTop: "1px solid rgb(var(--line))", paddingTop: 12 }}>
							<span style={{ overflowWrap: "anywhere" }}>{mailOf(e) || "No email on file"}</span>
							<span>{e.cell_number || "No phone on file"}</span>
						</div>
						<div className="k-row-act" style={{ width: "100%" }}>
							{mailOf(e) ? (
								<a className="k-btn k-btn-line k-btn-sm" style={{ flex: 1, justifyContent: "center" }} href={`mailto:${mailOf(e)}`}>
									<KitIcon name="mail" size={14} stroke={2} />Email
								</a>
							) : e.cell_number ? (
								<a className="k-btn k-btn-line k-btn-sm" style={{ flex: 1, justifyContent: "center" }} href={`tel:${e.cell_number}`}>
									<KitIcon name="phone" size={14} stroke={2} />Call
								</a>
							) : null}
							<button type="button" className="k-btn k-btn-ink k-btn-sm" style={{ flex: 1, justifyContent: "center" }}
								onClick={() => openEmployee(e.name)}>Profile</button>
						</div>
					</div>
				)) : (
					<div className="k-card" style={{ gridColumn: "1/-1" }}>
						<EmptyState icon="search" title="No one found" sub="Try another name or team." />
					</div>
				)}
			</div>
		</div>
	);
}
