import { fmt } from "@/lib/format";
import { Empty } from "@/components/ui";

/* Nothing on the On Board pages may report "empty" while the question is still
   in flight. An empty asset register and an unanswered one look identical on
   screen and mean opposite things — the same reason the punch panel says
   "nothing recorded" rather than 0%. */
export const onboardWait = (s, what) =>
	s.onboardBusy ? (
		<Empty title={`Reading ${what}…`}>Nothing is claimed until the site has answered.</Empty>
	) : null;

/** The employee documents, scoped to the company picker and to who is here. */
export const docRows = (s) =>
	s.docs.filter((e) => e.status === "Active" && (!s.company || e.company === s.company));

export const assetRows = (s) =>
	s.assets.filter((a) => !s.company || a.company === s.company);

/** Whether an asset read can be reported on at all, and why not if it cannot. */
export function assetsUnread(s, what) {
	const waiting = onboardWait(s, "the " + what);
	if (waiting) return waiting;
	if (!s.assetErr) return null;
	return (
		<div className="gap">
			<b>Could not read the {what}.</b> {s.assetErr}{" "}
			<span className="muted">
				ERPNext’s Asset module is installed on the site; this is the proxy or the field list, not the
				module.
			</span>
		</div>
	);
}

/** A filled-of-total bar. The proportion is the finding — the migration loaded
    the master and not the paperwork behind it. */
export function CoverageRow({ label, n, total, hint }) {
	const pct = total ? (n / total) * 100 : 0;
	return (
		<div className="row">
			<span>
				{label}
				{hint ? <> <span className="muted">{hint}</span></> : null}
			</span>
			<span className="val">
				{fmt(n)} of {fmt(total)}
			</span>
			<span className="track">
				<i style={{ width: pct.toFixed(1) + "%" }} />
			</span>
		</div>
	);
}

/* Days until a passport runs out. Negative is already expired, which is the row
   that matters — an expired document is a person who cannot be sent anywhere,
   and nobody is told until somebody looks. */
export function daysTo(iso) {
	const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
	if (isNaN(d.getTime())) return null;
	const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
	return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/** "for Hi-Tech Pretreads" or "across the group" — said on every panel that
    counts, because a count with no scope on it is a count people argue about. */
export const scopeSaid = (s) =>
	s.company ? <> for <b>{s.company}</b></> : <> across the group</>;
