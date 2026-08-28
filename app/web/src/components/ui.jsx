import { COV_LABEL } from "@/data/sections";
import { FSTATE } from "@/data/approvals";

/* The shapes every screen is built out of. They exist as components for the
   same reason they existed as string helpers in the page this replaces: forty
   screens drawing a panel forty ways is forty screens that drift. */

/** Prose authored in this repo — a spec note, a field list's fourth column.
    Several need an arrow or a <code> span, which is why they are HTML.

    This is the *only* place markup is injected, and everything it renders is
    hand-written in `src/data/`. Nothing off the wire ever reaches it: values
    from the site go through JSX, which escapes them. */
export function Html({ html, className }) {
	return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Cov({ cov }) {
	return <span className={"cov " + cov}>{COV_LABEL[cov]}</span>;
}

export function Panel({ title, cov, ico, children }) {
	return (
		<section className={"panel" + (cov === "none" || cov === "skip" ? " dim" : "")}>
			<header>
				<h3>
					<span className="ico">{ico || "▪"}</span>
					{title}
				</h3>
				<Cov cov={cov} />
			</header>
			<div className="body">{children}</div>
		</section>
	);
}

export function Tile({ k, n, cls, s }) {
	return (
		<div className="tile">
			<span className="k">{k}</span>
			<span className={"n " + (cls || "")}>{n}</span>
			<span className="s">{s || ""}</span>
		</div>
	);
}

export const Tiles = ({ children }) => <div className="tiles">{children}</div>;
export const Cols = ({ children }) => <div className="cols">{children}</div>;

/** A finding against Factor HR: something that exists there and not here. */
export const Gap = ({ children }) => (
	<div className="gap">
		<b>Missing vs Factor HR.</b> {children}
	</div>
);

export const Note = ({ children, className }) => (
	<div className={"note" + (className ? " " + className : "")}>{children}</div>
);

/** A note under a panel body. The original spelled the gap out inline every
    time; it is one class here so the spacing cannot drift. */
export const NoteBelow = ({ children }) => (
	<div className="mt-[.7rem]">
		<Note>{children}</Note>
	</div>
);

export const Scroll = ({ children, style }) => (
	<div className="scroll" style={style}>
		{children}
	</div>
);

export function Empty({ title, children }) {
	return (
		<div className="empty">
			<b>{title}</b>
			{children}
		</div>
	);
}

/** A labelled proportion bar, biggest first. */
export function Bars({ pairs }) {
	const max = Math.max(1, ...pairs.map((p) => p[1]));
	return (
		<div className="rows">
			{pairs.map((p) => (
				<div className="row" key={p[0]}>
					<span>{p[0]}</span>
					<span className="val">{p[1]}</span>
					<span className="track">
						<i style={{ width: ((p[1] / max) * 100).toFixed(1) + "%" }} />
					</span>
				</div>
			))}
		</div>
	);
}

/** The state chip on a field-list row. A typo in a state key would otherwise
    take the whole page down with it, so an unknown key reads as "To build". */
export function FieldChip({ state }) {
	const [cov, label] = FSTATE[state] || FSTATE.build;
	return <span className={"cov " + cov}>{label}</span>;
}

/* The field list is the deliverable on a page that is not built, so it is
   rendered the same way everywhere — the approval queues, and the four On Board
   pages that have nothing behind them. A field that is live on one screen and
   missing on another should be visible as exactly that.

   The first two columns are HTML rather than text: these are hand-written lists
   in `src/data/`, and several of them need an arrow or a <code> span. */
export function SpecTable({ cols, list }) {
	return (
		<Scroll>
			<table style={{ minWidth: 820 }}>
				<thead>
					<tr>
						{cols.map((c) => (
							<th key={c}>{c}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{list.map((f, i) => (
						<tr key={f[0] + i}>
							<td>
								<Html html={f[0]} />
							</td>
							<td className="muted" style={{ whiteSpace: "normal" }}>
								<Html html={f[1]} />
							</td>
							<td>
								<FieldChip state={f[2]} />
							</td>
							<td className="muted" style={{ whiteSpace: "normal", minWidth: 280 }}>
								<Html html={f[3] || ""} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Scroll>
	);
}

/** The four-state key that heads a module page. */
export function Legend({ title, states }) {
	return (
		<div className="legend">
			<b className="font-display">{title}</b>
			{states.map(([c, why]) => (
				<span key={c}>
					<span className={"cov " + c}>{COV_LABEL[c]}</span> {why}
				</span>
			))}
		</div>
	);
}

/** One shell for every dialog, so they close the same way and cannot drift
    apart in how they look. */
export function Modal({ title, actions, why, extra, wide, msg, onClose }) {
	return (
		<div
			className="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="dlgtitle"
			/* Clicking the backdrop closes; clicking inside the box must not. */
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className={"box" + (wide ? " wide" : "")}>
				<header>
					<h3 id="dlgtitle">{title}</h3>
					<button className="x" aria-label="Close" onClick={onClose}>
						×
					</button>
				</header>
				<div className="acts">{actions}</div>
				<div className="why">
					{msg ? (
						<>
							{msg}
							<br />
						</>
					) : null}
					<span className="muted">{why}</span>
				</div>
				{extra ? <div className="px-4 pb-4">{extra}</div> : null}
				<div className="foot">
					<button className="btn ghost" onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
