import { COV_LABEL } from "@/data/sections";
import { EXPORT_FORMATS } from "@/data/attendance";
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

/** Factor HR's export split button: the format last chosen sits on the button,
    the rest of the list is behind the caret. Two reports carry it, so it lives
    here — the same five words in two menus that do different things is the
    drift this file exists to stop.

    The caller owns the state and does the work; this draws the control. Picking
    from the list runs it there and then, because a menu that only changes a
    setting makes the person press a second button to get a file. */
export function ExportMenu({ fmt, open, onToggle, onPick }) {
	const cur = EXPORT_FORMATS.find((x) => x[0] === fmt) || EXPORT_FORMATS[1];
	return (
		<span className="empdrop">
			<button className="embtn" title={`Export as ${cur[0]} — ${cur[2]}`}
				onClick={(e) => { e.stopPropagation(); onPick(cur[0]); }}>
				<i className="fico" aria-hidden="true">{cur[1]}</i>
				{cur[0]}
			</button>
			<button className="embtn" aria-haspopup="listbox" aria-label="Choose export format"
				aria-expanded={open} title="Other formats"
				onClick={(e) => { e.stopPropagation(); onToggle(); }}>
				<b className="cx">▾</b>
			</button>
			<div className="emmenu end" role="listbox" aria-label="Export format" hidden={!open}>
				{EXPORT_FORMATS.map((o) => (
					<button key={o[0]} role="option" aria-selected={o[0] === fmt} title={o[2]}
						onClick={(e) => { e.stopPropagation(); onPick(o[0]); }}>
						<i className="fico" aria-hidden="true">{o[1]}</i>
						{o[0]}
					</button>
				))}
			</div>
		</span>
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
				{/* **The middle scrolls and the header and footer do not.**

				    Every dialog here used to be however tall its content was, on a
				    backdrop with no overflow of its own — so a form taller than the
				    window was cut off at the bottom of the screen with no way to reach
				    the rest of it. The Auto Report Scheduler is sixteen rows and found
				    it; the Document Entry form and the letter viewer were one long
				    filter away from finding it too.

				    Scrolling the *middle* rather than the whole box is the half that
				    matters: what falls off the bottom of a form dialog is its buttons,
				    and a Close somebody has to scroll to find is a dialog that looks
				    stuck. The header keeps the title and the ×, the footer keeps the
				    way out, and the content between them moves. */}
				<div className="mscroll">
					{/* Both slots are optional and both carry their own padding, so an
					    absent one has to be absent rather than empty — a dialog whose
					    content is the whole of it (their Document Entry form) otherwise
					    opens with two blank bands above it. */}
					{actions ? <div className="acts">{actions}</div> : null}
					{msg || why ? (
						<div className="why">
							{msg ? (
								<>
									{msg}
									<br />
								</>
							) : null}
							{why ? <span className="muted">{why}</span> : null}
						</div>
					) : null}
					{/* With no actions and no prose above it, `extra` is the first thing
					    under the header and has to bring the top padding those two were
					    carrying for it. */}
					{extra ? (
						<div className={"px-[1rem] pb-[1rem]" + (actions || msg || why ? "" : " pt-[1rem]")}>
							{extra}
						</div>
					) : null}
				</div>
				<div className="foot">
					<button className="btn ghost" onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}

/* Why a control that opens the site is drawn dead: the proxy has not said where
   the site is yet. It answers on /api/site during the first load, so this is a
   moment at startup rather than a state anybody sits in — but a link with no
   href still looks live, and a live-looking control that does nothing is the
   thing every dead button on this dashboard was written to avoid. */
export const NO_SITE = "Which site this page reads has not answered yet — this opens there once it has.";

/** A control that does its job on the ERPNext site instead of here.

    Everything that writes on this dashboard is drawn this way: an anchor to the
    desk route when there is somewhere to go, and the same control disabled —
    with `dead` saying why — when there is not. Nothing here touches the proxy;
    see `lib/desk.js` for why that matters.

    Pass `dead` only when the target itself is missing — no such document, no
    master behind the row. Leave it off and the control says it is still waiting
    on the site, which is the other reason `href` can be empty and a different
    thing to tell somebody. */
export function Desk({ href, title, dead, label, className = "embtn", children, ...rest }) {
	/* `rest` is for the attributes that decide how the control *looks* — the
	   `data-act` the Assets Details toolbar colours its glyphs from. It reaches
	   both branches, so a link and the disabled button standing in for it are
	   still the same control to the stylesheet. */
	if (!href) {
		return (
			<button className={className} disabled aria-label={label} title={dead || NO_SITE} {...rest}>
				{children}
			</button>
		);
	}
	return (
		<a className={className} href={href} target="_blank" rel="noreferrer"
			aria-label={label} title={title} {...rest}>
			{children}
		</a>
	);
}

/* ---------------------------------------------------------------------------
   The Data Import menu.

   Two screens draw it — Employees → Categories and Employees → Calendar — and
   it is here rather than in either of them for the reason this whole file
   exists: the same two items in two places, written twice, is two places that
   drift. Factor HR puts it behind a caret on both, and both captures show the
   same pair.

   The caller owns the open flag and does the work; this draws the control. What
   it decides is the part that is the same either way — three states on each
   item, and the trap that made the CTC menu invisible for a fortnight.
   --------------------------------------------------------------------------- */

/** The two glyphs, kept beside the component that draws them. Deliberately not
    the same mark twice, where Factor HR's are: one arrow points into the site
    and one out of it, and two identical icons on adjacent rows are two controls
    nobody tells apart at a glance. */
const IMP_GLYPH = {
	up: "M12 15V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
	down: "M12 4v10.5M8 11l4 4 4-4M4 20h16",
};

/** Their caret menu: **Data import from file** and **Download template**.

    `href` is where the first item goes — ERPNext's Data Import — or "" when the
    site has not answered yet, which draws it dead with the standing reason.

    `onTemplate` is the second item's work, or null on a screen that has nothing
    to write a template for; `templateDead` is why. Dead rather than absent,
    because an item quietly dropped is a difference nobody remembers to ask
    about.

    **Built on `.empdrop` / `.emmenu`**, which brings two things a fresh pair of
    classes would have to re-earn: `.emmenu[hidden]` really hides — a menu with
    `display:flex` toggled by the `hidden` attribute does not, which is a bug
    this repo has already shipped once — and the document handler in App.jsx
    leaves `.empdrop` alone, so a click elsewhere closes the menu and the click
    that opens it does not. The caller has to add its own flag to that handler's
    close list; both of the two do. */
export function ImportMenu({ open, onToggle, onClose, href, label, title, items, onTemplate, templateDead }) {
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="menu" aria-expanded={open} aria-label="Import"
				title={title || "Data import from file, or download the template for it."}
				/* Off the document handler in App, which would otherwise close the
				   menu in the same click that opened it. */
				onClick={(e) => { e.stopPropagation(); onToggle(); }}>
				{label}
			</button>
			<div className="emmenu end catimpmenu" role="menu" aria-label="Import" hidden={!open}>
				{items.map(([k, ico, text, why]) => {
					const mark = (
						<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
							strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d={IMP_GLYPH[ico]} />
						</svg>
					);

					if (k === "template") {
						return (
							<button key={k} role="menuitem" disabled={!onTemplate}
								title={onTemplate ? why : templateDead}
								onClick={(e) => { e.stopPropagation(); onTemplate(); onClose(); }}>
								{mark}
								{text}
							</button>
						);
					}
					/* An anchor when there is a site to send it to and a disabled button
					   when there is not — the same three-state bargain EmployeeMaster's
					   own import list makes, and drawn the same way rather than through
					   `Desk`, because `role="menuitem"` has to be on the control itself. */
					if (!href) {
						return (
							<button key={k} role="menuitem" disabled title={NO_SITE}>
								{mark}
								{text}
							</button>
						);
					}
					return (
						<a key={k} role="menuitem" href={href} target="_blank" rel="noreferrer" title={why}
							/* `.empdrop` is exempt from the document handler, so the menu has
							   to close itself on the way out. */
							onClick={onClose}>
							{mark}
							{text}
						</a>
					);
				})}
			</div>
		</span>
	);
}

