/* ---------------------------------------------------------------------------
   The app, photographed — every module, three widths.

       npm run dev            # in one terminal
       npm run shots          # in another

   **This is the check `npm test` cannot make.** jsdom renders a component tree
   and asserts on it; it has no layout engine, so a rail that overlaps the page,
   a card that scrolls sideways, a legend that collides with its chart and a
   token overridden by a stray rule all pass there and are obvious the moment
   somebody looks. This looks.

   It is also the only thing in this repo that renders the app **signed in**.
   `scripts/smoke.mjs` is the opposite bargain: the real site, a deliberately
   wrong password, and no data. Here the site is stubbed and the layout is real,
   so between them the two cover the path and the picture without this repo ever
   holding a credential.

   The fixture below is deliberately small and deliberately gappy — one person
   with no department, one on leave, one company with nobody in it — because an
   even fixture photographs a screen nobody will ever see.

   Chrome as installed rather than downloaded: `channel: "chrome"`, so `npm i`
   does not pull a browser nobody asked for.
   --------------------------------------------------------------------------- */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const APP = process.env.SHOTS_URL || "http://localhost:5173";
const OUT = process.env.SHOTS_DIR || path.join("scripts", ".shots");

/* --------------------------------------------------------------- the site */

const today = new Date().toISOString().slice(0, 10);
const ago = (d) => {
	const t = new Date();
	t.setDate(t.getDate() - d);
	return t.toISOString().slice(0, 10);
};

const EMPLOYEES = [
	["HR-EMP-00001", "Raghav Menon", "1041", "Manna Rubber", "Production - MR", "Machine Operator", ago(400), 620000],
	["HR-EMP-00002", "Fatima Sheikh", "1042", "Manna Rubber", "Production - MR", "Shift Supervisor", ago(320), 840000],
	["HR-EMP-00003", "Joseph Ekka", "1043", "Manna Rubber", "Quality - MR", "Inspector", ago(60), 510000],
	["HR-EMP-00004", "Priya Nair", "1044", "Manna Polymers", "Accounts - MP", "Accountant", ago(28), 720000],
	["HR-EMP-00005", "Sunil Rathore", "1045", "Manna Polymers", "Stores - MP", "Storekeeper", ago(15), null],
	["HR-EMP-00006", "Anita Das", "1046", "Manna Rubber", "", "Trainee", ago(9), 300000],
	["HR-EMP-00007", "Vikram Iyer", "1047", "Manna Logistics", "Transport - ML", "Driver", ago(210), 380000],
	["HR-EMP-00008", "Meera Pillai", "1048", "Manna Rubber", "Production - MR", "Machine Operator", ago(150), 590000],
].map(([name, employee_name, employee_number, company, department, designation, date_of_joining, ctc]) => ({
	name, employee_name, employee_number, company, department, designation, date_of_joining, ctc,
	status: "Active", attendance_device_id: employee_number, reports_to: "", default_shift: "General",
	cell_number: "9000000000", prefered_email: "", company_email: "", personal_email: "",
	salutation: "", grade: "", branch: "", employment_type: "Full-time", holiday_list: "Manna 2026",
}));
/* One who has left. Every count on the dashboard is of the active list, and a
   fixture with nobody gone never renders the difference between the two. */
EMPLOYEES.push({
	...EMPLOYEES[0], name: "HR-EMP-00009", employee_name: "Deepak Shetty",
	employee_number: "1049", status: "Left", ctc: 400000, date_of_joining: ago(900),
});

const CHECKINS = [
	["ci1", "HR-EMP-00001", `${today} 08:41:00`, "IN"],
	["ci2", "HR-EMP-00001", `${today} 17:12:00`, "OUT"],
	["ci3", "HR-EMP-00002", `${today} 08:52:00`, "IN"],
	["ci4", "HR-EMP-00003", `${today} 09:07:00`, "IN"],
	["ci5", "HR-EMP-00007", `${today} 07:58:00`, "IN"],
	["ci6", "HR-EMP-00007", `${today} 16:40:00`, "OUT"],
	["ci7", "HR-EMP-00008", `${today} 09:31:00`, "IN"],
].map(([name, employee, time, log_type]) => ({ name, employee, time, log_type }));

