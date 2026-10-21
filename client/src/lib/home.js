/* ---------------------------------------------------------------------------
   The front page's arithmetic — the HRDashboard reference's Dashboard, on this
   site's records (21 October 2026, docs/kit-pages.md D16).

   Pure functions over rows the page already holds, so every figure on the
   page can be argued about without a site. Where the reference makes a number
   up (its trend chips, its team performance), this either works the real one
   out or draws nothing: a figure on this page is one somebody may act on.

   **One window for "new" and "left": the last 120 days**, the reference's
   own, so its four tiles mean here what they mean there. The trend beside a
   figure compares it with the 120 days before; with nothing to compare
   against there is no trend, rather than a +100%.
   --------------------------------------------------------------------------- */

export const WINDOW_DAYS = 120;
const DAY = 864e5;

const dateOf = (iso) => (iso ? new Date(String(iso).slice(0, 10) + "T00:00:00") : null);
const daysBetween = (a, b) => Math.round((b - a) / DAY);

/** Whether a person counts on the front page at all: on the books, in the
    company picked. Left people count only towards "resigned". */
export const inScope = (e, company) => !company || e.company === company;

/** The reference's three states, worked out from the record: about to leave
    (a relieving or resignation date), just arrived (joined in the last 30 days
    or not yet), or simply Active. `sep` is the person's row from the
    separations read, when there is one. */
export function stateOf(e, sep, now = new Date()) {
	if (e.status !== "Active") return e.status || "Inactive";
	if (sep && (sep.relieving_date || sep.resignation_letter_date)) {
		const out = dateOf(sep.relieving_date);
		if (!out || out >= dateOf(now.toISOString())) return "Offboarding";
	}
	const joined = dateOf(e.date_of_joining);
	if (joined && daysBetween(joined, now) <= 30) return "Onboarding";
	return "Active";
}

/** Percentage change, one decimal — or null when there is nothing before to
    compare with. */
export function trend(now, before) {
	if (!before) return null;
	return Math.round(((now - before) / before) * 1000) / 10;
}

/** The four tiles: total, applicants, new, resigned, each with its trend. */
export function tiles({ employees, seps = [], applicants = null, company = "", now = new Date() }) {
	const inCo = employees.filter((e) => inScope(e, company));
	const active = inCo.filter((e) => e.status === "Active");
	const joinedWithin = (from, to) => inCo.filter((e) => {
		const d = dateOf(e.date_of_joining);
		if (!d) return false;
		const ago = daysBetween(d, now);
		return ago >= from && ago < to;
	}).length;
	const sepCo = seps.filter((s) => inScope(s, company));
	const leftWithin = (from, to) => sepCo.filter((s) => {
		const d = dateOf(s.relieving_date);
		if (!d) return false;
		const ago = daysBetween(d, now);
		return ago >= from && ago < to;
	}).length;

	const newNow = joinedWithin(0, WINDOW_DAYS);
	const newBefore = joinedWithin(WINDOW_DAYS, WINDOW_DAYS * 2);
	const leftNow = leftWithin(0, WINDOW_DAYS);
	const leftBefore = leftWithin(WINDOW_DAYS, WINDOW_DAYS * 2);
	/* The headcount a window ago: everybody active now, less who joined since,
	   plus who left since. */
	const headBefore = active.length - newNow + leftNow;

	return [
		{ key: "total", icon: "users", value: active.length, label: "Total Employees", trend: trend(active.length, headBefore) },
		{ key: "applicants", icon: "brief", value: applicants, label: "Job Applicants", trend: null },
		{ key: "new", icon: "plus", value: newNow, label: "New Employees", trend: trend(newNow, newBefore) },
		{ key: "left", icon: "minus", value: leftNow, label: "Resigned Employees", trend: trend(leftNow, leftBefore), down: true },
	];
}

