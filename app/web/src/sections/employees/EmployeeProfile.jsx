import { getState, set, useApp } from "@/state/store";
import { forgetEmployeeDoc, useEmployeeDoc } from "@/sections/employees/useEmployeeDoc";
import { scoped } from "@/lib/scope";
import { clock, dmy, filled, fmt, initials, tidyDept } from "@/lib/format";
import { Fragment, useEffect } from "react";

import { Desk, Empty, Html, Note, Scroll } from "@/components/ui";
import { deskUrl } from "@/lib/desk";
import People from "@/components/People";
import { DATE_FIELD } from "@/data/employees";
import { PROFILE_CHECKS, PROFILE_CHIPS, PROFILE_FIRST_CHILD, PROFILE_HEAD, PROFILE_LONG, PROFILE_PANES, PROFILE_TABS } from "@/data/profile";

/* Factor HR's **Employee Profile** — the record page, screenshotted 29 Aug 2026.
   See docs/FACTOHR_SCREENS.md §23 and the field map in `src/data/profile.js`.

   §15 established that Employee Detail is a *report builder* and not a record
   page. This is the record page: the header card, the thirteen-item sidebar,
   and one pane at a time on the right. Clicking a card on Employee Master lands
   here, which is what the → on those cards always looked like it did. */

/** Whether a missing key in this document means anything.

    Frappe's document endpoint returns every column of the doctype, `null`
    included — so a key that is *absent* means the site has no such field, which
    is a different finding from a field that is merely empty and the one this
    screen exists to show. That inference is only safe while nulls are actually
    coming back, so it is checked rather than assumed: a document with no null
    in it anywhere is one we cannot read that way, and every missing key is
    reported as unknown instead. */
const keepsNulls = (doc) => Object.values(doc).some((v) => v === null);

/** The first of a row's fieldnames that holds something, else the first that
    exists at all. Rows carry alternatives because the 25 Aug backfill landed
    Factor HR's own values under `custom_`, beside ERPNext's empty ones. */
function pick(doc, field) {
	const names = field == null ? [] : Array.isArray(field) ? field : [field];
	for (const k of names) {
		const v = doc[k];
		if (v != null && v !== "") return { how: "set", key: k, v };
	}
	for (const k of names) if (k in doc) return { how: "blank", key: k };
	return { how: "absent", key: names[0] || null };
}

/** One value, written the way the rest of the app writes that kind of value. */
function say(key, v) {
	if (PROFILE_CHECKS.has(key)) return v ? "Yes" : "No";
	if (key === "reports_to") return getState().byName[v]?.employee_name || String(v);
	if (key === "department") return tidyDept(v);
	if (key === "ctc") return fmt(v);
	if (DATE_FIELD.test(key)) return dmy(v);
	return String(v);
}

function Field({ doc, row, nulls }) {
	const [label, field, why] = row;
	const got = pick(doc, field);
	const long = got.key && PROFILE_LONG.has(got.key);

	/* Three states, and telling the last two apart is the point of the screen.
	   *Not set* is the migration's finding — it loaded the master and not the
	   paperwork. *No such field* is ERPNext's, and it is a decision waiting to
	   be taken about what Manna needs built. */
	let cls = "v";
	let text;
	let hint = why || undefined;
	if (got.how === "set") {
		text = say(got.key, got.v);
	} else if (got.how === "blank" || (got.how === "absent" && !nulls && field)) {
		cls = "v off";
		text = "not set";
		hint = why || "The field is on this site and nothing is in it.";
	} else {
		cls = "v gone";
		text = field ? "no such field here" : "not on this site";
		hint = why || "ERPNext's Employee has no field by this name.";
	}

	return (
		<div className={"profield" + (long ? " long" : "")}>
			<span className="k">{label}</span>
			<span className={cls} title={hint}>{text}</span>
		</div>
	);
}

/** One row of the pane list, at either level. */
function Tab({ t, tab, child, assets }) {
	return (
		<button
			className={"protab" + (child ? " pchild" : "")}
			aria-current={tab === t[0] ? "page" : undefined}
			onClick={() => set({ proftab: t[0] })}
		>
			<span className="ico">{t[2]}</span>
			<span className="lb">{t[1]}</span>
			{t[0] === "assets" && assets != null && (
				<span className={"cnt" + (assets ? " hot" : "")}>{assets}</span>
			)}
		</button>
	);
}