const LEAVE = [
	{
		name: "HR-LAP-0001", employee: "HR-EMP-00004", employee_name: "Priya Nair",
		company: "Manna Polymers", leave_type: "Casual Leave", from_date: today, to_date: today,
		total_leave_days: 1, status: "Open", posting_date: ago(1), creation: `${ago(1)} 11:02:00`,
		description: "Family function", leave_approver: "", leave_approver_name: "",
		half_day: 0, half_day_date: "", leave_balance: 9,
		owner: "hr@mannarubber.com", modified: `${ago(1)} 11:02:00`, modified_by: "hr@mannarubber.com",
	},
	{
		name: "HR-LAP-0002", employee: "HR-EMP-00006", employee_name: "Anita Das",
		company: "Manna Rubber", leave_type: "Sick Leave", from_date: today, to_date: ago(-2),
		total_leave_days: 3, status: "Open", posting_date: ago(2), creation: `${ago(2)} 09:20:00`,
		description: "Fever", leave_approver: "", leave_approver_name: "",
		half_day: 0, half_day_date: "", leave_balance: 4,
		owner: "hr@mannarubber.com", modified: `${ago(2)} 09:20:00`, modified_by: "hr@mannarubber.com",
	},
];

const REGS = [
	{
		name: "AR-0001", employee: "HR-EMP-00008", employee_name: "Meera Pillai",
		company: "Manna Rubber", attendance_date: ago(3), status: "Pending Approval",
		reason: "Punch not recorded on the gate machine", correction_for: "Missing IN",
		requested_in: `${ago(3)} 09:05:00`, requested_out: `${ago(3)} 18:10:00`,
		approver_type: "Reporting Manager", decided_by: "", decided_on: "", decision_note: "",
		creation: `${ago(2)} 10:15:00`, owner: "supervisor@mannarubber.com",
		modified: `${ago(2)} 10:15:00`, modified_by: "supervisor@mannarubber.com",
	},
];

const LETTERS = [
	{
		name: "EL-0001", employee: "HR-EMP-00003", employee_name: "Joseph Ekka",
		letter_type: "Appointment Letter", letter_date: ago(55), letter_number: "MR/APP/0031",
		reference_number: "", remarks: "", creation: `${ago(55)} 10:00:00`,
	},
];

/** What each doctype answers with. Anything absent answers an empty list, which
    is a real state on this site and the one most screens open in. */
const DATA = {
	Employee: EMPLOYEES,
	"Employee Checkin": CHECKINS,
	Company: [
		{ name: "Manna Rubber", abbr: "MR", default_holiday_list: "Manna 2026" },
		{ name: "Manna Polymers", abbr: "MP", default_holiday_list: "Manna 2026" },
		{ name: "Manna Logistics", abbr: "ML", default_holiday_list: "" },
	],
	"Shift Type": [{ name: "General" }, { name: "Night" }],
	"Holiday List": [{ name: "Manna 2026" }],
	"Leave Type": [{ name: "Casual Leave" }, { name: "Sick Leave" }, { name: "Earned Leave" }],
	Attendance: [],
	Department: [
		{ name: "Production - MR", disabled: 0 }, { name: "Quality - MR", disabled: 0 },
		{ name: "Accounts - MP", disabled: 0 }, { name: "Stores - MP", disabled: 0 },
		{ name: "Transport - ML", disabled: 0 },
	],
	Designation: [
		{ name: "Machine Operator" }, { name: "Shift Supervisor" }, { name: "Inspector" },
		{ name: "Accountant" }, { name: "Storekeeper" }, { name: "Driver" }, { name: "Trainee" },
	],
	"Leave Application": LEAVE,
	"Employee Attendance Regularization": REGS,
	"Letter Type": [
		{ name: "Appointment Letter", category: "Onboarding", is_active: 1, fields_used: "" },
		{ name: "Experience Letter", category: "Exit", is_active: 1, fields_used: "" },
	],
	"Employee Letter": LETTERS,
	"Employee Onboarding": [
		{ name: "ONB-0001", employee_name: "Karthik Rao", boarding_status: "In Process",
			date_of_joining: ago(-14), company: "Manna Rubber", department: "Production - MR",
			designation: "Machine Operator", employee: "", docstatus: 1, owner: "hr@manna",
			creation: `${ago(6)} 12:00:00`, modified: `${ago(1)} 09:00:00`, modified_by: "hr@manna" },
		{ name: "ONB-0002", employee_name: "Sneha Kulkarni", boarding_status: "Pending",
			date_of_joining: ago(-30), company: "Manna Polymers", department: "Accounts - MP",
			designation: "Accountant", employee: "", docstatus: 1, owner: "hr@manna",
			creation: `${ago(3)} 15:30:00`, modified: `${ago(3)} 15:30:00`, modified_by: "hr@manna" },
		{ name: "ONB-0003", employee_name: "Joseph Ekka", boarding_status: "Completed",
			date_of_joining: ago(60), company: "Manna Rubber", department: "Quality - MR",
			designation: "Inspector", employee: "HR-EMP-00003", docstatus: 1, owner: "hr@manna",
			creation: `${ago(70)} 10:00:00`, modified: `${ago(60)} 10:00:00`, modified_by: "hr@manna" },
	],
};

