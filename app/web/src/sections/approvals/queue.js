import { getState, set } from "@/state/store";
import { APPROVALS } from "@/data/approvals";
import { isoAgo, nowStamp } from "@/lib/format";
import { download, toCsv, unionKeys } from "@/lib/csv";
import { apiWrite } from "@/api/client";
import { load } from "@/api/load";

/** Everything the queue does that is not drawing. Kept out of the components so
    the rules — what a search covers, what select-all covers, what a save
    actually wrote — can be read in one place. */

export const queueOf = (k) => APPROVALS.find((x) => x.k === k) || APPROVALS[0];

export const reqId = (r) =>
	r.name || r.employee + "|" + (r.attendance_date || r.from_date || "");

/* Sort newest first, search across everything a person would type, then cut to
   the chosen window. Search is deliberately wide — an approver looking for
   "47299" and one looking for "Ekka" are the same search box. */
export function qFilter(s, rows) {
	const q = s.appq.trim().toLowerCase();
	let out = rows.slice().sort((a, b) => String(b.creation || "").localeCompare(String(a.creation || "")));
	if (q) {
		out = out.filter((r) => {
			const e = s.byName[r.employee] || {};
			return [e.employee_name, e.employee_number, e.company, r.employee_name, r.name, r.reason,
				r.remarks, r.status, r.attendance_date, r.from_date, r.to_date, r.leave_type,
				r.correction_for]
				.some((v) => String(v == null ? "" : v).toLowerCase().includes(q));
		});
	}
	/* "Last 20 Activities" counts rows; "Last 31 Days" counts days. Both windows
	   are cut from when the request was raised, never from the date it is about —
	   a correction filed today for a day in June is recent work, not old work. */
	const w = String(s.appscope || "");
	if (w.startsWith("n:")) return out.slice(0, Number(w.slice(2)));
	if (w.startsWith("d:")) {
		const since = isoAgo(Number(w.slice(2)));
		return out.filter(
			(r) => String(r.applied_on || r.posting_date || r.creation || "").slice(0, 10) >= since,
		);
	}
	return out;
}

/** The Other grid's own filtering: activity type, then the queue window, then
    the eight per-column contains-boxes, combined. */
export function otherRows(s, t, cols) {
	const all = (s.approvals[t.k] || []).filter((r) => !s.othtype || (r.activity_type || "") === s.othtype);
	return qFilter(s, all).filter((r) =>
		cols.every((c) => {
			const q = (s.othf[c[0]] || "").trim().toLowerCase();
			if (!q) return true;
			const v = c[0] === "action" ? s.othact[reqId(r)] || "" : c[2](r);
			return String(v).toLowerCase().includes(q);
		}),
	);
}

/* Export is one of the two halves that only reads — so it works here, in the
   browser, with nothing sent anywhere.

   What it writes out is exactly what the site returned, field for field, with
   nothing computed added. An export that carried this page's own arithmetic
   would be a second opinion masquerading as a record; a reconciliation against
   ERPNext has to be able to disagree with us. */
export function qExport(rows) {
	const s = getState();
	const t = queueOf(s.apptab);
	const picked = s.appsel.size ? rows.filter((r) => s.appsel.has(reqId(r))) : rows;
	if (!picked.length) return "Nothing to export — this queue is empty.";

	const cols = unionKeys(picked);
	const name = `approvals-${t.k}-${new Date().toISOString().slice(0, 10)}.csv`;
	download(name, toCsv(cols, picked.map((r) => cols.map((c) => String(r[c] ?? "")))));

	return `Exported ${picked.length} row${picked.length === 1 ? "" : "s"} to ${name}`
		+ (s.appsel.size ? " — the selection only." : " — everything shown.");
}

/** The header row an import would have to match, in the doctype's own
    fieldnames — not the page's labels, which would import as nothing. */
export function qTemplate() {
	const t = queueOf(getState().apptab);
	if (!t.tpl) return `No importable doctype behind the ${t.l} queue yet, so there is nothing to template.`;
	download("template-" + t.k + ".csv", t.tpl.join(",") + "\r\n");
	return `Template for ${t.src} — ${t.tpl.length} columns, header row only. `
		+ "Deliberately no example row: a template that imports cleanly by accident is a hazard.";
}

/* No login of its own: the page talks to the site with one API token, so every
   decision made here lands as that token's user. Recorded as such rather than
   dressed up as the person at the keyboard. */
const DECIDER = "dashboard token";

function logDecision(e) {
	const s = getState();
	const othlog = [{ at: nowStamp(), by: DECIDER, ...e }, ...s.othlog].slice(0, 200);
	set({ othlog });
}

/* Save Approval Changes. Every staged row is attempted against the site; a row
   with no doctype behind it — the Other queue's, today — is applied to the
   screen and reported as exactly that.

   The grid is updated either way, so what is on screen and what was staged
   never disagree, and a reload afterwards is what proves which of the two
   actually happened. */
export async function saveApprovals() {
	const s = getState();
	const t = queueOf(s.apptab);
	const staged = Object.keys(s.othact).filter((id) => s.othact[id]);
	if (!staged.length) {
		set({ othmsg: "Nothing staged. Set Your Action on a row, or use Bulk Approval, then Save." });
		return;
	}
	const dt = t.doctype || (t.k === "attendance" ? s.regDoctype : null);
	set({ othmsg: `Saving ${staged.length}…` });

	const rows = s.approvals[t.k] || [];
	let wrote = 0;
	let onscreen = 0;
	const failed = [];

	for (const id of staged) {
		const r = rows.find((x) => reqId(x) === id);
		const action = s.othact[id];
		const status = action === "Approve" ? "Approved" : "Rejected";
		let persisted = false;
		let err = "no document behind this queue yet";

		if (dt && r && r.name) {
			const res = await apiWrite(dt, r.name, { status });
			persisted = res.ok;
			err = res.ok ? "" : res.error || "";
		}
		if (r) {
			r.status = status;
			r.decided_on = nowStamp();
			r.decided_by = DECIDER;
		}
		logDecision({ ref: r?.name || id, employee: r?.employee || "", action, status, persisted,
			note: err, queue: t.l });
		if (persisted) wrote++;
		else {
			onscreen++;
			if (err && !failed.includes(err)) failed.push(err);
		}
	}

	set({
		othact: {},
		appsel: new Set(),
		othmsg:
			(wrote ? `${wrote} written to the site. ` : "")
			+ (onscreen
				? `${onscreen} applied on this screen only — nothing was written, and a refresh will undo it`
					+ (failed.length ? ` (${failed[0]})` : "") + ". "
				: "")
			+ "Every one is in the Approval Activities Log.",
	});

	// The site is the authority on what a write actually did — an approval that
	// fires the hook can change more than the field that was sent.
	if (wrote) await load();
}

/** Every decision made from this page, as a file. Session-scoped and said so —
    Frappe's version log is the durable record, per document. */
export function exportLog() {
	const log = getState().othlog;
	if (!log.length) return "Nothing to export yet.";
	const cols = ["at", "by", "queue", "ref", "employee", "action", "status", "persisted", "note"];
	download(
		"approval-log-" + new Date().toISOString().slice(0, 10) + ".csv",
		toCsv(cols, log.map((e) => cols.map((c) => String(e[c] ?? "")))),
	);
	return `Exported ${log.length} log line${log.length === 1 ? "" : "s"}.`;
}