/* ---------------------------------------------------------------------------
   Tab strips.

   Five screens draw one — Approvals' queues, and the Criteria / Advance pair on
   each of the three report forms. Every one of them said `aria-selected` on a
   plain `<button>`, which is inert: `aria-selected` is only defined on `tab`,
   `option`, `row` and `gridcell`, so a screen reader announced eight identical
   buttons and never which of them was the one being shown. The CSS read the
   attribute and drew the state, so it looked right and only looked right.

   `role="tablist"` / `role="tab"` makes the attribute mean what the styling
   already implied, and brings the arrow keys with it — a tab strip is one stop
   on the tab key and the arrows move inside it, which is the whole reason it is
   a strip rather than eight separate buttons.
   --------------------------------------------------------------------------- */

/** Left / Right / Home / End across the strip the tab is in.

    Activates on arrival rather than waiting for Enter. That is the right half
    of the choice here because every one of these tabs swaps a pane already on
    the page — nothing is fetched, nothing is submitted — so arrowing onto a tab
    without seeing it is a state nobody wants and a second keystroke to leave. */
export function onTabKeys(e) {
	const step = { ArrowRight: 1, ArrowLeft: -1 };
	if (!(e.key in step) && e.key !== "Home" && e.key !== "End") return;
	const strip = e.currentTarget.closest('[role="tablist"]');
	if (!strip) return;
	const tabs = [...strip.querySelectorAll('[role="tab"]:not([disabled])')];
	const i = tabs.indexOf(e.currentTarget);
	if (i < 0) return;
	const n =
		e.key === "Home" ? 0
		: e.key === "End" ? tabs.length - 1
		: (i + step[e.key] + tabs.length) % tabs.length;
	e.preventDefault();
	/* Focus first, then activate: the click re-renders the strip, and React only
	   keeps the focused node if it is already the one being focused. */
	tabs[n].focus();
	tabs[n].click();
}

/** The three attributes every tab in this app needs, so no strip can be given
    two of them and look finished.

    `panel` is the id of the pane the tab shows. Passing it is what lets a
    reader jump from the tab to what it opened; a strip that swaps a pane with
    no id is a strip that has to be taken on trust. */
export const tabProps = (id, panel, on) => ({
	id,
	role: "tab",
	"aria-selected": on,
	"aria-controls": panel,
	/* One stop on the tab key for the whole strip, not one per tab. Eight tab
	   presses to get past the Approvals queues is eight nobody should spend. */
	tabIndex: on ? 0 : -1,
	onKeyDown: onTabKeys,
});

/** The other half of the pair. Kept next to `tabProps` because a panel that
    forgets `aria-labelledby` is a panel announced as "group". */
export const panelProps = (id, tab) => ({ id, role: "tabpanel", "aria-labelledby": tab });