/** The doctype out of `/api/resource/Employee%20Checkin?…`. */
const doctypeOf = (url) => {
	const m = /\/api\/resource\/([^/?]+)/.exec(url);
	return m ? decodeURIComponent(m[1]) : "";
};

/** Frappe refuses the *whole* read when asked for a field it has not got — 417,
    not a shorter row — and `api/load.js` has eight fallbacks that depend on it.
    Answering every field list with everything would leave all eight untested
    here, so this stub honours the contract: a field the fixture has never heard
    of is a refusal. */
function answer(url) {
	const dt = doctypeOf(url);
	const rows = DATA[dt] || [];
	const q = new URL(url).searchParams;
	let fields = [];
	try { fields = JSON.parse(q.get("fields") || "[]"); } catch { fields = []; }
	const known = new Set(rows.length ? Object.keys(rows[0]) : fields);
	const missing = fields.filter((f) => f !== "*" && !known.has(f));
	if (rows.length && missing.length) {
		return { status: 417, body: { exception: `Unknown column(s): ${missing.join(", ")}` } };
	}
	/* Filters are honoured only where a screen depends on them. `status = Open`
	   on Leave Application is the one the dashboard's counts read. */
	let out = rows;
	try {
		for (const [f, op, v] of JSON.parse(q.get("filters") || "[]")) {
			if (op === "=") out = out.filter((r) => r[f] === v);
			if (op === ">=") out = out.filter((r) => String(r[f] || "") >= v);
		}
	} catch { /* an unparsable filter is the caller's bug, not this stub's */ }
	const start = Number(q.get("limit_start") || 0);
	const len = Number(q.get("limit_page_length") || 100);
	return { status: 200, body: { data: out.slice(start, start + len) } };
}

/* ------------------------------------------------------------------- shots */

/** Every module, at the page worth photographing. `overview` is left off the
    path — see routes/paths.js. */
const PAGES = [
	["dashboard", "/dashboard", "the ten widgets"],
	["employees", "/employees", "Employee Master"],
	["employee-profile", "/employees/profile", "one person's record"],
	["attendance", "/attendance", "the correction queue"],
	["attendance-inout", "/attendance/inout", "In / Out activity"],
	["leave", "/leave", "Apply Leave"],
	["payroll", "/payroll", "Salary Process"],
	["onboard", "/onboard", "Create Letter"],
	["approvals", "/dashboard/approvals", "the approval queues"],
	["settings", "/settings", "what the site is set up for"],
];

/** Three real devices rather than three round numbers: a desk monitor, a
    tablet in portrait, and a phone. The middle one is where the rail becomes an
    overlay and the bottom one is where it becomes a bar, so between them every
    branch of the responsive block is photographed. */
const SIZES = [
	["desktop", 1440, 900],
	["tablet", 820, 1180],
	["phone", 390, 844],
];

/** What `--brand` has to resolve to.

    **This is the check that would have caught a week-long bug.** `:root` and an
    attribute selector have the same specificity, so a block declared in the
    wrong order silently wins — the app ran for a week with the intended palette
    on the root, the picker ticking it, and every button painted the palette
    declared underneath. Nothing in `npm test` can see it (jsdom has no cascade)
    and nothing in `npm run contrast` can either (it reads the file, not the
    resolved value). A browser can, in one line, and it stays worth doing with
    one block: a stray `--brand` in `index.css` would win the same way.

    Read off themes.css by hand, deliberately: a checker that computed the
    expected value the same way the page does would agree with the page about
    anything. */
