import { useEffect, useState } from "react";

import { patch, useApp } from "@/store";
import { apiCreate } from "@/api/client";
import { loadOnBoard } from "@/api/load";
import { go } from "@/routes/router";
import { heldBy, issuable, problems } from "@/lib/assign";
import { dmy, todayIso } from "@/lib/format";
import KitIcon from "@/components/kit/KitIcon";
import { EmptyState, Pill } from "@/components/kit/ui";
import { toast } from "@/components/kit/overlay";

/* ---------------------------------------------------------------------------
   Assets on the way in and on the way out.

   **In** — the laptop, the phone, the helmet — handed over from the screen
   where somebody is being onboarded (their onboarding checklist, and Create
   Employee's done screen), rather than by somebody remembering On Board →
   Assets Assignment afterwards.

   **Out** — everything a leaver still holds, on their offboarding checklist,
   so nobody signs the settlement off with a laptop still out.

   **Each handover is an ordinary `Asset Assignment`**, written exactly as
   Assets Assignment writes it, so the server's rules run on every row: the
   asset must be submitted and with nobody, the person active, and saving it
   moves the asset to them through `Asset Movement` (manna_hr/assets.py). One
   request per asset, and a refusal does not stop the rest — each is its own
   handover, and the site's sentence is kept against the asset it was about.
   --------------------------------------------------------------------------- */

/** On Board's register read, made once and only when somebody gets here —
    the same bargain the profile's Assets tab makes. */
export function useAssetRegister(wanted = true) {
	const s = useApp();
	useEffect(() => {
		if (wanted && !s.onboardRead) void loadOnBoard();
	}, [wanted, s.onboardRead]);
	return Boolean(s.onboardRead && !s.onboardBusy);
}

/** Open Assets Assignment on one person. */
export function openAssignments(employee) {
	patch("asg", { emp: employee, q: "", list: false, page: 1, pick: "", status: "" });
	go({ section: "onboard", subtab: "assignment" });
}

const subOf = (h) => [h.asset_type, h.serial, h.units > 1 ? `${h.units} units` : "",
	h.assign_date ? `since ${dmy(h.assign_date)}` : ""].filter(Boolean).join(" · ");

/** What somebody is holding, as rows. Shared by both halves. */
function HeldRows({ held }) {
	return (
		<ul className="k-assets">
			{held.map((h) => (
				<li key={h.asset} title={h.assignment
					? `Asset Assignment ${h.assignment} — ${h.status}`
					: "The asset names this person as custodian. No handover contract was written for it."}>
					<span className="k-grow">
						<b>{h.asset_name}</b>
						<small className="k-muted">{subOf(h) || "—"}</small>
					</span>
					<Pill status={h.status === "Assigned" ? "Pending" : "Low"}>{h.status}</Pill>
				</li>
			))}
		</ul>
	);
}

