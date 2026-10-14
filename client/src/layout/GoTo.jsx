/** Go to any page: Ctrl+K (⌘K on a Mac), or the search button in the header.
 *
 *  **Why this exists.** The app has nine modules and something over seventy
 *  pages, and the only way to a page was to know which module it lived in —
 *  "Present Report" is under Attendance, "Leave Balance Report" under Leave,
 *  and nobody new to the app can guess either. Typing three letters of the
 *  name is the shortest route there is, and it needs no knowledge of the
 *  menu's shape.
 *
 *  It lists exactly what the rail and the strip list, read through the same
 *  two filters (`sectionFor` for the module, `pagesOf` for its pages), so it
 *  can never offer a page somebody's menu would not. A menu, not a permission:
 *  the site still decides what a page can read.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, set } from "@/store";
import { visibleSections } from "@/data/sections";
import { sectionFor } from "@/data/menus";
import { navigate } from "@/routes/router";
import { OVERVIEW } from "@/routes/paths";
import { pagesOf } from "@/layout/Sidebar";
import Icon from "@/components/Icon";

/** Every destination this login is shown, module first and then its pages. */
export function destinations(user, admin) {
	const out = [];
	for (const m of visibleSections()) {
		if (!sectionFor(m.key, admin, user)) continue;
		out.push({ id: m.key, section: m.key, subtab: OVERVIEW, label: m.label, module: m.label, icon: m.icon, top: true });
		for (const [sub, label] of pagesOf(m.key, user, admin)) {
			out.push({ id: m.key + "/" + sub, section: m.key, subtab: sub, label, module: m.label, icon: m.icon });
		}
	}
	return out;
}

/** The rows that match what was typed, best first.

    Every word has to appear somewhere in "module page", so "att daily" finds
    Attendance → Daily Detail Attendance Report. A page whose own name starts
    with the first word ranks above one that merely contains it — somebody
    typing "lea" wants Leave before "Release". */
export function rank(rows, typed) {
	const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return rows;
	const scored = [];
	for (const r of rows) {
		const hay = (r.module + " " + r.label).toLowerCase();
		if (!words.every((w) => hay.includes(w))) continue;
		const name = r.label.toLowerCase();
		const score = name.startsWith(words[0]) ? 0 : name.includes(words[0]) ? 1 : 2;
		scored.push([score, r]);
	}
	return scored.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

export default function GoTo() {
	const { palette, user, admin } = useApp();
	const [typed, setTyped] = useState("");
	const [at, setAt] = useState(0);
	const box = useRef(null);
	const list = useRef(null);

	/* Bound for the life of the shell, so the shortcut works on every page and
	   not only after the header has been clicked. */
	useEffect(() => {
		const onKey = (e) => {
			if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
				e.preventDefault();
				set({ palette: !palette });
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [palette]);

	/* A fresh box every time it opens: what somebody typed last time is not
	   what they are looking for now. */
	useEffect(() => {
		if (!palette) return;
		setTyped("");
		setAt(0);
		const t = setTimeout(() => box.current?.focus(), 0);
		return () => clearTimeout(t);
	}, [palette]);

	const all = useMemo(() => destinations(user, admin), [user, admin]);
	const rows = rank(all, typed).slice(0, 40);

	/* Keep the highlighted row on screen as the arrows move it. */
	useEffect(() => {
		list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
	}, [at]);

	if (!palette) return null;

	const close = () => set({ palette: false });
	const go = (r) => {
		close();
		navigate(r.section, r.subtab);
	};

	const onKeyDown = (e) => {
		if (e.key === "Escape") { e.preventDefault(); close(); }
		else if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(rows.length - 1, i + 1)); }
		else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
		else if (e.key === "Enter" && rows[at]) { e.preventDefault(); go(rows[at]); }
	};

	return (
		<div className="goto" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
			<div className="gotobox" role="dialog" aria-modal="true" aria-label="Go to a page">
				<label className="gotofind">
					<Icon name="search" />
					<input
						ref={box}
						type="text"
						value={typed}
						placeholder="Go to a page…"
						aria-label="Page name"
						role="combobox"
						aria-expanded="true"
						aria-controls="gotolist"
						aria-activedescendant={rows[at] ? "goto-" + at : undefined}
						autoComplete="off"
						spellCheck={false}
						onChange={(e) => { setTyped(e.target.value); setAt(0); }}
						onKeyDown={onKeyDown}
					/>
					<kbd>Esc</kbd>
				</label>
				<ul className="gotolist" id="gotolist" role="listbox" ref={list}>
					{rows.length === 0 ? (
						<li className="gotonone" role="presentation">No page is called that.</li>
					) : rows.map((r, i) => (
						<li
							key={r.id}
							id={"goto-" + i}
							role="option"
							aria-selected={i === at}
							className={r.top ? "top" : undefined}
							onMouseMove={() => { if (i !== at) setAt(i); }}
							onClick={() => go(r)}
						>
							<svg viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor"
								strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								<path d={r.icon} />
							</svg>
							<span className="gl">{r.label}</span>
							{r.top ? null : <span className="gm">{r.module}</span>}
							<Icon name="corner" className="ge" />
						</li>
					))}
				</ul>
				<div className="gotofoot" aria-hidden="true">
					<span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
					<span><kbd>Enter</kbd> to open</span>
					<span className="grow" />
					<span><kbd>Ctrl</kbd><kbd>K</kbd> anywhere</span>
				</div>
			</div>
		</div>
	);
}