const BRAND = "251 146 60";

const mkdir = (d) => fs.mkdirSync(d, { recursive: true });

async function main() {
	mkdir(OUT);
	const browser = await chromium.launch({ channel: "chrome" });
	const failures = [];

	for (const [device, width, height] of SIZES) {
		const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });

		/* **`/api/method/` and `/api/resource/`, never `**\/api/**`.** The app's own
		   source lives at `/src/api/client.js`, which a glob that loose matches —
		   so every request for the module that talks to the site was answered
		   with JSON, and the page came back blank with one MIME-type complaint in
		   the console. Two specific routes rather than one broad one. */
		const site = async (route) => {
			const url = route.request().url();
			if (url.includes("frappe.auth.get_logged_user")) {
				return route.fulfill({ status: 200, contentType: "application/json",
					body: JSON.stringify({ message: "hr@mannarubber.com" }) });
			}
			if (url.includes("/api/resource/")) {
				const a = answer(url);
				return route.fulfill({ status: a.status, contentType: "application/json",
					body: JSON.stringify(a.body) });
			}
			return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
		};
		await ctx.route("**/api/method/**", site);
		await ctx.route("**/api/resource/**", site);
		/* The desk bootinfo, which is where the CSRF token comes from on this
		   site. Nothing here writes, so an empty page is enough.

		   **A predicate, not a glob.** `**\/app**` also matches
		   `/src/store/appSlice.js`, which the dev server serves as a module — and
		   answering that with `<html></html>` blanks the whole app with one
		   MIME-type line in the console. The same trap as the `/api/` glob above,
		   one file along. */
		await ctx.route(
			(url) => url.pathname === "/app" || url.pathname.startsWith("/app/"),
			(route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }),
		);

		const page = await ctx.newPage();
		const oops = [];
		page.on("pageerror", (e) => oops.push(String(e)));

		for (const [slug, route, what] of PAGES) {
			/* `domcontentloaded`, never `networkidle`. Vite's dev server holds an
			   HMR socket open and pings it, so a network-idle wait against a dev
			   build can sit there until the timeout on every single page. What
			   this is actually waiting for is the shell, and that is what it
			   waits for. */
			await page.goto(APP + route, { waitUntil: "domcontentloaded" });
			await page.waitForSelector(".shell", { timeout: 20000 }).catch(() => {});
			/* The page strip and the first panel, so a shot is never of a
			   half-drawn screen. */
			await page.waitForTimeout(350);
			const file = `${OUT}/${device}-${slug}.png`;
			await page.screenshot({ path: file, fullPage: device === "desktop" });
			process.stdout.write(`  ${file}  — ${what}\n`);

			/* A page that threw is a page whose screenshot is a lie: the
			   boundary draws a card saying something went wrong, which
			   photographs as a tidy little panel. */
			if (oops.length) {
				failures.push(`${device}${route}: ${oops.join(" | ")}`);
				oops.length = 0;
			}
			/* The whole page scrolling sideways is the one layout failure that
			   is invisible in a screenshot — the shot is cropped to the
			   viewport, so the overflow is off the edge of the picture. */
			const wide = await page.evaluate(() =>
				document.documentElement.scrollWidth - document.documentElement.clientWidth);
			if (wide > 1) failures.push(`${device}${route}: page scrolls sideways by ${wide}px`);

			/* Which block actually painted — see BRAND above. Checked once per
			   page rather than once per run, because the thing that breaks it is
			   a rule added to one screen. */
			const brand = await page.evaluate(() =>
				getComputedStyle(document.documentElement).getPropertyValue("--brand").trim());
			if (brand !== BRAND) {
				failures.push(
					`${device}${route}: --brand resolved to ${brand}, not ${BRAND}`
					+ " — something is overriding :root",
				);
			}
		}
		await ctx.close();
	}

	await browser.close();
	console.log(`\nscreenshots: ${OUT}`);
	if (failures.length) {
		console.log(`\n${failures.length} problem(s):`);
		for (const f of failures) console.log("  ✗ " + f);
		process.exit(1);
	}
	console.log("no page threw, and nothing scrolls sideways.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
