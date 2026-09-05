import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

/* ---------------------------------------------------------------------------
   Create the doctypes on the ERPNext site.

   `erpnext.ts` writes the definitions; this one installs them. It is the only
   thing in this repo that writes to the Frappe site — everything else there is
   a link a person follows — so it is off by default: a run with no `--apply`
   connects, asks the site what it already has, prints what it would create and
   changes nothing.

   ## What it will and will not create

   **It never overwrites.** Every name is checked against the site first and an
   existing doctype is skipped, not updated. That is what makes this safe to
   point at a production desk: the eighteen definitions in `standard/` are
   ERPNext's and HRMS's own, and replacing one of those with a field list
   inferred from a Mongoose schema is how a site ends up with an `Employee` that
   no longer matches the code reading it. Those are not even offered unless
   `--include-standard` is passed, and even then only the ones the site does not
   already have are created.

   **Everything it creates is a Custom DocType** (`custom: 1`), because that is
   what an API caller is allowed to create on a site that is not in developer
   mode — a frappe.cloud site is not. A custom doctype lives in the site
   database rather than in an app's files, which is the right home for a
   definition that came out of this repo anyway.

   ## The two names that need a decision

   - `Employee Onboarding` — HRMS ships a doctype under this name and it is not
     this one. If the site has it, this installs ours as `Onboarding Candidate`
     rather than touching theirs. Override with `--onboarding-name=<name>`.
   - The correction queue exists here under two names and the client tries
     `Attendance Regularization` first, falling back to
     `Employee Attendance Regularization`. Installing both splits the queue —
     with the first one empty the client writes decisions to the second. So one
     is installed. `--both-regularizations` installs the pair anyway.

   ## Usage

       # what would happen, and nothing else
       npm run erpnext:push

       # do it
       npm run erpnext:push -- --apply

   Credentials come from the environment, never from an argument — an API secret
   on a command line is an API secret in the shell history:

       ERPNEXT_URL=https://mannarubber.m.frappe.cloud   # defaults to SITE_URL
       ERPNEXT_API_KEY=...
       ERPNEXT_API_SECRET=...

   Generate the pair on the desk under **User -> API Access -> Generate Keys**,
   on a user holding System Manager. Nothing less can create a doctype.
   --------------------------------------------------------------------------- */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFS = path.resolve(HERE, "..", "..", "..", "erpnext");

/* ---------------------------------------------------------------------------
   Arguments
   --------------------------------------------------------------------------- */

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const value = (flag: string): string | undefined => {
	const hit = argv.find((a) => a.startsWith(flag + "="));
	return hit === undefined ? undefined : hit.slice(flag.length + 1);
};

const opts = {
	apply: has("--apply"),
	includeStandard: has("--include-standard"),
	bothRegularizations: has("--both-regularizations"),
	onboardingName: value("--onboarding-name"),
	/* The module every created doctype is filed under. It is created if the site
	   has not got it; if creating it fails, `Custom` is used, which every Frappe
	   site has. */
	module: value("--module") ?? "Manna HR",
};

/* ---------------------------------------------------------------------------
   The site
   --------------------------------------------------------------------------- */

const site = (process.env.ERPNEXT_URL || process.env.SITE_URL || "").replace(/\/+$/, "");
const key = process.env.ERPNEXT_API_KEY || "";
const secret = process.env.ERPNEXT_API_SECRET || "";

function requireConfig(): void {
	const missing: string[] = [];
	if (!site) missing.push("ERPNEXT_URL (or SITE_URL)");
	if (!key) missing.push("ERPNEXT_API_KEY");
	if (!secret) missing.push("ERPNEXT_API_SECRET");
	if (missing.length === 0) return;
	console.error(
		"\nCannot connect: " + missing.join(", ") + " not set.\n\n"
		+ "Put them in server/.env — the key and secret come from the desk, under\n"
		+ "User -> API Access -> Generate Keys, on a user holding System Manager.\n",
	);
	process.exit(2);
}

type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

/** One call. Frappe puts the useful half of an error in `_server_messages` (a
    JSON string of JSON strings) and the traceback in `exception`; a bare status
    code says nothing about which field it disliked, so both are unpacked. */
