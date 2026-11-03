/* ---------------------------------------------------------------------------
   The welcome window: shown once, the first time somebody signs in on a
   browser (HR, 29 October 2026), then never again for that login there.

   Per login, so a second person on the same gate PC is welcomed too. Never
   throws: a browser with site data blocked shows it every time rather than
   stopping the app opening.
   --------------------------------------------------------------------------- */

const key = (user) => `manna.welcome.${String(user || "").toLowerCase()}`;

/** Whether this login has been welcomed on this browser. */
export function welcomed(user) {
	try {
		return localStorage.getItem(key(user)) === "1";
	} catch {
		return false;
	}
}

/** Remember that it has. */
export function markWelcomed(user) {
	try {
		localStorage.setItem(key(user), "1");
	} catch {
		/* Shown again next time — the lesser harm. */
	}
}
