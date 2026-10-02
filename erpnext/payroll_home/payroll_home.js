/* Payroll Home — the Script of the Custom HTML Block "Payroll Home".

   Lives on the ERPNext site (Workspace → Payroll Home) and runs in the desk as
   the signed-in user, so it reads and writes under that person's own roles and
   nothing here can do what the desk would refuse. Source of truth is this file;
   tools/deploy_payroll_home.py puts it on the site.

   It COMPUTES NOTHING. Every amount is a Salary Slip's own gross, deductions and
   net. What it does is count documents, say which of the four steps a month is
   at, and lay the slips out in one table. `root_element` is the block's shadow
   root, handed in by Frappe. */

(function () {
	var REQUIRED = [
		{ name: "Leave Encashment", abbr: "LENC", type: "Earning", tax: 1, desc: "Leave encashment, paid through an Additional Salary." },
		{ name: "Salary Advance", abbr: "SADV", type: "Deduction", tax: 0, desc: "An advance taken, recovered from pay." },
		{ name: "Loan EMI", abbr: "LEMI", type: "Deduction", tax: 0, desc: "A loan instalment, recovered from pay." },
	];
	var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

	/* ---------- pure: what the documents mean ---------- */

	function pad(n) { return (n < 10 ? "0" : "") + n; }
	function period(ym) {
		var p = ym.split("-"), y = +p[0], m = +p[1];
		return [ym + "-01", ym + "-" + pad(new Date(y, m, 0).getDate())];
	}
	function lastMonth() {
		var d = new Date(); d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
		return d.getFullYear() + "-" + pad(d.getMonth() + 1);
	}
	function monthChoices() {
		var d = new Date(), out = [];
		for (var i = 0; i < 19; i++) { var x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(x.getFullYear() + "-" + pad(x.getMonth() + 1)); }
		return out;
	}
	function label(ym) { return MONTHS[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4); }
	function money(v) { return Number(v) ? Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""; }
	function rupees(v) { return "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }
	function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

	/* The one Payroll Entry that stands for the month, and where it is. */
	function runState(entries, slips) {
		var live = (slips || []).filter(function (s) { return +s.docstatus < 2; });
		var entry = (entries || []).filter(function (e) { return +e.docstatus < 2; })
			.sort(function (a, b) { return (+b.docstatus === 1) - (+a.docstatus === 1) || String(b.creation).localeCompare(String(a.creation)); })[0] || null;
		var allSub = live.length && live.every(function (s) { return +s.docstatus === 1; });
		var state;
		if (!entry) state = !live.length ? "none" : allSub ? "final" : "slips";
		else if (entry.status === "Failed") state = "failed";
		else if (+entry.docstatus === 0) state = "draft";
		else if (!live.length) state = "queued";
		else state = allSub ? "final" : "slips";
		return { entry: entry, state: state, live: live };
	}

	/* Column kinds, so leave encashment, an advance and a loan instalment sit
	   after the ordinary components, each in its own colour. */
	function kindOf(c) {
		if (/encash/i.test(c)) return "encash";
		if (/advance/i.test(c)) return "advance";
		if (/\bloan\b|\bemi\b/i.test(c)) return "loan";
		return "";
	}
	var KIND_ORDER = { "": 0, encash: 1, advance: 2, loan: 3 };
	var KIND_TAG = { encash: "leave encashment", advance: "advance", loan: "loan EMI" };

	function buildSheet(slips, details) {
		var live = (slips || []).filter(function (s) { return +s.docstatus < 2; })
			.sort(function (a, b) { return String(a.employee_name).localeCompare(String(b.employee_name)); });
		var by = {}, earn = {}, ded = {};
		(details || []).forEach(function (d) {
			(by[d.parent] = by[d.parent] || []).push(d);
			var bag = d.parentfield === "deductions" ? ded : earn;
			if (!(d.salary_component in bag)) bag[d.salary_component] = +d.idx || 0;
		});
		function cols(bag) {
			return Object.keys(bag).map(function (n) { return { name: n, kind: kindOf(n), idx: bag[n] }; })
				.sort(function (a, b) { return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.idx - b.idx; });
		}
		var earnCols = cols(earn), dedCols = cols(ded);
		var t = { count: live.length, submitted: 0, gross: 0, deduction: 0, net: 0, earn: {}, ded: {} };
		var rows = live.map(function (s) {
			var r = { slip: s.name, employee: s.employee, name: s.employee_name, days: s.payment_days, lwp: s.leave_without_pay,
				gross: +s.gross_pay || 0, deduction: +s.total_deduction || 0, net: +s.net_pay || 0,
				state: +s.docstatus === 1 ? "Submitted" : "Draft", earn: {}, ded: {} };
			(by[s.name] || []).forEach(function (d) {
				var bag = d.parentfield === "deductions" ? r.ded : r.earn, tot = d.parentfield === "deductions" ? t.ded : t.earn;
				bag[d.salary_component] = (bag[d.salary_component] || 0) + (+d.amount || 0);
				tot[d.salary_component] = (tot[d.salary_component] || 0) + (+d.amount || 0);
			});
			t.gross += r.gross; t.deduction += r.deduction; t.net += r.net; if (+s.docstatus === 1) t.submitted++;
			return r;
		});
		return { rows: rows, earnCols: earnCols, dedCols: dedCols, totals: t };
	}

	/* The four steps, and the first one not done. */
	function steps(d, ym) {
		var missing = d.components ? REQUIRED.filter(function (c) { return !d.components.some(function (r) { return r.name === c.name && !+r.disabled; }); }) : null;
		var bare = null;
		if (d.ssa && d.people) {
			var have = {}; d.ssa.forEach(function (a) { have[a.employee] = 1; });
			var end = period(ym)[1];
			bare = d.people.filter(function (e) { return !have[e.name] && (!e.date_of_joining || e.date_of_joining <= end); });
		}
		var out = [];
		var s1;
		if (missing === null && bare === null) s1 = { state: "unknown", text: "The site would not say what is set up — this login may not read it." };
		else if ((missing && missing.length) || (bare && bare.length)) {
			var bits = [];
			if (missing && missing.length) bits.push(plural(missing.length, "salary component is", "salary components are") + " missing: " + missing.map(function (c) { return c.name; }).join(", "));
			if (bare && bare.length) bits.push(plural(bare.length, "person has", "people have") + " no salary structure, so they will not be paid");
			s1 = { state: "warn", text: bits.join(". ") + "." };
		} else if (missing === null || bare === null) s1 = { state: "unknown", text: "Part of the set-up could not be read." };
		else s1 = { state: "done", text: "Salary components are on the site and everybody has a salary structure." };
		s1.id = "setup"; s1.title = "Check the set-up"; s1.missing = missing || []; s1.bare = bare || [];
		out.push(s1);

		var s2;
		if (!d.extras) s2 = { state: "unknown", text: "The site would not say what has been added for this month." };
		else {
			var drafts = d.extras.filter(function (x) { return +x.docstatus === 0; }).length;
			s2 = !d.extras.length ? { state: "done", text: "Nothing has been added this month — no advance, loan instalment or bonus." }
				: drafts ? { state: "warn", text: plural(drafts, "item is", "items are") + " still a draft. Frappe takes nothing from pay until it is submitted." }
				: { state: "done", text: plural(d.extras.length, "item", "items") + " added and submitted." };
			s2.drafts = drafts;
		}
		s2.id = "extras"; s2.title = "Advances, loans and bonuses"; out.push(s2);

		var r = runState(d.entries, d.slips), tot = d.sheet.totals, s3;
		if (!d.slips) s3 = { state: "unknown", text: "The site would not say what has been paid." };
		else if (r.state === "none") s3 = { state: "todo", text: "Salary has not been run for this month yet." };
		else if (r.state === "draft") s3 = { state: "todo", text: "The people are picked. Create the salary slips to continue." };
		else if (r.state === "queued") s3 = { state: "wait", text: "Frappe is making the salary slips. Refresh in a minute." };
		else if (r.state === "failed") s3 = { state: "warn", text: "The salary run failed. Open it to see why." };
		else if (r.state === "slips") s3 = { state: "warn", text: plural(tot.count - tot.submitted, "slip is", "slips are") + " still a draft. Check them, then submit." };
		else s3 = { state: "done", text: plural(tot.count, "slip", "slips") + " submitted." };
		s3.id = "run"; s3.title = "Run the salary"; s3.run = r; out.push(s3);

		var s4 = r.state === "final" ? { state: "done", text: "Everything is submitted. Download the sheet and pay." }
			: tot.count ? { state: "todo", text: "Look over the salary sheet below while the slips are in draft." }
			: { state: "todo", text: "Available once the salary slips exist." };
		s4.id = "review"; s4.title = "Check it and pay"; out.push(s4);

		var cur = out.findIndex(function (s) { return s.state !== "done"; });
		return { list: out, current: cur < 0 ? out.length : cur };
	}

	/* ---------- the site ---------- */

	function call(method, args) {
		return frappe.call({ method: method, args: args, silent: true }).then(function (r) { return r.message; });
	}
	function list(doctype, fields, filters, extra) {
		return call("frappe.client.get_list", Object.assign({ doctype: doctype, fields: fields, filters: filters, limit_page_length: 0 }, extra || {}))
			.then(function (r) { return r || []; }, function () { return null; });
	}
	function listSome(doctype, wide, narrow, filters) {
		return list(doctype, wide, filters).then(function (r) { return r === null ? list(doctype, narrow, filters) : r; });
	}

	var st = { company: "", companies: [], ym: lastMonth(), data: null, busy: false, msg: "" };

	function load() {
		st.busy = true; st.msg = ""; render();
		var p = period(st.ym), start = p[0], end = p[1];
		var co = st.company ? [["company", "=", st.company]] : [];
		return Promise.all([
			list("Salary Component", ["name", "disabled"], [["name", "in", REQUIRED.map(function (c) { return c.name; })]]),
			list("Additional Salary", ["name", "employee", "docstatus"], [["payroll_date", ">=", start], ["payroll_date", "<=", end], ["docstatus", "<", 2]].concat(co)),
			listSome("Payroll Entry", ["name", "docstatus", "status", "creation"], ["name", "docstatus", "creation"], [["start_date", "=", start], ["end_date", "=", end], ["docstatus", "<", 2]].concat(co)),
			list("Salary Slip", ["name", "employee", "employee_name", "payment_days", "leave_without_pay", "gross_pay", "total_deduction", "net_pay", "docstatus"],
				[["start_date", ">=", start], ["end_date", "<=", end], ["docstatus", "<", 2]].concat(co)),
			list("Salary Structure Assignment", ["employee"], [["docstatus", "=", 1], ["from_date", "<=", end]].concat(co)),
			list("Employee", ["name", "employee_name", "date_of_joining"], [["status", "=", "Active"]].concat(co)),
		]).then(function (a) {
			var d = { components: a[0], extras: a[1], entries: a[2], slips: a[3], ssa: a[4], people: a[5], details: [] };
			var names = (d.slips || []).map(function (s) { return s.name; }), chunks = [];
			for (var i = 0; i < names.length; i += 60) chunks.push(names.slice(i, i + 60));
			return Promise.all(chunks.map(function (c) {
				return list("Salary Detail", ["parent", "parentfield", "salary_component", "amount", "idx"], [["parent", "in", c]], { parent: "Salary Slip" });
			})).then(function (parts) {
				parts.forEach(function (p) { d.details = d.details.concat(p || []); });
				d.sheet = buildSheet(d.slips, d.details);
				st.data = d; st.busy = false; render();
			});
		});
	}

	function makeComponents() {
		var todo = steps(st.data, st.ym).list[0].missing;
		if (!todo.length) return;
		frappe.confirm("Make " + todo.map(function (c) { return c.name; }).join(", ") + " on the site? Each is one Salary Component, and you can change it afterwards.", function () {
			var chain = Promise.resolve();
			todo.forEach(function (c) {
				chain = chain.then(function () {
					return call("frappe.client.insert", { doc: { doctype: "Salary Component", salary_component: c.name, salary_component_abbr: c.abbr, type: c.type,
						is_tax_applicable: c.tax, depends_on_payment_days: 0, description: c.desc } });
				});
			});
			chain.then(function () { st.msg = "Made " + todo.length + " salary component(s)."; return load(); },
				function (e) { st.msg = "The site refused one: " + ((e && e.message) || "see the Error Log."); render(); });
		});
	}

	/* ---------- the file ---------- */

	function csv(sheet, company, info, ym) {
		function q(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
		var rows = [];
		rows.push([company || "All companies"]);
		var extra = [];
		if (info) {
			if (info.tax_id) extra.push("GSTIN/Tax ID: " + info.tax_id);
			if (info.registration_details) extra.push("Reg: " + info.registration_details);
			if (info.phone_no) extra.push("Phone: " + info.phone_no);
			if (info.email) extra.push("Email: " + info.email);
		}
		if (extra.length) rows.push([extra.join("   ")]);
		rows.push(["SALARY STATEMENT — " + label(ym).toUpperCase()]);
		rows.push([]);
		var head = ["Employee", "Name", "Pay days"];
		sheet.earnCols.forEach(function (c) { head.push(c.name + (c.kind ? " (" + KIND_TAG[c.kind] + ")" : "")); });
		head.push("Gross");
		sheet.dedCols.forEach(function (c) { head.push(c.name + (c.kind ? " (" + KIND_TAG[c.kind] + ")" : "")); });
		head.push("Total deductions", "Net pay", "Slip");
		rows.push(head);
		sheet.rows.forEach(function (r) {
			var x = [r.employee, r.name, r.days];
			sheet.earnCols.forEach(function (c) { x.push(r.earn[c.name] || ""); });
			x.push(r.gross);
			sheet.dedCols.forEach(function (c) { x.push(r.ded[c.name] || ""); });
			x.push(r.deduction, r.net, r.state);
			rows.push(x);
		});
		var t = sheet.totals, tot = ["TOTAL", "", ""];
		sheet.earnCols.forEach(function (c) { tot.push(t.earn[c.name] || ""); });
		tot.push(t.gross);
		sheet.dedCols.forEach(function (c) { tot.push(t.ded[c.name] || ""); });
		tot.push(t.deduction, t.net, "");
		rows.push(tot);
		return "﻿" + rows.map(function (r) { return r.map(q).join(","); }).join("\r\n");
	}

	function download() {
		var go = function (info) {
			var blob = new Blob([csv(st.data.sheet, st.company, info, st.ym)], { type: "text/csv;charset=utf-8" });
			var a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = "salary-sheet-" + (st.company || "all").replace(/[^\w]+/g, "-") + "-" + st.ym + ".csv";
			document.body.appendChild(a); a.click(); a.remove();
		};
		if (!st.company) return go(null);
		frappe.db.get_value("Company", st.company, ["tax_id", "registration_details", "phone_no", "email"]).then(function (r) { go(r.message); }, function () { go(null); });
	}

	/* ---------- the screen ---------- */

	var CHIP = { done: ["ok", "Done"], warn: ["warn", "Needs you"], wait: ["", "Working"], todo: ["", "To do"], unknown: ["", "Not known"] };

	function go(doctype, filters) { frappe.set_route("List", doctype, filters || {}); }

	function actions(s) {
		var p = period(st.ym), start = p[0], end = p[1], a = [];
		if (s.id === "setup") {
			if (s.missing.length) a.push(["Make the missing components", makeComponents, true]);
			if (s.bare.length) a.push(["Assign salary structures in bulk", function () { frappe.new_doc("Bulk Salary Structure Assignment", st.company ? { company: st.company } : {}); }, true]);
			a.push(["Salary Components", function () { go("Salary Component"); }]);
		} else if (s.id === "extras") {
			a.push(["Add an advance", function () { frappe.new_doc("Additional Salary", { salary_component: "Salary Advance", payroll_date: end, company: st.company || undefined }); }]);
			a.push(["Add a loan instalment", function () { frappe.new_doc("Additional Salary", { salary_component: "Loan EMI", payroll_date: end, company: st.company || undefined }); }]);
			a.push(["Add a bonus or other", function () { frappe.new_doc("Additional Salary", { payroll_date: end, company: st.company || undefined }); }]);
			if (s.drafts) a.push(["Submit the drafts", function () { go("Additional Salary", { payroll_date: ["between", [start, end]], docstatus: 0 }); }, true]);
		} else if (s.id === "run") {
			var e = s.run.entry;
			if (!e) a.push(["Start the salary run", function () { frappe.new_doc("Payroll Entry", { company: st.company || undefined, posting_date: end, start_date: start, end_date: end, payroll_frequency: "Monthly" }); }, true]);
			else a.push(["Open " + e.name, function () { frappe.set_route("Form", "Payroll Entry", e.name); }, s.state !== "done"]);
		} else if (s.id === "review") {
			a.push(["Salary slips", function () { go("Salary Slip", { start_date: [">=", start], end_date: ["<=", end] }); }]);
			a.push(["Salary Register", function () { frappe.set_route("query-report", "Salary Register", { from_date: start, to_date: end, company: st.company || undefined }); }]);
			a.push(["Bank Remittance", function () { frappe.set_route("query-report", "Bank Remittance"); }]);
		}
		return a;
	}

	function render() {
		var d = st.data, root = root_element, handlers = [];
		function on(fn) { handlers.push(fn); return "data-h=\"" + (handlers.length - 1) + "\""; }
		var h = [];
		h.push('<div class="ph"><div class="bar"><div><h2>Payroll</h2><div class="sub">' + esc(label(st.ym)) + ' · ' + esc(st.company || "all companies") + '</div></div><div class="ctl">');
		h.push('<select data-k="company" aria-label="Company"><option value="">All companies</option>' + st.companies.map(function (c) { return '<option' + (c === st.company ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>");
		h.push('<select data-k="ym" aria-label="Month">' + monthChoices().map(function (m) { return '<option value="' + m + '"' + (m === st.ym ? " selected" : "") + ">" + label(m) + "</option>"; }).join("") + "</select>");
		h.push('<button class="btn" ' + on(load) + ">Refresh</button></div></div>");
		if (st.msg) h.push('<div class="note">' + esc(st.msg) + "</div>");
		if (!d) { h.push('<p class="muted">' + (st.busy ? "Reading " + esc(label(st.ym)) + "…" : "") + "</p></div>"); root.innerHTML = css() + h.join(""); wire(root, handlers); return; }

		var S = steps(d, st.ym), t = d.sheet.totals;
		h.push('<div class="tiles">' + [["People to pay", d.people ? d.people.length : "—"], ["Slips made", t.count], ["Gross", t.count ? rupees(t.gross) : "—"], ["Net pay", t.count ? rupees(t.net) : "—"],
			["Next", S.current < S.list.length ? S.list[S.current].title : "All done"]].map(function (x) { return '<div class="tile"><span class="k">' + x[0] + '</span><span class="n">' + esc(x[1]) + "</span></div>"; }).join("") + "</div>");

		h.push('<div class="card"><h3>Getting ' + esc(label(st.ym)) + " paid</h3>");
		S.list.forEach(function (s, i) {
			var c = CHIP[s.state];
			h.push('<div class="step' + (i === S.current ? " cur" : "") + '"><div class="num">' + (i + 1) + '</div><div class="body"><div class="t"><b>' + esc(s.title) + '</b> <span class="chip ' + c[0] + '">' + c[1] + "</span>" +
				(i === S.current ? ' <span class="muted">— do this next</span>' : "") + '</div><div class="x">' + esc(s.text) + "</div>");
			if (s.bare && s.bare.length) h.push('<div class="muted small">' + esc(s.bare.slice(0, 8).map(function (e) { return e.employee_name || e.name; }).join(", ")) + (s.bare.length > 8 ? " and " + (s.bare.length - 8) + " more" : "") + "</div>");
			h.push('<div class="act">' + actions(s).map(function (a) { return "<button class=\"btn" + (a[2] ? " pri" : "") + '" ' + on(a[1]) + ">" + esc(a[0]) + "</button>"; }).join("") + "</div></div></div>");
		});
		h.push("</div>");

		var sh = d.sheet;
		h.push('<div class="card"><div class="bar"><h3>' + esc(label(st.ym)) + ' — every earning and deduction</h3><div class="ctl"><button class="btn pri" ' + (sh.rows.length ? on(download) : "disabled") + ">Download for Excel</button></div></div>");
		if (!sh.rows.length) h.push('<p class="muted">No salary slips for ' + esc(label(st.ym)) + " yet. Start the salary run in step 3.</p>");
		else {
			var tag = function (c) { return c.name + (c.kind ? '<small class="k-' + c.kind + '">' + KIND_TAG[c.kind] + "</small>" : ""); };
			h.push('<div class="scroll"><table><thead><tr><th>Employee</th><th>Pay days</th>' + sh.earnCols.map(function (c) { return "<th>" + tag(c) + "</th>"; }).join("") + "<th>Gross</th>" +
				sh.dedCols.map(function (c) { return "<th>" + tag(c) + "</th>"; }).join("") + "<th>Deductions</th><th>Net pay</th><th>Slip</th></tr></thead><tbody>");
			sh.rows.forEach(function (r) {
				h.push("<tr><td>" + esc(r.name) + '<small>' + esc(r.employee) + '</small></td><td class="num">' + esc(r.days) + (+r.lwp ? "<small>" + esc(r.lwp) + " LWP</small>" : "") + "</td>" +
					sh.earnCols.map(function (c) { return '<td class="num">' + money(r.earn[c.name]) + "</td>"; }).join("") + '<td class="num"><b>' + money(r.gross) + "</b></td>" +
					sh.dedCols.map(function (c) { return '<td class="num">' + money(r.ded[c.name]) + "</td>"; }).join("") +
					'<td class="num"><b>' + money(r.deduction) + '</b></td><td class="num"><b>' + money(r.net) + '</b></td><td><span class="chip ' + (r.state === "Submitted" ? "ok" : "warn") + '">' + r.state + "</span></td></tr>");
			});
			h.push('</tbody><tfoot><tr><td><b>Total</b></td><td></td>' + sh.earnCols.map(function (c) { return '<td class="num"><b>' + money(sh.totals.earn[c.name]) + "</b></td>"; }).join("") +
				'<td class="num"><b>' + money(sh.totals.gross) + "</b></td>" + sh.dedCols.map(function (c) { return '<td class="num"><b>' + money(sh.totals.ded[c.name]) + "</b></td>"; }).join("") +
				'<td class="num"><b>' + money(sh.totals.deduction) + '</b></td><td class="num"><b>' + money(sh.totals.net) + "</b></td><td></td></tr></tfoot></table></div>");
			if (sh.totals.submitted < sh.totals.count) h.push('<p class="muted small">Slips marked Draft are included so the month can be checked first. Nothing is paid until they are submitted.</p>');
		}
		h.push("</div></div>");
		root.innerHTML = css() + h.join("");
		wire(root, handlers);
	}

	function wire(root, handlers) {
		Array.prototype.forEach.call(root.querySelectorAll("[data-h]"), function (b) { b.addEventListener("click", handlers[+b.getAttribute("data-h")]); });
		Array.prototype.forEach.call(root.querySelectorAll("select[data-k]"), function (s) {
			s.addEventListener("change", function () { st[s.getAttribute("data-k")] = s.value; st.data = null; load(); });
		});
	}

	function css() { return "<style>" + STYLE + "</style>"; }
	var STYLE = "__STYLE__";

	/* ---------- start ---------- */

	var test = typeof window !== "undefined" && window.__payroll_home_test__;
	if (test) test.pure = { period: period, runState: runState, buildSheet: buildSheet, steps: steps, kindOf: kindOf, csv: csv, REQUIRED: REQUIRED, state: st };

	list("Company", ["name"], []).then(function (cs) {
		st.companies = (cs || []).map(function (c) { return c.name; });
		var def = frappe.defaults && frappe.defaults.get_default ? frappe.defaults.get_default("company") : "";
		st.company = st.companies.indexOf(def) >= 0 ? def : (st.companies.length === 1 ? st.companies[0] : "");
		return load();
	});
})();