export default function HandOverAssets({ employee, employeeName, company }) {
	const s = useApp();
	const ready = useAssetRegister();
	const [pick, setPick] = useState([]);
	const [date, setDate] = useState(todayIso());
	const [till, setTill] = useState("");
	const [q, setQ] = useState("");
	const [run, setRun] = useState({ busy: false, made: 0, errs: [] });

	const held = heldBy(employee, s.assets, s.assignments);
	const free = issuable(s.assets, s.assignments, company);
	const needle = q.trim().toLowerCase();
	const listed = needle
		? free.filter((a) => [a.asset_name, a.name, a.asset_category, a.serial_no]
			.some((v) => String(v || "").toLowerCase().includes(needle)))
		: free;

	/* The same arithmetic the server runs, on the one thing that can be wrong
	   here: a Valid Till before the day it went out. */
	const said = till ? problems({ employee, asset: "x", assign_units: 1, assign_date: date, valid_till: till }) : [];
	const toggle = (name) => setPick((p) => (p.includes(name) ? p.filter((n) => n !== name) : p.concat(name)));

	async function handOver() {
		setRun({ busy: true, made: 0, errs: [] });
		let made = 0;
		const errs = [];
		for (const asset of pick) {
			const doc = { employee, asset, assign_units: 1, assign_date: date };
			/* Left out rather than sent as "" — Frappe refuses an empty Date. */
			if (till) doc.valid_till = till;
			try {
				await apiCreate("Asset Assignment", doc);
				made++;
			} catch (e) {
				const a = free.find((x) => x.name === asset);
				errs.push(`${a?.asset_name || asset}: ${String(e.message || e).slice(0, 200)}`);
			}
		}
		/* Re-read rather than spliced in: the status, the code and the custodian
		   are all the server's to fill, and they are what this card lists. */
		await loadOnBoard();
		setPick([]);
		setRun({ busy: false, made, errs });
		if (made) toast(`${made} handed over`);
	}

	const blocked = !ready ? "Reading the asset register…"
		: s.assetErr ? `The asset register could not be read. ${s.assetErr}`
			: s.assignErr ? `Asset Assignment could not be read, so there is nowhere to write a handover until the manna_hr app is installed on the site. ${s.assignErr}`
				: "";

	return (
		<section className="k-card k-ho" aria-label="Hand over assets">
			<div className="k-card-h">
				<div>
					<h3>Hand over assets</h3>
					<span className="k-muted">What goes out with {employeeName || employee} on joining</span>
				</div>
				{!blocked && free.length ? (
					<button type="button" className="k-btn k-btn-ink k-btn-sm"
						disabled={run.busy || !pick.length || said.length > 0}
						title={pick.length
							? `Write ${pick.length} handover(s) to the site, dated ${dmy(date)}.`
							: "Tick what is going out with this person first."}
						onClick={() => void handOver()}>
						<KitIcon name="tick" size={16} stroke={2} />
						{run.busy ? "Handing over…" : pick.length ? `Hand over ${pick.length}` : "Hand over"}
					</button>
				) : null}
			</div>

			{held.length ? (
				<>
					<div className="k-group-h">With them now<span className="k-pill k-p-grey k-nodot">{held.length}</span></div>
					<HeldRows held={held} />
				</>
			) : null}

			{blocked ? (
				<p className="k-muted">{blocked}</p>
			) : !free.length ? (
				<p className="k-muted">
					No asset is free to hand over{company ? ` in ${company}` : ""} — every submitted one is
					with somebody already. Add one on On Board → Assets Details.
				</p>
			) : (
				<>
					<div className="k-ho-bar">
						<input className="k-inp" type="search" placeholder="Search assets…" aria-label="Search assets"
							value={q} onChange={(e) => setQ(e.target.value)} />
						<div className="k-field">
							<label htmlFor="ho-date">Assign date</label>
							<input id="ho-date" className="k-inp" type="date" value={date}
								onChange={(e) => setDate(e.target.value || todayIso())} />
						</div>
						<div className={`k-field${said.length ? " k-bad" : ""}`}>
							<label htmlFor="ho-till" title="The date it is lent until. Optional — most things are lent for as long as somebody works here.">
								Valid till
							</label>
							<input id="ho-till" className="k-inp" type="date" value={till} min={date}
								onChange={(e) => setTill(e.target.value)} />
						</div>
					</div>
					{said.length ? <small className="k-err" role="alert">{said.join(" ")}</small> : null}

					<div className="k-group-h">Free to hand over<span className="k-pill k-p-grey k-nodot">{free.length}</span></div>
					<ul className="k-assets k-pickable">
						{listed.map((a) => (
							<li key={a.name}>
								<label>
									<input type="checkbox" className="k-chk" checked={pick.includes(a.name)}
										aria-label={`Hand over ${a.asset_name || a.name}`}
										onChange={() => toggle(a.name)} />
									<span className="k-grow">
										<b>{a.asset_name || a.name}</b>
										<small className="k-muted">
											{[a.asset_category, a.serial_no, a.name].filter(Boolean).join(" · ")}
										</small>
									</span>
								</label>
							</li>
						))}
						{!listed.length ? <li className="k-muted">Nothing matches “{q}”.</li> : null}
					</ul>
				</>
			)}

			{run.made ? <p className="k-ok">{run.made} handed over.</p> : null}
			{run.errs.length ? (
				<div className="k-alert k-ho-bad" role="alert">
					<p>
						<b>The site refused {run.errs.length}.</b>
						{run.errs.map((e) => <span key={e} className="k-ho-line">{e}</span>)}
					</p>
				</div>
			) : null}
		</section>
	);
}

/** Everything a leaver still holds, and the way to take it back. */
export function AssetsToCollect({ employee, employeeName }) {
	const s = useApp();
	const ready = useAssetRegister();
	const held = ready ? heldBy(employee, s.assets, s.assignments) : [];
	return (
		<section className="k-card k-ho" aria-label="Assets to collect">
			<div className="k-card-h">
				<div>
					<h3>Assets to collect</h3>
					<span className="k-muted">
						{!ready ? "Reading the asset register…"
							: s.assetErr ? `The asset register could not be read. ${s.assetErr}`
								: held.length ? `${employeeName || employee} still holds ${held.length} — collect before the settlement`
									: `Nothing is out with ${employeeName || employee}`}
					</span>
				</div>
				{ready && held.length ? (
					<button type="button" className="k-btn k-btn-line k-btn-sm"
						title="Open Assets Assignment on this person, with every handover they still hold listed."
						onClick={() => openAssignments(employee)}>
						<KitIcon name="right" size={16} stroke={2} />Collect assets
					</button>
				) : null}
			</div>
			{ready && held.length ? <HeldRows held={held} />
				: ready && !s.assetErr ? <EmptyState icon="check" title="All assets returned" sub="Nothing names this person as custodian, and no handover is open." />
					: null}
		</section>
	);
}
