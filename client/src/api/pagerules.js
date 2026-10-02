/* Settings → Security's rules: which pages everybody is shown, as the site
   holds them in `Manna HR Settings.page_visibility`. See data/sections.js for
   what a rule is and what it may not touch.

   **Read at every sign-in, and a failed read is the code's defaults.** A login
   the site does not let read Manna HR Settings is drawn the menu this build
   ships with rather than none — a menu is not a permission, so showing a page
   somebody hid costs a tab, and hiding everything would cost the app. */

import { apiWrite, getDoc } from "@/api/client";
import { parsePageRules, setPageRules } from "@/data/sections";
import { parseFieldAccess } from "@/lib/fieldaccess";
import { set } from "@/store";

const DT = "Manna HR Settings";
const FIELD = "page_visibility";
/* Security's second half, Employee fields — lib/fieldaccess.js. Read in the
   same request: both are on the one Single and both are wanted at sign-in. */
const ACCESS = "employee_field_access";

/** What the Security page says when the site has no field to keep a rule in. */
const noField = (f) => `The site's Manna HR Settings has no ${f} field yet, so a change `
	+ "here would be dropped without a word. Add it first: python tools/add_missing_fields.py "
	+ "\"Manna HR Settings\" --apply";
export const NO_FIELD = noField(FIELD);
export const NO_ACCESS_FIELD = noField(ACCESS);

function apply(rules, state) {
	setPageRules(rules);
	set({ pageRules: rules, pageRulesState: state });
	return state;
}

/* A Single answers every field it has, set or not — so a missing key is a
   field the site does not have, and the one case where Save must not be
   offered as if it would work. */
const stateOf = (doc, field) => (!doc ? "unread" : field in doc ? "ok" : "nofield");

function applyAccess(rules, state) {
	set({ fieldAccess: rules, fieldAccessState: state });
	return state;
}

/** Read both sets of rules and put them in force.
    @returns {Promise<{pages: string, fields: string}>} each "ok", "nofield" or "unread" */
export async function loadPageRules() {
	set({ pageRulesState: "loading", fieldAccessState: "loading" });
	const doc = await getDoc(DT, DT);
	const pages = stateOf(doc, FIELD);
	const fields = stateOf(doc, ACCESS);
	apply(pages === "ok" ? parsePageRules(doc[FIELD]) : {}, pages);
	applyAccess(fields === "ok" ? parseFieldAccess(doc[ACCESS]) : {}, fields);
	return { pages, fields };
}

/** Forget them, for the sign-out: the next person is drawn the defaults until
    their own read answers. */
export const clearPageRules = () => { apply({}, ""); applyAccess({}, ""); };

/** Save the rules, then read them back — Frappe drops a field it does not have
    and still answers 200, so the read is what says whether anything was kept.
    @returns {Promise<{ok: boolean, error?: string}>} */
export async function savePageRules(rules) {
	const clean = parsePageRules(rules);
	const r = await apiWrite(DT, DT, { [FIELD]: JSON.stringify(clean) });
	return afterWrite(r, "pages", NO_FIELD);
}

/** Save the Employee field rules, the same way. */
export async function saveFieldAccess(rules) {
	const clean = parseFieldAccess(rules);
	const r = await apiWrite(DT, DT, { [ACCESS]: JSON.stringify(clean) });
	return afterWrite(r, "fields", NO_ACCESS_FIELD);
}

async function afterWrite(r, which, missing) {
	if (!r.ok) return { ok: false, error: r.error || "The site refused the change." };
	const state = (await loadPageRules())[which];
	if (state === "nofield") return { ok: false, error: missing };
	if (state !== "ok") return { ok: false, error: "Saved, but the site would not let this login read it back." };
	return { ok: true };
}