/** A pane's card: the heading Factor HR puts there, and its two icons.

    `edit` is the record on the site, passed down rather than rebuilt per card:
    every pencil on this page opens the same document, because the site puts all
    thirteen panes on one form and a deep link per pane would break the first
    time somebody rearranged it. */
function Card({ title, children, onRefresh, edit }) {
	return (
		<section className="procard">
			<header>
				<h3>{title}</h3>
				<span className="proico">
					{/* People are edited on the site, so the pencil goes there. */}
					<Desk className="" href={edit} label="Edit on the site"
						title="Edit this record on the ERPNext site — see app/README.md.">
						✎
					</Desk>
					<button title="Read this record from the site again" aria-label="Reload this record"
						onClick={onRefresh}>
						↻
					</button>
				</span>
			</header>
			<div className="probody">{children}</div>
		</section>
	);
}

/** A child table off the document. These are the only place the profile can
    show what the report screens cannot: a list call never reaches a child
    table, but the document read this page already makes carries them whole. */
function ChildTable({ doc, spec }) {
	const [field, title, cols] = spec;
	const rows = Array.isArray(doc[field]) ? doc[field] : null;

	if (!rows) {
		return (
			<Empty title={title}>
				This site's <code>Employee</code> has no <code>{field}</code> table.
			</Empty>
		);
	}
	if (!rows.length) {
		return (
			<Empty title={title}>
				The table is on the record and it is empty. That is the migration rather than the screen — it
				loaded the master and not the paperwork behind it.
			</Empty>
		);
	}
	return (
		<Scroll>
			<table style={{ minWidth: 520 }}>
				<thead>
					<tr>
						{cols.map((c) => (
							<th key={c[0]}>{c[1]}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r, i) => (
						<tr key={r.name || i}>
							{cols.map((c) => {
								const v = r[c[0]];
								if (v == null || v === "") return <td className="muted" key={c[0]}>—</td>;
								const isDate = DATE_FIELD.test(c[0]);
								return (
									<td key={c[0]} className={isDate ? "mono" : undefined}>
										{isDate ? dmy(v) : String(v)}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</Scroll>
	);
}

/** Today's punches for this person, off the same read the dashboard already
    made. Attendance Info. lists the settings; this says whether they worked. */
function TodayPunches({ s, emp }) {
	const mine = s.checkins
		.filter((c) => c.employee === emp)
		.sort((a, b) => String(a.time).localeCompare(String(b.time)));
	if (!mine.length) {
		return (
			<div className="mt-[.7rem]">
				<Note>Nothing punched today. That is the site's answer, not a gap in this page.</Note>
			</div>
		);
	}
	return (
		<div className="proline mt-[.7rem]">
			{mine.map((c) => (
				<span className="chip" key={c.name}>
					{clock(c.time)} {c.log_type || "—"}
				</span>
			))}
		</div>
	);
}

function AssetsPane({ s, emp }) {
	/* On Board's reads are half a dozen requests against a site with a daily
	   compute limit, so they are made when somebody opens this tab rather than
	   on every page load. */
	useEffect(() => {
		if (!s.onboardRead) void loadOnBoard();
	}, [s.onboardRead]);

	if (!s.onboardRead || s.onboardBusy) return <Empty title="reading the asset register…" />;
	if (s.assetErr) {
		return (
			<Empty title="The asset register could not be read">
				{s.assetErr}
			</Empty>
		);
	}

	const mine = s.assets.filter((a) => a.custodian === emp);
	if (!mine.length) {
		return (
			<Empty title="Nothing issued to this person">
				ERPNext's <code>Asset</code> is installed and empty — {fmt(s.assets.length)} assets on the whole
				site. Factor HR shows 0 here too. Issuing an asset is an Asset Movement, and this page only
				reads.
			</Empty>
		);
	}
	return (
		<Scroll>
			<table style={{ minWidth: 560 }}>
				<thead>
					<tr>
						<th>Asset</th><th>Category</th><th>Status</th><th>Location</th><th>Purchased</th>
					</tr>
				</thead>
				<tbody>
					{mine.map((a) => (
						<tr key={a.name}>
							<td>{a.asset_name || a.name}</td>
							<td className="muted">{a.asset_category || "—"}</td>
							<td>{a.status || "—"}</td>
							<td className="muted">{a.location || "—"}</td>
							<td className="mono muted">{a.purchase_date ? dmy(a.purchase_date) : "—"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</Scroll>
	);
}

function Header({ doc, onRefresh, edit }) {
	const nulls = keepsNulls(doc);
	const on = doc.status === "Active";
	const chip = (row) => {
		const got = pick(doc, row[1]);
		return got.how === "set" ? say(got.key, got.v) : null;
	};

	return (
		<section className="prohead">
			<div className="proava">
				{initials(doc.employee_name)}
				{/* Photographs live on the File doctype, which is deliberately not on
				    the proxy's allowlist — a token that can read every attachment on
				    the site is not something to hand to a page on localhost. So the
				    photograph is attached over there, on the record itself. */}
				<Desk className="pen" href={edit} label="Add a photograph"
					title="Attach a photograph on the ERPNext site. Images are not read through this proxy — a token that can read every attachment on the site is not something to hand to a page on localhost.">
					✎
				</Desk>
			</div>

			<div className="prowho">
				<div className="proname">
					<b>
						{doc.employee_number ? doc.employee_number + " - " : ""}
						{doc.employee_name || doc.name}
					</b>
					<span className="proacts">
						<button className="embtn" title="Read this record from the site again"
							aria-label="Reload this record" onClick={onRefresh}>↻</button>
						<button className="embtn" title="Print this profile" aria-label="Print"
							onClick={() => window.print()}>🖨</button>
						{/* Who changed what lives on the Version doctype, which is not on
						    the proxy's allowlist — but it is also the timeline at the foot
						    of the record on the site, which is where this goes. */}
						<Desk href={edit} title="Who changed what, on the ERPNext site — the timeline at the foot of the record. The Version doctype is deliberately not on this proxy's allowlist.">
							History
						</Desk>
					</span>
				</div>

				<div className="prochips">
					<span className="prostat">
						<i className={"sdot " + (on ? "on" : "off")} />
						{doc.status || "—"}
					</span>
					{PROFILE_CHIPS.map((c) => {
						const v = chip(c);
						return (
							<span className={"prochip" + (v ? "" : " off")} key={c[0]}>
								<b>{c[0]}</b> {v || "—"}
							</span>
						);
					})}
					<span className={"prochip" + (doc.designation ? "" : " off")}>
						{(doc.designation || "—").toUpperCase()}
					</span>
					<span className={"prochip" + (doc.department ? "" : " off")}>
						{tidyDept(doc.department).toUpperCase()}
					</span>
					{/* Blank for everybody in Factor HR too — a field nobody there has
					    ever filled, rather than a gap in the migration. */}
					<span className={"prochip" + (doc.branch ? "" : " off")}>{doc.branch || "—"}</span>
				</div>

				<div className="prokeys">
					{PROFILE_HEAD.map((row) => (
						<Field doc={doc} row={row} nulls={nulls} key={row[0]} />
					))}
				</div>
			</div>
		</section>
	);
}

export default function EmployeeProfile() {
	const s = useApp();

	const people = scoped(s)
		.slice()
		.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));
	const picked = s.empSel && people.some((p) => p.name === s.empSel) ? s.empSel : "";
	const tab = PROFILE_PANES[s.proftab] ? s.proftab : "about";

	useEmployeeDoc(picked);
	const doc = picked ? s.empDoc[picked] : null;

	const refresh = () => {
		if (picked) forgetEmployeeDoc(picked);
	};

	const chooser = (
		<label className="prochoose">
			Employee{" "}
			<select value={picked} onChange={(e) => set({ empSel: e.target.value })}>
				<option value="">— pick somebody —</option>
				{people.map((p) => (
					<option key={p.name} value={p.name}>
						{p.employee_name} ({p.employee_number || "-"})
					</option>
				))}
			</select>
		</label>
	);

	if (!picked) {
		return (
			<>
				<div className="legend">
					<b className="font-display">Employee Profile</b>
					<span className="cov live">Live</span>
					<span>One person's whole record, in Factor HR's own thirteen panes.</span>
					<span className="right">{chooser}</span>
				</div>
				{/* Their screen opens on whoever was last looked at. Ours cannot know
				    that on a fresh load, so it lists the people it could open instead of
				    asking somebody to go back to another page to choose. */}
				<People people={people}
					note="Click anybody to open their record. The chooser above and the cards on Employee Master do the same thing." />
			</>
		);
	}

	if (!doc) return <Empty title="reading the record…" />;
	if (doc.__err) {
		return (
			<>
				<div className="legend">
					<b className="font-display">Employee Profile</b>
					<span className="right">{chooser}</span>
				</div>
				<div className="gap">
					<b>Could not read {picked}.</b> {String(doc.__err)}
				</div>
			</>
		);
	}

	const pane = PROFILE_PANES[tab];
	const nulls = keepsNulls(doc);
	const assetsMine = s.onboardRead ? s.assets.filter((a) => a.custodian === picked).length : null;
	/* The record on the site. Every control on this page that writes — the
	   pencils, the photograph, History — opens this one document. */
	const edit = s.site && picked ? deskUrl(s.site, "Employee", picked) : "";

	return (
		<>
			<div className="legend">
				<button className="embtn" onClick={() => set({ section: "employees", subtab: "overview" })}>
					← Employee Master
				</button>
				<b className="font-display">Employee Profile</b>
				<span className="cov live">Live</span>
				{!nulls && (
					<span>
						This record came back with no empty field in it, so <b>“no such field here”</b> cannot be
						told from “not set” — every gap below is reported as the second.
					</span>
				)}
				<span className="right">{chooser}</span>
			</div>

			<Header doc={doc} onRefresh={refresh} edit={edit} />

			<div className="probody-grid">
				<nav className="protabs" aria-label="Profile sections">
					{PROFILE_TABS.map((t) => {
						const kids = t[3];
						if (!kids) return <Tab t={t} tab={tab} assets={assetsMine} key={t[0]} />;

						const open = s.profopen.includes(t[0]);
						const holds = kids.some((k) => k[0] === tab);
						return (
							<Fragment key={t[0]}>
								<button
									className="protab pgroup"
									aria-expanded={open}
									/* Marked current only while shut: otherwise the group and the
									   child open inside it would both read as selected, and while
									   it is shut nothing else on the list would. */
									aria-current={holds && !open ? "page" : undefined}
									onClick={() =>
										set({
											profopen: open
												? s.profopen.filter((k) => k !== t[0])
												: s.profopen.concat([t[0]]),
											/* Opening lands on the first sub-item, so the click does
											   something on the right as well as on the left. Closing
											   leaves the pane alone \— collapsing a menu is not a
											   request to be taken somewhere else. */
											proftab: open || holds ? tab : PROFILE_FIRST_CHILD[t[0]],
										})
									}
								>
									<span className="ico">{t[2]}</span>
									<span className="lb">{t[1]}</span>
									<span className="caret" aria-hidden="true">{open ? "\u2303" : "\u2304"}</span>
								</button>
								{open && kids.map((k) => <Tab t={k} tab={tab} child key={k[0]} />)}
							</Fragment>
						);
					})}
				</nav>

				<div className="propane">
					{(pane.groups || []).map((g) => (
						<Card key={g[0]} title={g[0]} onRefresh={refresh} edit={edit}>
							<div className="profields">
								{g[1].map((row) => (
									<Field doc={doc} row={row} nulls={nulls} key={row[0]} />
								))}
							</div>
							{tab === "attendance" && g === pane.groups[0] && (
								<TodayPunches s={s} emp={picked} />
							)}
						</Card>
					))}

					{(pane.tables || []).map((spec) => (
						<Card key={spec[0]} title={spec[1]} onRefresh={refresh} edit={edit}>
							<ChildTable doc={doc} spec={spec} />
						</Card>
					))}

					{tab === "assets" && (
						<Card title="Assets" onRefresh={refresh} edit={edit}>
							<AssetsPane s={s} emp={picked} />
						</Card>
					)}

					{pane.note && (
						<Note>
							<Html html={pane.note} />
						</Note>
					)}
				</div>
			</div>
		</>
	);
}
