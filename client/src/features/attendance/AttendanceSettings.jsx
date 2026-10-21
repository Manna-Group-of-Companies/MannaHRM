/** Attendance Settings, as the HRDashboard reference draws it (21 October
 *  2026), on this site's records.
 *
 *  General (D13): the reference has one working day for the company. This site
 *  has a Shift Type per shift, so the tab picks one and edits what the
 *  reference's form edits — when work starts, when it ends, and the minutes
 *  after the start before a late mark — on that shift. Its remote, selfie and
 *  automatic clock-out switches have no single home here (the phone app and
 *  each Employee hold them) and are not drawn.
 *
 *  Location: the check-in places, which are Work Locations; they are made and
 *  changed on the Work Locations page.
 *
 *  A night shift ends before it starts — that is what makes it a night — so
 *  the reference's "must end after it starts" is not asked here.
 */

import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { navigate } from "@/routes/router";
import { apiWrite, getDoc } from "@/api/client";
import { loadShiftTypes } from "@/api/shifttype";
import { loadWorkLocations } from "@/api/load";
import { toInput, toSite } from "@/data/shiftwizard";
import KitIcon from "@/components/kit/KitIcon";
import { EmptyState, PageHead } from "@/components/kit/ui";
import { toast } from "@/components/kit/overlay";

function General() {
	const s = useApp();
	const shifts = (s.shiftTypes || []).map((r) => r.name).sort();
	const [pick, setPick] = useState("");
	const [doc, setDoc] = useState(null);
	const [f, setF] = useState(null);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const name = pick || shifts[0] || "";

	useEffect(() => {
		if (!name) return undefined;
		let live = true;
		setDoc(null);
		setErr("");
		getDoc("Shift Type", name).then((d) => {
			if (!live) return;
			setDoc(d || {});
			setF({ start: toInput(d?.start_time), end: toInput(d?.end_time), late: String(d?.late_entry_grace_period ?? 0) });
		});
		return () => { live = false; };
	}, [name]);

	if (!shifts.length) {
		return <EmptyState icon="clock" title="No shifts yet" sub="Make one on Manage Shift, then set its hours here." />;
	}
	const save = async (e) => {
		e.preventDefault();
		if (!f.start || !f.end) { setErr("Give both times"); return; }
		const late = Math.max(0, Math.round(Number(f.late) || 0));
		const patch = {};
		if (toSite(f.start) !== toSite(toInput(doc.start_time))) patch.start_time = toSite(f.start);
		if (toSite(f.end) !== toSite(toInput(doc.end_time))) patch.end_time = toSite(f.end);
		if (late !== Number(doc.late_entry_grace_period || 0)) patch.late_entry_grace_period = late;
		/* Ticked when a grace is given, never unticked — the rule Manage Shift
		   keeps: hrms reads the grace only when late marking is on, and turning
		   off marking somebody set on the desk is a change nobody asked for. */
		if (late > 0 && !Number(doc.enable_late_entry_marking)) patch.enable_late_entry_marking = 1;
		if (!Object.keys(patch).length) { toast("Nothing changed"); return; }
		setBusy(true);
		setErr("");
		const r = await apiWrite("Shift Type", name, patch);
		setBusy(false);
		if (!r.ok) { setErr(`The site refused this: ${r.error}`); return; }
		setDoc({ ...doc, ...patch });
		void loadShiftTypes().catch(() => null);
		toast(`${name} saved`);
	};

	return (
		<form noValidate onSubmit={save}>
			<div className="k-form-grid" style={{ maxWidth: 640 }}>
				<div className="k-field k-full">
					<label htmlFor="as-shift">Shift</label>
					<select id="as-shift" className="k-sel" value={name} onChange={(e) => setPick(e.target.value)}>
						{shifts.map((n) => <option key={n}>{n}</option>)}
					</select>
				</div>
				{!f ? <div className="k-sk k-full" style={{ height: 120 }} /> : (
					<>
						<div className="k-field">
							<label htmlFor="as-start">Work starts</label>
							<input id="as-start" className="k-inp" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
						</div>
						<div className="k-field">
							<label htmlFor="as-end">Work ends</label>
							<input id="as-end" className="k-inp" type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
						</div>
						<div className="k-field">
							<label htmlFor="as-late">Late after (minutes)</label>
							<input id="as-late" className="k-inp" type="number" min="0" max="240" value={f.late} onChange={(e) => setF({ ...f, late: e.target.value })} />
							<span className="k-hint">Grace period after the start time.</span>
						</div>
					</>
				)}
			</div>
			{err ? <p className="k-err" role="alert" style={{ marginTop: 12 }}>{err}</p> : null}
			<div className="k-modal-f">
				<button type="button" className="k-btn k-btn-line" onClick={() => navigate("attendance", "shifts")}>All shift settings</button>
				<button type="submit" className="k-btn k-btn-ink" disabled={busy || !f}>{busy ? "Saving…" : "Save changes"}</button>
			</div>
		</form>
	);
}

function Location() {
	const s = useApp();
	useEffect(() => { void loadWorkLocations(); }, []);
	const locs = s.workLocs || [];
	return (
		<>
			<div className="k-sec-h">
				<h3>Check-in locations</h3>
				<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={() => navigate("attendance", "locations")}>
					<KitIcon name="plus" size={16} stroke={2} />Manage locations
				</button>
			</div>
			{locs.length ? (
				<div className="k-grid2" style={{ marginTop: 16 }}>
					{locs.map((o) => (
						<div className="k-sec" style={{ margin: 0 }} key={o.name}>
							<div className="k-map">
								<span className="k-pin"><KitIcon name="pin" size={30} stroke={2.2} /></span>
							</div>
							<div className="k-sec-h" style={{ margin: "14px 0 4px" }}>
								<h3>{o.location_name || o.name}</h3>
								{Number(o.is_active) === 0 ? <span className="k-pill k-p-grey k-nodot">Not in use</span> : null}
							</div>
							<div className="k-muted" style={{ fontSize: 13 }}>
								{o.latitude && o.longitude ? `${Number(o.latitude).toFixed(5)}, ${Number(o.longitude).toFixed(5)}` : "No coordinates yet"}
							</div>
						</div>
					))}
				</div>
			) : (
				<EmptyState icon="pin" title="No locations yet" sub="Add one to let the phone app check people in near it." />
			)}
		</>
	);
}

export default function AttendanceSettings() {
	const [tab, setTab] = useState("general");
	return (
		<div className="kit k-enter">
			<PageHead title="Attendance Settings" sub={tab === "general" ? "Working hours and late marks, shift by shift" : "Where people can check in from"} />
			<div className="k-card">
				<div className="k-vtabs" role="tablist" aria-label="Attendance settings">
					{[["general", "General"], ["location", "Location"]].map(([k, l]) => (
						<button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "k-on" : undefined}
							onClick={() => setTab(k)}>{l}</button>
					))}
				</div>
				{tab === "general" ? <General /> : <Location />}
			</div>
		</div>
	);
}
