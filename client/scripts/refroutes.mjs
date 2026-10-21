/* ---------------------------------------------------------------------------
   Every view of the HRDashboard reference, as `refshots.mjs` visits them.

   Read off the reference's router (`R.<view>` in
   docs/design/hrdashboard-reference.html) on 21 October 2026. A route is the
   hash without `#/`; a param that is a record id names one of the reference's
   own seeded records — EMP001 is the signed-in person, J6 the job with nobody
   in it, F5 the empty folder — because those are the ones that draw the
   states worth comparing.

   Kept apart from the script so that the comparison against our pages, later,
   walks the same list rather than a second copy of it.
   --------------------------------------------------------------------------- */

/* Signed out only: with a session the reference sends these to the dashboard. */
export const AUTH_ROUTES = ["signin", "signup", "forgot", "otp", "newpass", "resetok"];

const EMP_TABS = ["general", "job", "payroll", "documents", "setting"];
const APPLICANT_TABS = ["profile", "evaluation", "email", "activity"];

/* Checklist ids are minted at seed time with Date.now and Math.random, so they
   are read out of the reference's storage after sign-in rather than written
   here (`S` is its saved state) — and the picture is named for whose list it
   is, so it keeps one name from run to run. */
const listFor = (emp, kind) => ({
	name: `checklist-${emp}-${kind.toLowerCase()}`,
	resolve: (S) => {
		const l = (S.lists || []).find((x) => x.emp === emp && x.kind === kind);
		return l ? `checklist/${l.id}` : null;
	},
});

export const APP_ROUTES = [
	"dashboard",
	/* Employees */
	"employees",
	...EMP_TABS.map((t) => `emp/EMP001/${t}`),
	"emp/EMP021/general",
	"directory",
	"orgchart",
	/* Checklist */
	"todo",
	"todo/T2",
	"onboarding",
	listFor("EMP021", "Onboarding"),
	"offboarding",
	listFor("EMP010", "Offboarding"),
	"checklist-settings",
	"template/TP1",
	/* Time off */
	"timeoff-me",
	"timeoff-team",
	"timeoff-emp",
	"timeoff-settings/holidays",
	"timeoff-settings/types",
	/* Attendance */
	"att-me",
	"att-team",
	"att-emp",
	"att-settings/general",
	"att-settings/location",
	"att-settings/qr",
	/* Payroll */
	"payroll",
	"payslip/EMP001",
	"payroll-settings/general",
	"payroll-settings/cycle",
	/* Performance */
	"performance",
	/* Recruitment */
	"jobs",
	"job/J1/pipeline",
	"job/J1/table",
	"job/J1/activity",
	"job/J6/pipeline",
	"job/J6/table",
	"job-new",
	"candidates",
	...APPLICANT_TABS.map((t) => `applicant/C1/${t}`),
	"recruit-settings/workflow",
	"recruit-settings/tags",
	"recruit-settings/email",
	/* Documents */
	"documents",
	"folder/F1",
	"folder/F5",
	/* News */
	"news",
	"news/N1",
	"news/N1/edit",
	"news-new",
	/* Reports */
	"reports",
	...["headcount", "onboarding", "offboarding", "balance", "pipeline", "data", "schedule", "turnover"].map((r) => `report/${r}`),
	/* Settings */
	...["company", "office", "department", "titles", "schedules"].map((s) => `settings/${s}`),
	"settings/permission/admins",
	"settings/permission/roles",
	"settings/integration",
	"settings/subscription/overview",
	"settings/subscription/history",
	"settings/subscription/plans",
	"settings/password",
	"settings/notifications",
	/* The rest */
	"notifications",
	"messages",
	"messages/TH0",
	"help",
	"help/faq",
	"help/privacy",
	"help/shortcuts",
	"help/contact",
	"no-such-page",
	/* Onboarding: in the auth layout, but reachable signed in. */
	"ob/1",
	"ob/2",
	"ob/3",
	"ob/4",
];

const click = (sel) => (page) => page.locator(sel).first().click();
const esc = (page) => page.keyboard.press("Escape");

/* States that are not an address: a popup, a drawer, a modal, a view switch.
   `only` keeps one to the width it exists at. They run after every route, so
   the ones that write to the reference's state (a clock-in, a published job)
   cannot leak into a route's picture. */