/** The donut: everybody active, split into the reference's three states. */
export function stateSegments(employees, sepsByEmp, company = "", now = new Date()) {
	const counts = { Active: 0, Onboarding: 0, Offboarding: 0 };
	for (const e of employees) {
		if (!inScope(e, company) || e.status !== "Active") continue;
		counts[stateOf(e, sepsByEmp[e.name], now)]++;
	}
	return [
		{ label: "Others", value: counts.Active, tone: "chart-1", state: "Active" },
		{ label: "Onboarding", value: counts.Onboarding, tone: "chart-3", state: "Onboarding" },
		{ label: "Offboarding", value: counts.Offboarding, tone: "chart-2", state: "Offboarding" },
	];
}

/** The yellow strip over the page: what is waiting on somebody, as the
    reference words it — and where its button goes. Nothing waiting, no strip. */
export function attention({ leave = 0, corrections = 0, unpaid = 0, overdue = 0 }) {
	const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
	const bits = [];
	if (leave) bits.push([plural(leave, "time-off request"), " waiting"]);
	if (corrections) bits.push([plural(corrections, "attendance correction"), " waiting"]);
	if (unpaid) bits.push([String(unpaid), " unpaid this month"]);
	if (overdue) bits.push([plural(overdue, "overdue to-do"), ""]);
	if (!bits.length) return null;
	const go = leave || corrections
		? { label: "Review requests", section: "dashboard", subtab: "approvals" }
		: unpaid ? { label: "Open payroll", section: "payroll", subtab: "overview" }
			: { label: "Open to-do", section: "dashboard", subtab: "approvals" };
	return { bits, go };
}

/** "Good morning" until noon, "Good afternoon" until six, as the reference. */
export function greeting(now = new Date()) {
	const h = now.getHours();
	return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** The employees table: active people in the company picked, matched on name,
    code, designation or department, then by the three filters. */
export function tableRows(employees, sepsByEmp, { q = "", department = "", designation = "", state = "", company = "" }, now = new Date()) {
	const needle = q.trim().toLowerCase();
	return employees
		.filter((e) => inScope(e, company) && e.status === "Active")
		.map((e) => ({ ...e, state: stateOf(e, sepsByEmp[e.name], now) }))
		.filter((e) => !needle || [e.employee_name, e.name, e.employee_number, e.designation, e.department]
			.join(" ").toLowerCase().includes(needle))
		.filter((e) => (!department || e.department === department)
			&& (!designation || e.designation === designation)
			&& (!state || e.state === state))
		.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
}

/** The months the attendance chart covers, oldest first: `n` of them ending
    with this one, as `{ key: "2026-10", label: "Oct", from, to }`. */
export function monthsBack(n, now = new Date()) {
	const out = [];
	for (let i = n - 1; i >= 0; i--) {
		const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const last = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
		const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		out.push({
			key: iso(first).slice(0, 7),
			label: first.toLocaleDateString("en-US", { month: "short" }),
			from: iso(first),
			to: iso(last),
		});
	}
	return out;
}

/** Layout 2's band of four: the four employment types with most people,
    each with its change over the last month (joiners less leavers). */
export function typeBand(employees, seps, company = "", now = new Date()) {
	const active = employees.filter((e) => inScope(e, company) && e.status === "Active");
	const by = new Map();
	for (const e of active) {
		const t = e.employment_type || "Not set";
		by.set(t, (by.get(t) || 0) + 1);
	}
	const joinedLastMonth = (t) => active.filter((e) => (e.employment_type || "Not set") === t
		&& e.date_of_joining && daysBetween(dateOf(e.date_of_joining), now) <= 30).length;
	const sepByEmp = new Map(seps.map((s) => [s.name, s]));
	const leftLastMonth = (t) => employees.filter((e) => inScope(e, company)
		&& (e.employment_type || "Not set") === t && sepByEmp.get(e.name)?.relieving_date
		&& daysBetween(dateOf(sepByEmp.get(e.name).relieving_date), now) >= 0
		&& daysBetween(dateOf(sepByEmp.get(e.name).relieving_date), now) <= 30).length;
	return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([type, n]) => {
		const before = n - joinedLastMonth(type) + leftLastMonth(type);
		return { type, value: n, change: trend(n, before) };
	});
}
