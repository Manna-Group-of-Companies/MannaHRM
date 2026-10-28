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
import { getState, set } from "@/store";
import { salaryLocked } from "@/data/menus";

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

/* The rules are the four company logins' menu alone (asked for 28 October
   2026): every other login is drawn what this build ships with. The store
   still carries them for the Security page, which edits them. */
function apply(rules, state) {
	setPageRules(salaryLocked(getState().user) ? rules : {});
	set({ pageRules: rules, pageRulesState: state });
	return state;
}

/* Frappe 16 leaves a Single's empty fields out of its answer, so a missing key
   is a rule nobody has saved yet, not a missing field. Whether the field
   exists is told by the write instead: see afterWrite. */
const stateOf = (doc) => (doc ? "ok" : "unread");

function applyAccess(rules, state) {
	set({ fieldAccess: rules, fieldAccessState: state });
	return state;
}

/** Read both sets of rules and put them in force.
    @returns {Promise<{pages: string, fields: string}>} each "ok", "nofield" or "unread" */
export async function loadPageRules() {
	set({ pageRulesState: "loading", fieldAccessState: "loading" });
	const doc = await getDoc(DT, DT);
	const state = stateOf(doc);
	apply(state === "ok" ? parsePageRules(doc[FIELD]) : {}, state);
	applyAccess(state === "ok" ? parseFieldAccess(doc[ACCESS]) : {}, state);
	return { pages: state, fields: state, doc };
}

/** Forget them, for the sign-out: the next person is drawn the defaults until
    their own read answers. */
export const clearPageRules = () => { apply({}, ""); applyAccess({}, ""); };

/** Save the rules, then read them back — Frappe drops a field it does not have
    and still answers 200, so the read is what says whether anything was kept.
    @returns {Promise<{ok: boolean, error?: string}>} */
export async function savePageRules(rules) {
	const clean = parsePageRules(rules);
	const value = JSON.stringify(clean);
	const r = await apiWrite(DT, DT, { [FIELD]: value });
	return afterWrite(r, FIELD, value, NO_FIELD);
}

/** Save the Employee field rules, the same way. */
export async function saveFieldAccess(rules) {
	const clean = parseFieldAccess(rules);
	const value = JSON.stringify(clean);
	const r = await apiWrite(DT, DT, { [ACCESS]: value });
	return afterWrite(r, ACCESS, value, NO_ACCESS_FIELD);
}

/* Frappe drops a field it does not have and still answers 200, so what was
   kept is read back: a non-empty value that comes back absent was dropped. */
async function afterWrite(r, field, value, missing) {
	if (!r.ok) return { ok: false, error: r.error || "The site refused the change." };
	const { pages, doc } = await loadPageRules();
	if (pages !== "ok") return { ok: false, error: "Saved, but the site would not let this login read it back." };
	const kept = doc[field] ?? "";
	if (kept !== value && !(kept === "" && /^(\{\}|\[\])$/.test(value))) return { ok: false, error: missing };
	return { ok: true };
}