export const STATES = [
	{ name: "home-v2", route: "dashboard", open: click('[data-act="homeV"][data-v="2"]'), close: click('[data-act="homeV"][data-v="1"]') },
	{ name: "notif-pop", route: "dashboard", open: click('[data-act="notifPop"]'), close: esc },
	{ name: "msg-pop", route: "dashboard", open: click('[data-act="msgPop"]'), close: esc },
	{ name: "account-menu", route: "dashboard", open: click('#meMenu .me[data-act="menu"]'), close: esc },
	{ name: "search", route: "dashboard", open: async (p) => { await p.locator("#gsearch").fill("pa"); }, close: esc },
	{ name: "search-empty", route: "dashboard", open: async (p) => { await p.locator("#gsearch").fill("zzzz"); }, close: esc },
	{ name: "side-drawer", route: "dashboard", only: "390", open: click('.menu-btn[data-act="openSide"]'), close: esc },
	{ name: "slim-rail", route: "dashboard", only: "1440", open: click('.collapse-btn[data-act="collapse"]'), close: click('.collapse-btn[data-act="collapse"]') },
	{ name: "emp-filter", route: "employees", open: click('[data-act="empFilter"]'), close: esc },
	{ name: "emp-row-menu", route: "employees", open: click('#view table .icon-btn[data-act="menu"]'), close: esc },
	{ name: "new-employee", route: "employees", open: click('[data-act="newEmp"]'), close: esc },
	{ name: "form-errors", route: "employees", open: async (p) => {
		await p.locator('[data-act="newEmp"]').first().click();
		await p.locator('#ov form button[type="submit"], #ov form .btn-ink').last().click();
	}, close: esc },
	{ name: "csv-export", route: "employees", open: click('[data-act="exportCsv"]'), close: esc },
	{ name: "emp-upload", route: "emp/EMP001/documents", open: click('[data-act="empUpload"]'), close: esc },
	{ name: "org-collapsed", route: "orgchart", open: click('[data-act="orgAll"]') },
	{ name: "leave-request", route: "timeoff-me", open: click('[data-act="newLeaveSelf"]'), close: esc },
	{ name: "leave-detail", route: "timeoff-me", open: click('tr[data-act="leaveDetail"]'), close: esc },
	{ name: "timeoff-calendar", route: "timeoff-team", open: click('[data-act="toView"][data-v="cal"]'), close: click('[data-act="toView"][data-v="list"]') },
	{ name: "edit-paid-time", route: "att-me", open: click('[data-act="editPaid"]'), close: esc },
	{ name: "review-drawer", route: "performance", open: click('tr[data-act="openReview"]'), close: esc },
	{ name: "new-folder", route: "documents", open: click('[data-act="newFolder"]'), close: esc },
	{ name: "share-folder", route: "folder/F1", open: click('[data-act="shareFolder"]'), close: esc },
	{ name: "folder-upload", route: "folder/F1", open: click('[data-act="upFiles"]'), close: esc },
	{ name: "add-candidate", route: "candidates", open: click('[data-act="newCand"]'), close: esc },
	{ name: "bulk-cv", route: "candidates", open: click('[data-act="bulkCv"]'), close: esc },
	{ name: "report-data-gender", route: "report/data", open: click('[data-rd="gender"]') },
	{ name: "report-data-birthday", route: "report/data", open: click('[data-rd="birthday"]') },
	{ name: "integration-connect", route: "settings/integration", open: click('[data-act="intOn"]'), close: esc },
	{ name: "plan-payment", route: "settings/subscription/plans", open: async (p) => {
		await p.locator('[data-act="pickPlan"][data-p="Enterprise"]').first().click();
		await p.locator('[data-act="toPay"]').first().click();
	}, close: esc },
	{ name: "sign-out-confirm", route: "dashboard", open: async (p) => {
		await p.locator('#meMenu .me[data-act="menu"]').first().click();
		await p.locator('[data-act="signOut"]').first().click();
	}, close: esc },
	/* These two write to the reference's state, so they come last. */
	{ name: "job-new-step2", route: "job-new", open: async (p) => {
		await p.locator('form[data-form="nj1"] input[name="title"]').fill("Plant Supervisor");
		await p.locator('form[data-form="nj1"] button[type="submit"], form[data-form="nj1"] .btn-ink').last().click();
	} },
	/* The stepper keeps its step in memory, so after step 2's picture the page
	   reopens on step 2 and there is no title to fill. */
	{ name: "job-new-step3", route: "job-new", open: async (p) => {
		const title = p.locator('form[data-form="nj1"] input[name="title"]');
		if (await title.count()) {
			await title.fill("Plant Supervisor");
			await p.locator('form[data-form="nj1"] button[type="submit"], form[data-form="nj1"] .btn-ink').last().click();
		}
		await p.locator('[data-act="njPublish"][data-st="Open"]').first().click();
	} },
	{ name: "checked-in", route: "att-me", open: click('[data-act="clockIn"]') },
	{ name: "clock-out", route: "att-me", open: click('[data-act="clockOut"]'), close: esc },
];
