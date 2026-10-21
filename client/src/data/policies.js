/* ---------------------------------------------------------------------------
   The two documents behind the sign-in page's footer and Help center →
   Privacy policy, and who support goes to (D18). Kept apart from both pages so
   the sign-in page can read them without loading the Help center, which pulls
   in the router and the whole page list behind it.

   Both are drafts until HR has read them, and both pages say so.
   --------------------------------------------------------------------------- */

/** Who support goes to (D18): IT, by email. */
export const SUPPORT_EMAIL = "it@mannarubber.com";

/* The reference's own policy (D18), kept as it is except the two places it
   describes its demo, which are not true of this app. */
export const PRIVACY = [
	["What we collect", "We store the information you enter about your company and your people: names, contact details, job details, time off, attendance and pay."],
	["How we use it", "Only to run HR features for your company: showing profiles, calculating balances and pay, and sending notifications you’ve turned on."],
	["Who can see it", "People in your company, based on the roles each login has on the site. We never sell your data."],
	["Where it lives", "On the company’s own ERPNext site. This app reads and writes it there, as the person signed in."],
	["Your choices", "You can correct any record you are allowed to change. Ask HR to change one you cannot."],
	["Contact", "Questions? Reach us from Help center → Contact support."],
];

/* The reference's terms describe its demo and none of it is true here, so these
   are written from how this app works (21 October 2026): who signs in, that the
   site's roles decide, and that every change is made in the person's name. */
export const TERMS = [
	["Who may sign in", "Staff of the Manna Group companies with an account on the company’s ERPNext site. Sign in only as yourself."],
	["What you can do", "What your roles on the site allow, and nothing more. Every change is made in your name, and the site records who made it."],
	["Your password", "Keep it to yourself. If you think somebody else knows it, reset it from Forgot password, or ask IT."],
	["The records", "Attendance, leave and pay are the company’s records. Change one only when it is wrong, and through the page meant for it."],
	["Questions", `Write to IT at ${SUPPORT_EMAIL}.`],
];
