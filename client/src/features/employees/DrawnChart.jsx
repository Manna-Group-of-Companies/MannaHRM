import { useRef, useState } from "react";
import {
	CARD_W, GRID, addCard, canReportTo, extent, heightOf, links, moveCard, onChart, removeCard, setParent, snap,
} from "@/lib/orgchart";

/* ---------------------------------------------------------------------------
   A company's chart as HR drew it — and, with `editing`, the place it is drawn
   (14 October 2026). The rules are lib/orgchart.js; this is the canvas.

   Cards sit where they were left, lines go from each card up to the card it
   reports to, and in edit mode a card follows the pointer, snapped to the
   grid, or the arrow keys once it has focus. The card's own buttons (open a
   record, add resumes) are switched off while editing: a press there is the
   start of a drag, not a click.
   --------------------------------------------------------------------------- */

const PAD = 24;

/**
 * @param {{chart: object, editing: boolean, onChange: (chart: object) => void,
 *          card: (c: object) => JSX.Element, name: (c: object) => string,
 *          people: object[]}} props
 *   `card` draws one card's face; `name` is what a card is called in the
 *   Reports to list; `people` is who the Add employee list offers.
 */
export default function DrawnChart({ chart, editing, onChange, card, name, people }) {
	const drag = useRef(null);
	/* Panning (asked for 14 October 2026): the canvas has no scrollbars, and is
	   moved by holding the mouse on empty space and dragging, like a map. A
	   press on a card is that card's — opened when viewing, moved when editing. */
	const wrap = useRef(null);
	const pan = useRef(null);
	const [panning, setPanning] = useState(false);
	const [pick, setPick] = useState("");
	const [seat, setSeat] = useState("");
	const [label, setLabel] = useState("");
	const { w, h } = extent(chart);
	/* Room past the last card while editing, so there is somewhere to drag to. */
	const room = editing ? CARD_W + PAD : 0;
	const cw = w + PAD * 2 + room;
	const ch = h + PAD * 2 + room;
	const lines = links(chart);
	const taken = onChart(chart);
	const free = (people || []).filter((e) => !taken.has(e.name));

	const down = (e, c) => {
		if (!editing || e.button > 0 || e.target.closest(".hcfctl")) return;
		e.currentTarget.setPointerCapture?.(e.pointerId);
		drag.current = { id: c.id, sx: e.clientX, sy: e.clientY, x: c.x, y: c.y };
	};
	const grab = (e) => {
		if (e.button > 0 || e.target.closest(".hcfcard") || !wrap.current) return;
		e.currentTarget.setPointerCapture?.(e.pointerId);
		pan.current = { sx: e.clientX, sy: e.clientY, left: wrap.current.scrollLeft, top: wrap.current.scrollTop };
		setPanning(true);
	};
	const move = (e) => {
		if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
		const p = pan.current;
		if (p && wrap.current) {
			wrap.current.scrollLeft = p.left - (e.clientX - p.sx);
			wrap.current.scrollTop = p.top - (e.clientY - p.sy);
			return;
		}
		const d = drag.current;
		if (!d) return;
		const x = snap(d.x + e.clientX - d.sx);
		const y = snap(d.y + e.clientY - d.sy);
		const at = chart.cards.find((c) => c.id === d.id);
		if (at && (at.x !== x || at.y !== y)) onChange(moveCard(chart, d.id, x, y));
	};
	const up = () => {
		drag.current = null;
		if (pan.current) { pan.current = null; setPanning(false); }
	};
	const nudge = (e, c) => {
		const step = e.shiftKey ? GRID * 4 : GRID;
		const by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
		if (!editing || !by || e.target.closest(".hcfctl")) return;
		e.preventDefault();
		onChange(moveCard(chart, c.id, c.x + by[0], c.y + by[1]));
	};

	return (
		<div className="hcfreebox">
			{editing ? (
				<div className="hcftools">
					<label className="lbl">Employee
						<select aria-label="Employee to add" value={pick} onChange={(e) => setPick(e.target.value)}>
							<option value="">— choose —</option>
							{free.map((e) => <option key={e.name} value={e.name}>{e.employee_name || e.name}{e.designation ? ` — ${e.designation}` : ""}</option>)}
						</select>
					</label>
					<button type="button" className="embtn" disabled={!pick}
						onClick={() => { onChange(addCard(chart, { kind: "person", emp: pick })); setPick(""); }}>
						Add employee
					</button>
					<label className="lbl">Seat
						<input aria-label="Vacant seat to add" value={seat} placeholder="Logistics Head" onChange={(e) => setSeat(e.target.value)} />
					</label>
					<button type="button" className="embtn" disabled={!seat.trim()}
						onClick={() => { onChange(addCard(chart, { kind: "seat", role: seat.trim() })); setSeat(""); }}>
						Add vacant seat
					</button>
					<label className="lbl">Title
						<input aria-label="Title to add" value={label} placeholder="Department heads" onChange={(e) => setLabel(e.target.value)} />
					</label>
					<button type="button" className="embtn" disabled={!label.trim()}
						onClick={() => { onChange(addCard(chart, { kind: "label", text: label.trim() })); setLabel(""); }}>
						Add title
					</button>
				</div>
			) : null}

			{/* The handlers are on the box, not the canvas: a small chart is
			    centred in it, and the margin beside it is empty space too. */}
			<div className={"hcfreewrap" + (panning ? " hcpanning" : "")} ref={wrap}
				onPointerDown={grab} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
				<div className={"hcfree" + (editing ? " hcedit" : "")}
					style={{ width: cw, height: ch }}>
					<svg className="hcflines" width={cw} height={ch} aria-hidden="true">
						<g transform={`translate(${PAD} ${PAD})`}>
							{lines.map((l) => <path key={l.id} d={l.d} />)}
						</g>
					</svg>
					{chart.cards.map((c) => (
						<div key={c.id} className={"hcfcard" + (c.kind === "label" ? " hcflabel" : "")}
							style={{ left: c.x + PAD, top: c.y + PAD, width: CARD_W, height: heightOf(c) }}
							tabIndex={editing ? 0 : undefined}
							aria-label={editing ? `${name(c)} — drag, or use the arrow keys, to move` : undefined}
							onPointerDown={(e) => down(e, c)} onKeyDown={(e) => nudge(e, c)}>
							{c.kind === "label" ? <span className="hcrowlabel">{c.text}</span> : card(c)}
							{editing ? (
								<div className="hcfctl">
									{c.kind !== "label" ? (
										<select aria-label={`${name(c)} reports to`} value={c.parent || ""}
											onChange={(e) => onChange(setParent(chart, c.id, e.target.value))}>
											<option value="">Reports to —</option>
											{chart.cards.filter((p) => p.id !== c.id && p.kind !== "label" && canReportTo(chart, c.id, p.id))
												.map((p) => <option key={p.id} value={p.id}>{name(p)}</option>)}
										</select>
									) : null}
									<button type="button" className="hcfx" aria-label={`Remove ${name(c)}`}
										onClick={() => onChange(removeCard(chart, c.id))}>×</button>
								</div>
							) : null}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
