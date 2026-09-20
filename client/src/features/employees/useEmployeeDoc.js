import { useEffect } from "react";
import { api } from "@/api/client";
import { getState, set, useStore } from "@/store";

/* One whole Employee document, read once and kept.

   Two screens want it — Employee Profile draws it, Employee Detail keeps a
   record under its report — and both re-render on every keystroke somewhere
   else in the app. Fetching inside either would be a request per keypress, and
   two copies of that rule would be two places for it to drift. */

/** Two reads, merged, because neither alone is a whole document on this site.

    `/api/resource/Employee/<name>` — the single-document GET `getDoc` uses
    everywhere else — comes back missing most flat fields on this Employee:
    `company_email`, `relieving_date`, a third of the doctype, silently, with
    no error and no pattern by field type, permission or field age. Found on
    Employee Profile in edit mode: a field the read had dropped has no key for
    `pick()` to find, so `controlFor` calls it absent and draws no box at all —
    "not set" with nothing to type into, on a record that is not, in fact,
    missing that field.

    A list read on the same name with `fields: ["*"]` gets every flat field
    back correctly, and loses every child table in exchange — `education`,
    `external_work_history` and the rest come back `null` rather than a row
    array, because a list read never eager-loads one. So this takes the child
    tables from the single-document read and everything else from the list
    read, rather than trusting either call on its own. */
async function wholeEmployee(name) {
	const path = "/api/resource/Employee";
	const [whole, rows] = await Promise.all([
		api(path + "/" + encodeURIComponent(name)).then((r) => r.data ?? null),
		api(path, { fields: JSON.stringify(["*"]), filters: JSON.stringify([["name", "=", name]]) })
			.then((r) => (r.data && r.data[0]) || null),
	]);
	if (!whole) return rows;
	if (!rows) return whole;
	const merged = { ...rows };
	for (const [k, v] of Object.entries(whole)) {
		if (Array.isArray(v)) merged[k] = v;
	}
	return merged;
}

export function useEmployeeDoc(name) {
	/* Watched as well as `name`, because `forgetEmployeeDoc` is how every caller
	   asks for a fresh copy — ↻, Save, a new photograph — and it changes nothing
	   else. Keyed on `name` alone, the effect never ran again after one, and the
	   page sat on "reading the record…" until somebody navigated away. */
	const held = useStore((s) => !!name && name in s.empDoc);
	useEffect(() => {
		if (!name || getState().empDoc[name]) return;
		let live = true;
		wholeEmployee(name)
			/* Kept on the record rather than thrown, so the page can say which
			   person it could not read instead of blanking. */
			.catch((err) => ({ name, __err: String(err.message || err) }))
			.then((doc) => {
				if (live && doc) set({ empDoc: { ...getState().empDoc, [name]: doc } });
			});
		return () => {
			live = false;
		};
	}, [name, held]);
}

/** Drop the cached copy, which is what makes the refresh button read again. */
export function forgetEmployeeDoc(name) {
	const kept = { ...getState().empDoc };
	delete kept[name];
	set({ empDoc: kept });
}
