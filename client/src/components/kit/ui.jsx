/* ---------------------------------------------------------------------------
   The HRDashboard reference's small helpers, as React components
   (21 October 2026).

   Each is the reference's function of the same name — `ph`, `pill`, `who`,
   `emptyState`, `pager`, `segTabs`, `countUp` — drawing the same markup with
   its classes prefixed `k-` (see scripts/portkit.mjs for why), so a page
   ported from the reference reads like the reference.
   --------------------------------------------------------------------------- */

import { useEffect, useLayoutEffect, useRef } from "react";
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";

/** The page heading: a title, a line under it, and the page's buttons. */
export function PageHead({ title, sub, children, className = "" }) {
	return (
		<div className={`k-ph ${className}`.trim()}>
			<div>
				<h1>{title}</h1>
				{sub ? <p>{sub}</p> : null}
			</div>
			{children ? <div className="k-ph-act">{children}</div> : null}
		</div>
	);
}

/* The reference's status → colour table (its `PC`), for the words this app
   uses. Anything it does not name is grey. */
const PILL = {
	Active: "green", Onboarding: "yellow", Offboarding: "blue", Inactive: "grey", Left: "grey", Suspended: "red",
	Approved: "green", Pending: "yellow", Open: "green", Rejected: "red", Cancelled: "grey",
	Paid: "green", Unpaid: "grey", Due: "yellow", Draft: "blue", Submitted: "green",
	Present: "green", Late: "yellow", "On Leave": "blue", "On leave": "blue", Absent: "red", "Half Day": "yellow",
	Closed: "grey", "On hold": "yellow", High: "red", Medium: "yellow", Low: "grey",
	Completed: "green", "In progress": "blue", "Not started": "grey", Hired: "green", Overdue: "red", Done: "green",
};

/** A status as the reference's pill: a dot and the word on its colour. */
export function Pill({ status, children, dot = true }) {
	const tone = PILL[status] || "grey";
	return (
		<span className={`k-pill k-p-${tone}${dot ? "" : " k-nodot"}`}>
			{children ?? (status === "Rejected" ? "Declined" : status)}
		</span>
	);
}

/** A person: their initials disc, their name, and one small line under it. */
export function Who({ name, sub }) {
	return (
		<div className="k-who">
			<KitAvatar name={name} />
			<div>
				<b>{name}</b>
				<small>{sub || ""}</small>
			</div>
		</div>
	);
}

/** Nothing to show: an icon in a grey disc, what is empty, and what to do. */
export function EmptyState({ icon = "search", title, sub, children }) {
	return (
		<div className="k-empty-st">
			<div className="k-e-ic"><KitIcon name={icon} size={24} stroke={1.8} /></div>
			<b>{title}</b>
			{sub}
			{children ? <div>{children}</div> : null}
		</div>
	);
}

/** The reference's pager: arrows, the first and last page and those either
    side of this one, and "Showing x to y of z entries". */
export function Pager({ total, page, per, onPage }) {
	const pages = Math.max(1, Math.ceil(total / per));
	const show = [];
	for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) show.push(i);
	const from = total ? (page - 1) * per + 1 : 0;
	const to = Math.min(total, page * per);
	const items = [];
	let last = 0;
	for (const i of show) {
		if (i - last > 1) items.push(<span key={"gap" + i}>…</span>);
		items.push(
			<button key={i} type="button" className={i === page ? "k-on" : undefined}
				aria-current={i === page ? "page" : undefined} onClick={() => onPage(i)}>{i}</button>,
		);
		last = i;
	}
	return (
		<div className="k-pager">
			<div className="k-pages">
				<button type="button" className="k-arw" disabled={page <= 1} aria-label="Previous page"
					onClick={() => onPage(page - 1)}><KitIcon name="left" size={16} stroke={2} /></button>
				{items}
				<button type="button" className="k-arw" disabled={page >= pages} aria-label="Next page"
					onClick={() => onPage(page + 1)}><KitIcon name="right" size={16} stroke={2} /></button>
			</div>
			<span>Showing {from} to {to} of {total} entries</span>
		</div>
	);
}

/** The reference's segmented switch (its `.seg`): a grey well, the chosen one
    white. `options` are `[value, label]`. */
export function Seg({ options, value, onChange, label }) {
	return (
		<div className="k-seg" role="group" aria-label={label}>
			{options.map(([v, l]) => (
				<button key={v} type="button" className={v === value ? "k-on" : undefined}
					aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>
			))}
		</div>
	);
}

/** The reference's sliding tabs (its `segTabs` and `placeTabs`): the chosen
    tab's white pill slides to it. `count`, when given, is a number after each
    label. */
export function SegTabs({ tabs, value, onChange, count, label }) {
	const box = useRef(null);
	const prev = useRef(null);
	useLayoutEffect(() => {
		const el = box.current;
		const on = el?.querySelector("button.k-on");
		const ind = el?.querySelector(".k-ind");
		if (!on || !ind) return;
		const to = { l: on.offsetLeft, w: on.offsetWidth };
		/* From where it was to where it is: set the old place with no
		   transition, then the new one with it. */
		if (prev.current) {
			ind.style.transition = "none";
			ind.style.left = prev.current.l + "px";
			ind.style.width = prev.current.w + "px";
			void ind.offsetWidth;
			ind.style.transition = "";
		}
		ind.style.left = to.l + "px";
		ind.style.width = to.w + "px";
		prev.current = to;
	}, [value, tabs.length]);
	return (
		<div className="k-tabs" role="tablist" aria-label={label} ref={box}>
			<span className="k-ind" aria-hidden="true" />
			{tabs.map((t) => {
				const [v, l] = Array.isArray(t) ? t : [t, t];
				return (
					<button key={v} type="button" role="tab" aria-selected={v === value}
						className={v === value ? "k-on" : undefined} onClick={() => onChange(v)}>
						{l}
						{count ? <span className="k-c">{count(v)}</span> : null}
					</button>
				);
			})}
		</div>
	);
}

const reduced = () =>
	typeof window === "undefined" || !window.matchMedia
	|| !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

/** A figure that counts up from nought when it arrives, as the reference's
    do — 900ms, easing out. The final figure is what is rendered; the count
    only rewrites the text on the way there, so a screen reader and a test
    read the real number. */
export function CountUp({ value }) {
	const el = useRef(null);
	useEffect(() => {
		const node = el.current;
		const to = Number(value);
		if (!node || !Number.isFinite(to) || reduced() || typeof requestAnimationFrame !== "function") return;
		const t0 = performance.now();
		let raf = 0;
		const step = (t) => {
			const p = Math.min(1, (t - t0) / 900);
			node.textContent = Math.round(to * (1 - (1 - p) ** 3)).toLocaleString();
			if (p < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [value]);
	return <b ref={el}>{Number.isFinite(Number(value)) ? Number(value).toLocaleString() : value}</b>;
}

/** The reference's arrival: blocks rise into place one after another when a
    page opens. Give each block `className="k-anim"` and `style={stagger(i)}`;
    the page root carries `k-enter` for the second and a half it takes. */
export const stagger = (i) => ({ "--i": Math.min(i, 10) });
