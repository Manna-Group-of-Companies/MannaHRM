/* ---------------------------------------------------------------------------
   The HRDashboard reference's two charts, as React components
   (21 October 2026): its `lineChart` and its `donutSvg` / `donutBlock`.

   The same drawing — the same smooth curve, the hover band and dots, the
   tooltip, the arcs sweeping in — with its colours as roles: a series' colour
   is a role name (`chart-1`), drawn `rgb(var(--chart-1))`, so a chart follows
   the palette and the checker holds every hue to 3:1 on the card.
   --------------------------------------------------------------------------- */

import { useEffect, useState } from "react";

const role = (name) => `rgb(var(--${name}))`;

/** The reference's curve through a list of points (a Catmull-Rom spline as
    cubic Béziers). */
export function smoothPath(p) {
	if (!p.length) return "";
	let d = `M${p[0][0]},${p[0][1]}`;
	for (let i = 0; i < p.length - 1; i++) {
		const p0 = p[i - 1] || p[i];
		const p1 = p[i];
		const p2 = p[i + 1];
		const p3 = p[i + 2] || p2;
		d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
	}
	return d;
}

const reduced = () =>
	typeof window === "undefined" || !window.matchMedia
	|| !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

/** Lines over months. `series` is `[{ name, tone, data }]`; `fmt` writes a
    value for the axis and the tooltip. */
export function LineChart({ labels, series, min, max, fmt = (v) => v, label = "Chart", w = 620, h = 270 }) {
	const [at, setAt] = useState(-1);
	const n = labels.length;
	const pl = 46;
	const pr = 12;
	const pt = 12;
	const pb = 34;
	const all = series.flatMap((s) => s.data).filter((v) => Number.isFinite(v));
	let mn = min ?? Math.floor(Math.min(...all, 0) * 0.9);
	let mx = max ?? Math.ceil(Math.max(...all, 1) * 1.1);
	if (mx === mn) mx = mn + 1;
	const y = (v) => pt + ((mx - v) / (mx - mn)) * (h - pt - pb);
	const step = (w - pl - pr) / Math.max(1, n - 1);
	const x = (i) => pl + i * step;
	const bw = Math.min(40, step * 0.6);
	const animate = !reduced();

	const ticks = [0, 1, 2, 3, 4].map((k) => mn + ((mx - mn) * k) / 4);
	const move = (ev) => {
		const rc = ev.currentTarget.getBoundingClientRect();
		const sx = ((ev.clientX - rc.left) / rc.width) * w;
		setAt(Math.max(0, Math.min(n - 1, Math.round((sx - pl) / step))));
	};
	const top = at >= 0 ? Math.max(...series.map((s) => s.data[at] ?? mn)) : mn;

	return (
		<div className="k-chart-wrap">
			<svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: "block", overflow: "visible", touchAction: "pan-y" }}
				role="img" aria-label={label} onPointerMove={move} onPointerLeave={() => setAt(-1)}>
				{ticks.map((v) => (
					<text key={"t" + v} x="0" y={y(v) + 4} fontSize="11.5" fill="rgb(var(--ink-2))">{fmt(Math.round(v * 10) / 10)}</text>
				))}
				{labels.map((m, i) => (
					<g key={"l" + i}>
						<line x1={x(i)} x2={x(i)} y1={pt} y2={h - pb} stroke="rgb(var(--line))" />
						<text x={x(i)} y={h - 8} fontSize="11.5" textAnchor="middle" fill="rgb(var(--ink-2))">{m}</text>
					</g>
				))}
				<rect x={at >= 0 ? x(at) - bw / 2 : pl - bw / 2} y={pt} height={h - pt - pb} width={bw} rx="8"
					fill="rgb(var(--wash))" opacity={at >= 0 ? 1 : 0} />
				{series.map((s, k) => (
					<path key={s.name} d={smoothPath(s.data.map((v, i) => [x(i), y(v ?? mn)]))}
						className={animate ? "k-draw" : undefined} pathLength={animate ? 1 : undefined}
						style={{ animationDelay: `${0.2 + k * 0.25}s` }}
						fill="none" stroke={role(s.tone)} strokeWidth="2.5" strokeLinecap="round" />
				))}
				{series.map((s) => (
					<circle key={"d" + s.name} r="5" cx={at >= 0 ? x(at) : pl} cy={y(s.data[Math.max(0, at)] ?? mn)}
						fill={role(s.tone)} stroke="rgb(var(--card))" strokeWidth="2.5" opacity={at >= 0 ? 1 : 0} />
				))}
			</svg>
			<div className="k-tip" style={{
				opacity: at >= 0 ? 1 : 0,
				left: at >= 0 ? `${(x(at) / w) * 100}%` : 0,
				top: `${(y(top) / h) * 100}%`,
			}}>
				{at >= 0 ? (
					<>
						<b>{labels[at]}</b>
						{series.map((s) => ` · ${s.name} ${fmt(s.data[at] ?? 0)}`).join("")}
					</>
				) : null}
			</div>
		</div>
	);
}

/** The reference's donut: a grey ring and one arc per segment, drawn in from
    nothing when it arrives. `segments` are `[{ label, value, tone }]`. */
export function DonutSvg({ segments, size = 200, stroke = 24 }) {
	const r = (size - stroke) / 2 - 2;
	const C = 2 * Math.PI * r;
	const total = segments.reduce((s, x) => s + x.value, 0);
	const lit = segments.filter((x) => x.value).length;
	/* Drawn at nothing first and at their length a frame later, so the arcs
	   sweep in through the stylesheet's transition. */
	const [shown, setShown] = useState(reduced());
	useEffect(() => {
		if (shown) return;
		let a = 0;
		let b = 0;
		a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setShown(true)); });
		return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
	}, [shown]);
	let acc = 0;
	return (
		<svg className="k-dsvg" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
			aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
			<circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--wash))" strokeWidth={stroke} />
			{segments.map((s, i) => {
				const len = total ? (s.value / total) * C : 0;
				const gap = s.value && lit > 1 ? 4 : 0;
				const fin = Math.max(0, len - gap);
				const off = -acc;
				acc += len;
				return (
					<circle key={s.label} className="k-arc" cx={size / 2} cy={size / 2} r={r} fill="none"
						stroke={role(s.tone)} strokeWidth={stroke}
						strokeDasharray={`${shown ? fin : 0} ${C}`} strokeDashoffset={off}
						style={{ transitionDelay: `${150 + i * 120}ms` }}
						transform={`rotate(-90 ${size / 2} ${size / 2})`} />
				);
			})}
		</svg>
	);
}

/** The donut with its total in the middle and a legend under it. Each legend
    row is a button when `onPick` is given. */
export function DonutBlock({ segments, center, sub, onPick }) {
	const total = segments.reduce((s, x) => s + x.value, 0);
	return (
		<>
			<div className="k-donut">
				<DonutSvg segments={segments} />
				<div className="k-donut-c">
					<div>
						<b>{(center ?? total).toLocaleString()}</b>
						<span>{sub}</span>
					</div>
				</div>
			</div>
			{segments.map((s) => (
				<button key={s.label} type="button" className="k-dl" onClick={onPick ? () => onPick(s) : undefined}
					disabled={!onPick}>
					<span><i style={{ background: role(s.tone) }} />{s.label}</span>
					<b>{s.value}</b>
				</button>
			))}
		</>
	);
}