async function call<T = any>(method: string, endpoint: string, body?: unknown): Promise<Result<T>> {
	let res: Response;
	try {
		res = await fetch(site + endpoint, {
			method,
			headers: {
				Authorization: "token " + key + ":" + secret,
				Accept: "application/json",
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch (e) {
		return { ok: false, status: 0, message: "network: " + (e as Error).message };
	}

	const text = await res.text();
	let parsed: any = null;
	try { parsed = JSON.parse(text); } catch { /* an HTML error page, kept as text */ }

	if (res.ok) return { ok: true, data: (parsed?.data ?? parsed) as T };

	return { ok: false, status: res.status, message: frappeError(parsed, text, res.status) };
}

function frappeError(parsed: any, text: string, status: number): string {
	const msgs: string[] = [];
	if (typeof parsed?._server_messages === "string") {
		try {
			for (const m of JSON.parse(parsed._server_messages) as string[]) {
				try { msgs.push(String(JSON.parse(m).message)); } catch { msgs.push(m); }
			}
		} catch { /* not the shape it usually is */ }
	}
	if (typeof parsed?.message === "string") msgs.push(parsed.message);
	if (typeof parsed?.exception === "string") msgs.push(parsed.exception);
	if (msgs.length === 0) msgs.push(text.slice(0, 300).replace(/\s+/g, " ").trim() || "HTTP " + status);
	return [...new Set(msgs)].join(" | ").replace(/<[^>]+>/g, "");
}

/** Does the site have it? Told apart from "could not ask" on purpose: a 404 is
    an answer, a 403 is not, and creating on the back of a question that was
    never answered is how a doctype gets installed twice. */
async function exists(doctype: string, name: string): Promise<boolean | "unknown"> {
	const r = await call("GET", "/api/resource/" + encodeURIComponent(doctype) + "/" + encodeURIComponent(name));
	if (r.ok) return true;
	if (r.status === 404) return false;
	return "unknown";
}

/* ---------------------------------------------------------------------------
   The definitions on disk
   --------------------------------------------------------------------------- */

type Def = { file: string; doc: any };

function read(dir: string): Def[] {
	const full = path.join(DEFS, dir);
	if (!fs.existsSync(full)) return [];
	return fs.readdirSync(full).filter((f) => f.endsWith(".json")).sort().map((f) => ({
		file: dir + "/" + f,
		doc: JSON.parse(fs.readFileSync(path.join(full, f), "utf8")),
	}));
}

function readFields(): any[] {
	const p = path.join(DEFS, "employee_custom_fields.json");
	return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : [];
}

/* ---------------------------------------------------------------------------
   The report
   --------------------------------------------------------------------------- */

type Status = "created" | "exists" | "would create" | "skipped" | "failed";
type Row = { name: string; from: string; status: Status; note: string };
const rows: Row[] = [];
const add = (name: string, from: string, status: Status, note = ""): void => {
	rows.push({ name, from, status, note });
};

function report(): void {
	if (rows.length === 0) return;
	const width = (i: keyof Row, header: string) => Math.max(...rows.map((r) => String(r[i]).length), header.length);
	const n = width("name", "DOCTYPE"), f = width("from", "FROM"), s = width("status", "STATUS");
	console.log("");
	console.log("DOCTYPE".padEnd(n) + "  " + "FROM".padEnd(f) + "  " + "STATUS".padEnd(s) + "  NOTE");
	console.log("-".repeat(n) + "  " + "-".repeat(f) + "  " + "-".repeat(s) + "  " + "-".repeat(40));
	for (const r of rows) {
		console.log(r.name.padEnd(n) + "  " + r.from.padEnd(f) + "  " + r.status.padEnd(s) + "  " + r.note);
	}

	const count = (st: Status) => rows.filter((r) => r.status === st).length;
	console.log("");
	console.log(
		count("created") + " created, " + count("would create") + " would be created, "
		+ count("exists") + " already there, " + count("skipped") + " skipped, "
		+ count("failed") + " failed.",
	);
	if (!opts.apply && count("would create") > 0) console.log("\nNothing was written. Re-run with --apply.");
}

/* ---------------------------------------------------------------------------
   Creating
   --------------------------------------------------------------------------- */

/** Anything this creates is created as a Custom DocType, under a module the
    site has. The rest of the definition — fields, order, permissions, naming —
    goes up as `erpnext.ts` wrote it. */
function payload(doc: any, name: string, moduleName: string): any {
	return { ...doc, doctype: "DocType", name, module: moduleName, custom: 1 };
}

async function createDoctype(def: Def, name: string, moduleName: string, note: string): Promise<void> {
	const present = await exists("DocType", name);
	if (present === true) return add(name, def.file, "exists", note || "left alone");
	if (present === "unknown") {
		return add(name, def.file, "skipped", "could not read DocType — is this key a System Manager?");
	}

	if (!opts.apply) return add(name, def.file, "would create", note);

	const r = await call("POST", "/api/resource/DocType", payload(def.doc, name, moduleName));
	if (r.ok) add(name, def.file, "created", note);
	else add(name, def.file, "failed", r.message);
}

/** The module. A custom doctype has to be filed under a Module Def the site
    has, and `Manna HR` is not one until somebody makes it. If making it fails —
    an older Frappe, a key without the permission — everything lands in
    `Custom`, which is on every site, rather than the whole run failing. */
async function ensureModule(): Promise<string> {
	const wanted = opts.module;
	const present = await exists("Module Def", wanted);
	if (present === true) return wanted;

	if (!opts.apply) {
		if (present === false) console.log("Module Def \"" + wanted + "\" is not on the site; it would be created.");
		return wanted;
	}

	const r = await call("POST", "/api/resource/Module Def", {
		doctype: "Module Def", module_name: wanted, app_name: "frappe", custom: 1,
	});
	if (r.ok) {
		console.log("Module Def \"" + wanted + "\" created.");
		return wanted;
	}
	console.log("Module Def \"" + wanted + "\" could not be created (" + r.message + "); filing under \"Custom\" instead.");
	return "Custom";
}

/* ---------------------------------------------------------------------------
   Custom Fields on ERPNext's own Employee
   --------------------------------------------------------------------------- */

async function pushCustomFields(): Promise<void> {
	const fields = readFields();
	if (fields.length === 0) return;

	if (await exists("DocType", "Employee") !== true) {
		for (const f of fields) add(f.name, "employee_custom_fields.json", "skipped", "site has no Employee doctype");
		return;
	}

	for (const f of fields) {
		const name = f.name ?? f.dt + "-" + f.fieldname;
		const present = await exists("Custom Field", name);
		if (present === true) { add(name, "employee_custom_fields.json", "exists", "left alone"); continue; }
		if (present === "unknown") { add(name, "employee_custom_fields.json", "skipped", "could not read Custom Field"); continue; }
		if (!opts.apply) { add(name, "employee_custom_fields.json", "would create", ""); continue; }

		const r = await call("POST", "/api/resource/Custom Field", { ...f, doctype: "Custom Field", name });
		if (r.ok) add(name, "employee_custom_fields.json", "created", "");
		else add(name, "employee_custom_fields.json", "failed", r.message);
	}
}

/* ---------------------------------------------------------------------------
   The run
   --------------------------------------------------------------------------- */

async function main(): Promise<void> {
	requireConfig();

	const who = await call<string>("GET", "/api/method/frappe.auth.get_logged_user");
	if (!who.ok) {
		console.error("\nCould not sign in to " + site + ": " + who.message + "\n");
		process.exit(1);
	}
	console.log("\n" + site + " — connected as " + who.data);
	console.log(opts.apply ? "Writing." : "Dry run: nothing will be written.");

	const moduleName = await ensureModule();

	/* The five this repo defines outright. */
	const hrmsOnboarding = await exists("DocType", "Employee Onboarding");

	for (const def of read("custom")) {
		const name: string = def.doc.name;

		if (name === "Employee Onboarding") {
			/* Theirs is a checklist round a Job Applicant; ours carries the
			   candidate's own details. Installing over theirs would break their
			   onboarding, so where theirs is present ours goes up under its own
			   name instead. */
			const renamed = opts.onboardingName
				?? (hrmsOnboarding === true ? "Onboarding Candidate" : "Employee Onboarding");
			const note = renamed === name ? "" : "renamed — HRMS already ships \"Employee Onboarding\"";
			await createDoctype(def, renamed, moduleName, note);
			continue;
		}

		if (name === "Employee Attendance Regularization" && !opts.bothRegularizations) {
			add(name, def.file, "skipped", "one queue only — pass --both-regularizations to install this too");
			continue;
		}

		await createDoctype(def, name, moduleName, "");
	}

	/* ERPNext's and HRMS's own. Off unless asked for, and even then only the
	   ones the site has not got — which on a site with HRMS installed is none. */
	if (opts.includeStandard) {
		console.log("\n--include-standard: any of the 18 the site is missing will be created as Custom DocTypes.");
		for (const def of read("standard")) {
			await createDoctype(def, def.doc.name, moduleName, "standard/ — inferred from a Mongoose schema");
		}
	} else {
		for (const def of read("standard")) {
			add(def.doc.name, def.file, "skipped", "ERPNext's own — pass --include-standard to reconsider");
		}
	}

	await pushCustomFields();

	report();
	if (rows.some((r) => r.status === "failed")) process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
