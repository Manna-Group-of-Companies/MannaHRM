/** Org chart, as the HRDashboard reference draws it (21 October 2026, D15):
 *  who reports to whom, as a tree of cards joined by lines, with a count under
 *  anybody who has people under them that folds their team away, zoom, and
 *  drag to move about.
 *
 *  Built from `reports_to` on the active people in the company picked. Most
 *  people on this site report to nobody and manage nobody; drawn as trees of
 *  one they would be a row hundreds of cards wide, so they are listed under the
 *  chart instead — the chart is the reporting lines there are.
 *
 *  It took the address of Factor HR's Organization Chart report, which is
 *  still on Reports to download. Hierarchy Chart — the companies, and the
 *  chart HR draws — is its own page.
 */

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/store";
import { isOn, scoped } from "@/lib/scope";
import { openEmployee } from "@/features/employees/openEmployee";
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";
import { EmptyState, PageHead } from "@/components/kit/ui";

/** The tree: each active person's reports, and who heads a line. */
export function orgTree(people) {
	const by = new Map(people.map((e) => [e.name, e]));
	const kids = new Map();
	for (const e of people) {
		const m = e.reports_to && by.has(e.reports_to) && e.reports_to !== e.name ? e.reports_to : "";
		if (!m) continue;
		if (!kids.has(m)) kids.set(m, []);
		kids.get(m).push(e);
	}
	for (const list of kids.values()) list.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
	const heads = people.filter((e) => !(e.reports_to && by.has(e.reports_to) && e.reports_to !== e.name));
	return {
		kids,
		roots: heads.filter((e) => kids.has(e.name)),
		alone: heads.filter((e) => !kids.has(e.name)),
	};
}

export default function OrgChart() {
	const s = useApp();
	const people = scoped(s).filter(isOn);
	const { kids, roots, alone } = orgTree(people);
	const [zoom, setZoom] = useState(1);
	const [closed, setClosed] = useState(() => new Set());
	const wrap = useRef(null);

	/* The reference's drag to move about: press on the empty canvas and pull. */
	useEffect(() => {
		const w = wrap.current;
		if (!w) return undefined;
		w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2;
		let dn = null;
		const down = (e) => { if (e.target.closest("button")) return; dn = { x: e.clientX, y: e.clientY, l: w.scrollLeft, t: w.scrollTop }; };
		const up = () => { dn = null; };
		const move = (e) => { if (!dn) return; w.scrollLeft = dn.l - (e.clientX - dn.x); w.scrollTop = dn.t - (e.clientY - dn.y); };
		w.addEventListener("pointerdown", down);
		window.addEventListener("pointerup", up);
		w.addEventListener("pointermove", move);
		return () => {
			w.removeEventListener("pointerdown", down);
			window.removeEventListener("pointerup", up);
			w.removeEventListener("pointermove", move);
		};
	}, [roots.length]);

	const toggle = (id) => setClosed((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
	const managers = people.filter((e) => kids.has(e.name) && e.reports_to);
	const node = (e) => {
		const team = kids.get(e.name) || [];
		const shut = closed.has(e.name);
		return (
			<li key={e.name} className={shut ? "k-closed" : undefined}>
				<div className="k-onode">
					<button type="button" onClick={() => openEmployee(e.name)}
						style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
						<KitAvatar name={e.employee_name} size={44} />
						<b>{e.employee_name}</b>
						<small>{e.designation || "—"}</small>
					</button>
					{team.length ? (
						<button type="button" className="k-cnt" onClick={() => toggle(e.name)}
							aria-label={`${shut ? "Show" : "Hide"} ${team.length} reports`}>
							<KitIcon name={shut ? "plus" : "minus"} size={10} stroke={3} />{team.length}
						</button>
					) : null}
				</div>
				{team.length ? <ul>{team.map(node)}</ul> : null}
			</li>
		);
	};

	return (
		<div className="kit k-enter">
			<PageHead title="Org chart" sub="How teams and reporting lines fit together.">
				<div className="k-seg k-ic" role="group" aria-label="Zoom">
					<button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}>
						<KitIcon name="zout" size={18} stroke={2} />
					</button>
					<button type="button" aria-label="Reset zoom" style={{ minWidth: 56 }} onClick={() => setZoom(1)}>
						{Math.round(zoom * 100)}%
					</button>
					<button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}>
						<KitIcon name="zin" size={18} stroke={2} />
					</button>
				</div>
				<button type="button" className="k-btn k-btn-line"
					onClick={() => setClosed(closed.size ? new Set() : new Set(managers.map((e) => e.name)))}>
					{closed.size ? "Expand all" : "Collapse teams"}
				</button>
			</PageHead>
			{roots.length ? (
				<div className="k-card k-org-wrap" ref={wrap}>
					<div className="k-org" style={{ transform: `scale(${zoom})` }}>
						<ul>{roots.map(node)}</ul>
					</div>
				</div>
			) : (
				<div className="k-card">
					<EmptyState icon="users" title="No reporting lines yet"
						sub="Nobody active here has a Reports To set. Set it on a person's record and they appear here under their manager." />
				</div>
			)}
			{alone.length ? (
				<div className="k-card" style={{ marginTop: 20 }}>
					<div className="k-card-h"><h3>Not in a reporting line · {alone.length}</h3></div>
					<div className="k-tagbox">
						{alone.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name))).map((e) => (
							<button type="button" className="k-tag" key={e.name} onClick={() => openEmployee(e.name)}>
								{e.employee_name}
							</button>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
