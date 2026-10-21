/* ---------------------------------------------------------------------------
   The HRDashboard reference's overlays, as React components (21 October
   2026): its `modal` with `mh` and `mf`, its `confirmBox`, its `toast`, and its
   three-dot `menu`. The same markup with the classes prefixed `k-`.
   --------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { useApp, set, getState } from "@/store";
import KitIcon from "@/components/kit/KitIcon";

/** A dialog on the reference's dimmed backdrop: Escape and a click on the
    backdrop close it, and it takes the focus when it opens. */
export function KitModal({ title, sub, onClose, children, wide = false }) {
	const box = useRef(null);
	useEffect(() => {
		const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
		document.addEventListener("keydown", onKey, true);
		const first = box.current?.querySelector("input, select, textarea, button:not([data-close])");
		first?.focus();
		return () => document.removeEventListener("keydown", onKey, true);
	}, [onClose]);
	return (
		<div className="k-ov k-show" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
			<div className="k-modal" role="dialog" aria-modal="true" aria-label={title} ref={box}
				style={wide ? { maxWidth: 720 } : undefined}>
				<div className="k-m-head">
					<div>
						<h2>{title}</h2>
						{sub ? <p className="k-sub-t">{sub}</p> : <div style={{ height: 16 }} />}
					</div>
					<button type="button" className="icon-btn" data-close="" aria-label="Close"
						style={{ margin: "-6px -8px 0 0" }} onClick={onClose}>
						<KitIcon name="x" size={20} stroke={2} />
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}

/** The reference's footer: Cancel, then the action. */
export function ModalFoot({ ok = "Save", onCancel, busy = false, danger = false }) {
	return (
		<div className="k-modal-f">
			<button type="button" className="k-btn k-btn-line" onClick={onCancel}>Cancel</button>
			<button type="submit" className={`k-btn ${danger ? "k-btn-danger" : "k-btn-ink"}`} disabled={busy}>{busy ? "Working…" : ok}</button>
		</div>
	);
}

/** "Are you sure?", the reference's way: a title, what will happen, and the
    one button that does it. */
export function Confirm({ title, sub, ok, onOk, onClose, danger = true }) {
	const [busy, setBusy] = useState(false);
	return (
		<KitModal title={title} sub={sub} onClose={onClose}>
			<form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onOk(); } finally { setBusy(false); } }}>
				<ModalFoot ok={ok} danger={danger} busy={busy} onCancel={onClose} />
			</form>
		</KitModal>
	);
}

/** Say something briefly at the foot of the screen. */
export function toast(msg) {
	set({ kitToast: { msg: String(msg), at: Date.now() } });
}

/** Where `toast` appears — once, in the shell. */
export function KitToast() {
	const { kitToast } = useApp();
	const [shown, setShown] = useState(false);
	useEffect(() => {
		if (!kitToast) return;
		setShown(true);
		const t = setTimeout(() => {
			setShown(false);
			if (getState().kitToast === kitToast) set({ kitToast: null });
		}, 2600);
		return () => clearTimeout(t);
	}, [kitToast]);
	return (
		<div className={`k-toast k-plain${shown ? " k-show" : ""}`} role="status" aria-live="polite">
			{kitToast ? (
				<>
					<span className="k-t-ic"><KitIcon name="tick" size={14} stroke={3} /></span>
					<span>{kitToast.msg}</span>
				</>
			) : null}
		</div>
	);
}

/** The reference's three-dot menu: a list of actions that opens under its
    button and shuts on the next click anywhere. `items` are
    `{ label, icon, onClick, danger }`, and `"-"` for a rule. */
export function DotsMenu({ items, label = "More" }) {
	const [open, setOpen] = useState(false);
	const root = useRef(null);
	useEffect(() => {
		if (!open) return;
		const shut = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
		const esc = (e) => { if (e.key === "Escape") setOpen(false); };
		document.addEventListener("mousedown", shut);
		document.addEventListener("keydown", esc);
		return () => { document.removeEventListener("mousedown", shut); document.removeEventListener("keydown", esc); };
	}, [open]);
	return (
		<div className={`k-menu${open ? " k-open" : ""}`} ref={root}>
			<button type="button" className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open}
				onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
				<KitIcon name="more" size={20} stroke={2} />
			</button>
			<div className="k-menu-pop" role="menu">
				{items.map((it, i) => (it === "-" ? <hr key={i} /> : (
					<button key={it.label} type="button" role="menuitem" className={it.danger ? "k-danger" : undefined}
						onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}>
						<KitIcon name={it.icon} size={16} stroke={2} />{it.label}
					</button>
				)))}
			</div>
		</div>
	);
}
