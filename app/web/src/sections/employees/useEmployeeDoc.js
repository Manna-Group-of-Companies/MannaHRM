import { useEffect } from "react";
import { api } from "@/api/client";
import { getState, set } from "@/state/store";

/* One whole Employee document, read once and kept.

   Two screens want it — Employee Profile draws it, Employee Detail keeps a
   record under its report — and both re-render on every keystroke somewhere
   else in the app. Fetching inside either would be a request per keypress, and
   two copies of that rule would be two places for it to drift. */

export function useEmployeeDoc(name) {
	useEffect(() => {
		if (!name || getState().empDoc[name]) return;
		let live = true;
		api("/api/resource/Employee/" + encodeURIComponent(name))
			.then((r) => r.data)
			/* Kept on the record rather than thrown, so the page can say which
			   person it could not read instead of blanking. */
			.catch((err) => ({ name, __err: String(err.message || err) }))
			.then((doc) => {
				if (live && doc) set({ empDoc: { ...getState().empDoc, [name]: doc } });
			});
		return () => {
			live = false;
		};
	}, [name]);
}

/** Drop the cached copy, which is what makes the refresh button read again. */
export function forgetEmployeeDoc(name) {
	const kept = { ...getState().empDoc };
	delete kept[name];
	set({ empDoc: kept });
}
