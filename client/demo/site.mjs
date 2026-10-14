/* ---------------------------------------------------------------------------
   The practice site: a pretend ERPNext for trying the dashboard on dummy data.

   It answers the handful of addresses src/api/client.js calls, in Frappe's own
   shapes and status codes, from records held in memory. Pure — no network, no
   files — so tests/demosite.test.js can argue with it; demo/server.mjs puts it
   on a port and demo/run.mjs points the dev server at it.

   **It is never the real site and never talks to it.** Nothing here makes a
   request of any kind. What is written while it runs is kept until it is
   restarted, which puts the dummy data back as it was — practising should not
   leave a mess that the next person practises on.

   Two things it will not pretend to do, because pretending would be worse than
   saying so: run payroll (making salary slips is hrms's arithmetic, and a fake
   of it would be a second payroll engine), and keep files.

   It is lenient where Frappe is strict in one way only: a list asked for a
   field the records have not got answers null rather than 417. The real site's
   417 is what the client's narrow-read fall-backs exist for, and the tests that
   pin those run against mocks, not here.
   --------------------------------------------------------------------------- */

const COOKIE = "demo_sid";
const CSRF = "practice-csrf";

/** Child tables, by child doctype: where its rows live inside which parents.
    Frappe lists a child doctype only with its parent named, from the parents'
    own tables — so does this. */
const CHILD = {
	"Salary Detail": [["Salary Slip", "earnings"], ["Salary Slip", "deductions"], ["Salary Structure", "earnings"], ["Salary Structure", "deductions"]],
	"Employee Loan Repayment Schedule": [["Employee Loan Application", "repayment_schedule"]],
	"Holiday": [["Holiday List", "holidays"]],
	"Payroll Employee Detail": [["Payroll Entry", "employees"]],
};
const CHILD_OF = Object.fromEntries(Object.entries(CHILD).flatMap(([child, homes]) => homes.map(([p, f]) => [`${p}.${f}`, child])));

/** The field a doctype is named by, where Frappe names it by one. */
const NATURAL_KEY = {
	"Salary Component": "salary_component",
	"Employee Loan Type": "loan_type_name",
	"Leave Type": "leave_type_name",
	"Designation": "designation_name",
	"Work Location": "location_name",
	"Letter Type": "letter_type_name",
	"Branch": "branch",
};

/** Name prefixes, as hrms's naming series write them. */
const PREFIX = {
	"Additional Salary": "HR-ADS", "Leave Application": "HR-LAP", "Employee Overtime": "HR-OT",
	"Salary Structure Assignment": "HR-SSA", "Employee": "HR-EMP", "Attendance": "HR-ATT",
	"Leave Allocation": "HR-LAL", "Employee Checkin": "EMP-CKIN", "Shift Assignment": "HR-SHA",
	"Employee Attendance Regularization": "HR-EAR", "Leave Adjustment": "HR-LAD",
	"Employee Loan Application": "HR-LOAN", "Employee Loan Repayment": "HR-LREP",
};

/** What a refused payroll run says. Made once the companies are known. */
const payrollRefusal = (seed) => "The practice site cannot run payroll or make salary slips."
	+ (seed.meta?.slipsCompany ? ` ${seed.meta.slipsCompany} already has ${seed.meta.monthLabel} run — choose it in the top bar to see a finished month.` : "");

/* --------------------------------------------------------------- answers */

const json = (status, body, headers = {}) => ({ status, headers: { "Content-Type": "application/json", ...headers }, body });

/** Frappe's error shape: the readable part in `_server_messages`, which is what
    client.js's reason() reads first. Not also in `message` — it would read it
    twice and say everything twice. */
function fail(status, excType, message) {
	return json(status, {
		exc_type: excType,
		exception: `frappe.exceptions.${excType}: ${message}`,
		_server_messages: JSON.stringify([JSON.stringify({ message })]),
	});
}

/* --------------------------------------------------------------- filters */

const norm = (v) => (v === null || v === undefined ? "" : String(v));
const isNum = (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) && !/^\d{4}-\d{2}-\d{2}/.test(v));

