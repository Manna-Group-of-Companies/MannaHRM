import { useEffect } from "react";
import { getState } from "@/store";
import { navigate } from "@/routes/router";
import { pagesOf, shown } from "@/data/nav";
import { employeesLocked } from "@/data/menus";
import { G_WAIT, keyTarget, typing } from "@/data/shortcuts";

/** `?`, `g` then a letter, and `n` — data/shortcuts.js says where each goes.
    Bound for the life of the shell, like Ctrl+K; draws nothing. Never while
    somebody is typing, a window is open, or a modifier is held — Ctrl+N and
    Alt+G are the browser's. */
export default function Shortcuts() {
	useEffect(() => {
		let gAt = 0;
		const onKey = (e) => {
			if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
			const s = getState();
			if (s.palette || document.querySelector("[role='dialog'], .modal")) return;
			const gPending = Date.now() - gAt < G_WAIT;
			if (!gPending && e.key === "g") { gAt = Date.now(); return; }
			gAt = 0;
			const to = keyTarget(e.key, {
				gPending,
				section: s.section,
				can: (sec) => shown(sec, s.user, s.admin),
				first: (sec) => pagesOf(sec, s.user, s.admin)[0]?.[0] || "overview",
				mayCreate: (sec) => sec !== "employees" || !employeesLocked(s.user),
			});
			if (!to) return;
			e.preventDefault();
			navigate(to[0], to[1]);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);
	return null;
}