/** A row's value against a filter's, the way SQL would order them: numbers as
    numbers, everything else (dates included — ISO sorts as text) as text. A date
    filter against a datetime compares the day only, which is what every caller
    here means by "on or before the 30th". */
function compare(a, b) {
	if (isNum(a) && isNum(b)) return Number(a) - Number(b);
	let x = norm(a), y = norm(b);
	if (/^\d{4}-\d{2}-\d{2}$/.test(y) && x.length > 10) x = x.slice(0, 10);
	return x < y ? -1 : x > y ? 1 : 0;
}

const likeRe = (p) => new RegExp("^" + norm(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");
const listOf = (v) => (Array.isArray(v) ? v : norm(v).split(",").map((s) => s.trim()).filter(Boolean)).map(norm);

function matches(row, [field, op, value]) {
	const a = row[field];
	switch (String(op).toLowerCase().trim()) {
	case "=": return isNum(a) && isNum(value) ? Number(a) === Number(value) : norm(a) === norm(value);
	case "!=": return !(isNum(a) && isNum(value) ? Number(a) === Number(value) : norm(a) === norm(value));
	case "<": return a != null && a !== "" && compare(a, value) < 0;
	case "<=": return a != null && a !== "" && compare(a, value) <= 0;
	case ">": return a != null && a !== "" && compare(a, value) > 0;
	case ">=": return a != null && a !== "" && compare(a, value) >= 0;
	case "in": return listOf(value).includes(norm(a));
	case "not in": return !listOf(value).includes(norm(a));
	case "like": return likeRe(value).test(norm(a));
	case "not like": return !likeRe(value).test(norm(a));
	case "between": {
		const [lo, hi] = listOf(value);
		return a != null && a !== "" && compare(a, lo) >= 0 && compare(a, hi) <= 0;
	}
	case "is": return norm(value).toLowerCase() === "set" ? norm(a) !== "" : norm(a) === "";
	default: return true;
	}
}

const parse = (v, fallback) => {
	if (v === undefined || v === null || v === "") return fallback;
	if (typeof v !== "string") return v;
	try { return JSON.parse(v); } catch { return fallback; }
};

/** Every form Frappe accepts a filter in, as [field, op, value]. */
export function conditions(raw) {
	const f = parse(raw, []);
	if (Array.isArray(f)) {
		return f.filter(Array.isArray).map((c) => (c.length >= 4 ? [c[1], c[2], c[3]] : c.length === 2 ? [c[0], "=", c[1]] : [c[0], c[1], c[2]]));
	}
	if (f && typeof f === "object") return Object.entries(f).map(([k, v]) => (Array.isArray(v) ? [k, v[0], v[1]] : [k, "=", v]));
	return [];
}

/** "`tabSalary Slip`.`net_pay` as net" → ["net_pay", "net"]. */
function fieldOf(spec) {
	const m = /^(.+?)\s+as\s+([\w]+)$/i.exec(String(spec).trim());
	const base = (m ? m[1] : String(spec)).replace(/`/g, "").replace(/^tab[^.]+\./, "").trim();
	return [base, m ? m[2] : base];
}

const flat = (row) => Object.fromEntries(Object.entries(row).filter(([, v]) => !Array.isArray(v)));

function project(row, fields) {
	const list = fields.length ? fields : ["name"];
	const out = list.includes("*") ? flat(row) : {};
	for (const spec of list) {
		if (spec === "*") continue;
		const [base, alias] = fieldOf(spec);
		out[alias] = row[base] === undefined ? null : row[base];
	}
	return out;
}

function sortRows(rows, orderBy) {
	const keys = String(orderBy || "modified desc").split(",").map((p) => {
		const [f, dir] = p.trim().split(/\s+/);
		return [fieldOf(f)[0], String(dir || "asc").toLowerCase() === "desc" ? -1 : 1];
	}).filter(([f]) => f);
	return rows.slice().sort((a, b) => {
		for (const [f, dir] of keys) {
			const c = compare(a[f], b[f]);
			if (c) return c * dir;
		}
		return 0;
	});
}

/* --------------------------------------------------------------- the site */

/**
 * @param {{docs: Record<string, object[]>, singles: Record<string, object>, meta: object}} seed  demo/data.mjs's makeData()
 * @param {{now?: () => Date}} [opts]
 */
export function createSite(seed, { now = () => new Date() } = {}) {
	/* doctype → name → document. A copy, so a restart (a new site from the same
	   seed) really does put everything back. */
	const db = new Map();
	for (const [dt, rows] of Object.entries(seed.docs)) {
		db.set(dt, new Map(rows.map((r) => [r.name, adopt(structuredClone({ doctype: dt, docstatus: 0, ...r }))])));
	}
	for (const [dt, doc] of Object.entries(seed.singles || {})) {
		db.set(dt, new Map([[dt, structuredClone({ doctype: dt, name: dt, docstatus: 0, ...doc })]]));
	}
	const sessions = new Map();
	const counters = new Map();
	let tick = 0;

	const stamp = () => {
		/* Strictly increasing, so "newest first" is never a tie between two
		   things written in the same millisecond. */
		const t = new Date(now().getTime() + (tick++));
		const p = (n, w = 2) => String(n).padStart(w, "0");
		return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}.${p(t.getMilliseconds() * 1000, 6)}`;
	};
	const table = (dt) => {
		if (!db.has(dt)) db.set(dt, new Map());
		return db.get(dt);
	};

	/** The rows a list of `dt` reads — a child doctype's from its parents. */
	function rowsOf(dt, parentType) {
		const homes = CHILD[dt];
		if (!homes) return [...table(dt).values()];
		const out = [];
		for (const [p, field] of homes) {
			if (parentType && p !== parentType) continue;
			for (const doc of table(p).values()) for (const c of doc[field] || []) out.push(c);
		}
		return out;
	}

	function newName(dt, body) {
		if (body.name) return String(body.name);
		if (body.__newname) return String(body.__newname);
		const key = NATURAL_KEY[dt];
		if (key && body[key]) return String(body[key]);
		const prefix = PREFIX[dt] || dt.split(/\s+/).map((w) => w[0]).join("").toUpperCase();
		const n = (counters.get(dt) || 0) + 1;
		counters.set(dt, n);
		return `${prefix}-PRACTICE-${String(n).padStart(5, "0")}`;
	}

	/** Child rows given their parent's name and their place in it. */
	function adopt(doc) {
		for (const [field, v] of Object.entries(doc)) {
			if (!Array.isArray(v) || !v.every((x) => x && typeof x === "object")) continue;
			doc[field] = v.map((c, i) => ({
				doctype: CHILD_OF[`${doc.doctype}.${field}`] || c.doctype || "",
				name: c.name || `${doc.name}-${field}-${i + 1}`,
				...c, parent: doc.name, parenttype: doc.doctype, parentfield: field, idx: i + 1,
			}));
		}
		return doc;
	}

	function insert(dt, body, user) {
		const t = stamp();
		const name = newName(dt, body);
		if (table(dt).has(name)) return fail(409, "DuplicateEntryError", `${dt} ${name} already exists.`);
		const doc = { ...body, doctype: dt, name, owner: user, creation: t, modified: t, modified_by: user, docstatus: Number(body.docstatus) || 0 };
		delete doc.__newname;
		if (dt === "Employee" && !doc.employee_name) {
			doc.employee_name = [doc.first_name, doc.middle_name, doc.last_name].filter(Boolean).join(" ");
		}
		if (dt === "Employee" && !doc.status) doc.status = "Active";
		table(dt).set(name, adopt(doc));
		return json(200, { data: structuredClone(doc) });
	}

	/* ------------------------------------------------------------- methods */

	function leaveLedger(employee, date, type) {
		const rows = rowsOf("Leave Ledger Entry").filter((e) => e.employee === employee && Number(e.docstatus) === 1
			&& !Number(e.is_expired) && (!date || norm(e.from_date) <= norm(date)) && (!type || e.leave_type === type));
		return rows;
	}

	function method(name, req, user) {
		const q = { ...(req.query || {}), ...(req.body || {}) };
		switch (name) {
		case "frappe.auth.get_logged_user":
			return json(200, { message: user });
		case "frappe.client.has_permission":
			return json(200, { message: { has_permission: true } });
		case "frappe.sessions.get_csrf_token":
			return json(200, { message: CSRF });
		case "frappe.client.get_count": {
			const conds = conditions(q.filters);
			return json(200, { message: rowsOf(q.doctype).filter((r) => conds.every((c) => matches(r, c))).length });
		}
		case "frappe.desk.form.load.getdoctype":
			return json(200, { docs: [{ doctype: "DocType", name: q.doctype, fields: [] }] });
		case "hrms.hr.doctype.leave_application.leave_application.get_leave_details": {
			const out = {};
			for (const e of leaveLedger(q.employee, q.date)) {
				const t = out[e.leave_type] || (out[e.leave_type] = { total_leaves: 0, expired_leaves: 0, leaves_taken: 0, leaves_pending_approval: 0, remaining_leaves: 0 });
				const n = Number(e.leaves) || 0;
				if (e.transaction_type === "Leave Application") t.leaves_taken -= n;
				else t.total_leaves += n;
				t.remaining_leaves += n;
			}
			return json(200, { message: { leave_allocation: out, leave_approver: "", lwps: ["Leave Without Pay"] } });
		}
		case "hrms.hr.doctype.leave_application.leave_application.get_leave_balance_on":
			return json(200, { message: leaveLedger(q.employee, q.date, q.leave_type).reduce((t, e) => t + (Number(e.leaves) || 0), 0) });
		case "frappe.desk.form.save.savedocs": {
			const doc = parse(q.doc, {});
			const action = String(q.action || "Save");
			if (doc.doctype === "Payroll Entry") return fail(417, "ValidationError", payrollRefusal(seed));
			const had = doc.name && table(doc.doctype).get(doc.name);
			if (!had) {
				const made = insert(doc.doctype, { ...doc, docstatus: action === "Submit" ? 1 : 0 }, user);
				return made.status === 200 ? json(200, { docs: [made.body.data] }) : made;
			}
			if (Number(had.docstatus) === 2) return fail(417, "ValidationError", "A cancelled document cannot be changed.");
			const next = adopt({ ...had, ...doc, doctype: had.doctype, name: had.name, modified: stamp(), modified_by: user });
			next.docstatus = action === "Submit" ? 1 : action === "Cancel" ? 2 : Number(had.docstatus);
			table(had.doctype).set(had.name, next);
			return json(200, { docs: [structuredClone(next)] });
		}
		case "run_doc_method":
			return fail(417, "ValidationError", payrollRefusal(seed));
		case "frappe.desk.form.utils.add_comment":
			return json(200, { message: { name: "PRACTICE-COMMENT" } });
		case "upload_file":
			return fail(417, "ValidationError", "Files are not kept on the practice site.");
		default:
			if (name.startsWith("manna_hr.")) return fail(417, "ValidationError", "That is not available on the practice site.");
			return fail(403, "PermissionError", `Function ${name} is not whitelisted.`);
		}
	}

	/* ------------------------------------------------------------- resources */

	function list(dt, q) {
		const conds = conditions(q.filters);
		const ors = conditions(q.or_filters);
		let rows = rowsOf(dt, q.parent).filter((r) => conds.every((c) => matches(r, c)) && (!ors.length || ors.some((c) => matches(r, c))));
		rows = sortRows(rows, q.order_by);
		const start = Number(q.limit_start) || 0;
		const raw = q.limit_page_length ?? q.limit;
		const len = raw === undefined || raw === "" ? 20 : Number(raw);
		const page = len > 0 ? rows.slice(start, start + len) : rows.slice(start);
		const fields = parse(q.fields, []);
		return json(200, { data: page.map((r) => project(r, Array.isArray(fields) ? fields : [])) });
	}

	function resource(req, dt, name, user) {
		const verb = req.method.toUpperCase();
		if (!name) {
			if (verb === "GET") return list(dt, req.query || {});
			if (verb === "POST") {
				const body = parse(req.body?.data, null) || req.body || {};
				if (dt === "Payroll Entry") return fail(417, "ValidationError", payrollRefusal(seed));
				if (dt === "Salary Slip") return fail(417, "ValidationError", "Salary slips are made by a payroll run, and the practice site cannot run payroll.");
				return insert(dt, body, user);
			}
			return fail(405, "ValidationError", "Not allowed.");
		}
		const doc = table(dt).get(name);
		if (!doc) return fail(404, "DoesNotExistError", `${dt} ${name} not found`);
		if (verb === "GET") return json(200, { data: structuredClone(doc) });
		if (verb === "PUT") {
			if (Number(doc.docstatus) === 2) return fail(417, "ValidationError", "A cancelled document cannot be changed.");
			const patch = parse(req.body?.data, null) || req.body || {};
			const next = adopt({ ...doc, ...patch, doctype: dt, name, owner: doc.owner, creation: doc.creation, modified: stamp(), modified_by: user });
			table(dt).set(name, next);
			return json(200, { data: structuredClone(next) });
		}
		if (verb === "DELETE") {
			if (Number(doc.docstatus) === 1) return fail(417, "ValidationError", "Submitted Record cannot be deleted. You must Cancel it first.");
			table(dt).delete(name);
			return json(202, { message: "ok" });
		}
		return fail(405, "ValidationError", "Not allowed.");
	}

	/* ------------------------------------------------------------- the door */

	/**
	 * One request.
	 * @param {{method: string, path: string, query?: object, body?: object, cookies?: object}} req
	 * @returns {{status: number, headers: object, body: any}}
	 */
	function handle(req) {
		const path = String(req.path || "/").split("?")[0];
		const verb = String(req.method || "GET").toUpperCase();
		const sid = req.cookies?.[COOKIE];
		const user = sid && sessions.get(sid);

		/* The desk page, for the CSRF token in its bootinfo (fetchCsrf). */
		if (path === "/app" || path.startsWith("/app/") || path === "/desk" || path.startsWith("/desk/")) {
			return { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
				body: `<!doctype html><title>Practice site</title><script>frappe.csrf_token = "${CSRF}";</script><p>This is the practice site. There is no desk here.</p>` };
		}
		if (path.startsWith("/files/") || path.startsWith("/private/")) {
			return { status: 404, headers: { "Content-Type": "text/plain" }, body: "Files are not kept on the practice site." };
		}

		const m = /^\/api\/method\/([^/]+)\/?$/.exec(path);
		if (m) {
			const name = decodeURIComponent(m[1]);
			if (name === "login") {
				const usr = norm(req.body?.usr).trim(), pwd = norm(req.body?.pwd);
				if (!usr || !pwd) return fail(401, "AuthenticationError", "Type any name and any password — this is the practice site.");
				const token = `practice-${sessions.size + 1}-${now().getTime()}`;
				sessions.set(token, usr);
				return json(200, { message: "Logged In", home_page: "/app", full_name: usr },
					{ "Set-Cookie": [`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`] });
			}
			if (name === "logout") {
				if (sid) sessions.delete(sid);
				return json(200, { message: null }, { "Set-Cookie": [`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`] });
			}
			if (name === "frappe.sessions.get_csrf_token") return json(200, { message: CSRF });
			if (!user) return fail(403, "PermissionError", "Not permitted. Sign in to the practice site first.");
			return method(name, { ...req, method: verb }, user);
		}

		const r = /^\/api\/resource\/([^/]+)(?:\/(.+))?\/?$/.exec(path);
		if (r) {
			if (!user) return fail(403, "PermissionError", "Not permitted. Sign in to the practice site first.");
			return resource({ ...req, method: verb }, decodeURIComponent(r[1]), r[2] ? decodeURIComponent(r[2]) : "", user);
		}
		return fail(404, "DoesNotExistError", "Not found on the practice site.");
	}

	return { handle, meta: seed.meta };
}
