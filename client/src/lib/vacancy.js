import { LEVELS, isOfficeStaff, levelOf } from "@/lib/hierarchy";

/* ---------------------------------------------------------------------------
   Which seats on the hierarchy chart are open, and the Job Opening each one
   is recruited under (12 October 2026).

   Resumes are added from the chart itself, on the seat they are for — HR
   asked for that rather than a page of its own. A seat is open in one of
   three ways:

   - **Not assigned** — a head-office seat in HEAD_OFFICE_CHART with nobody on it.
   - **Resigning** — an Active person with a resignation letter or relieving
     date on their record. They are still on the chart, and so is a way to
     start finding their replacement before they go.
   - **Vacated** — a person who has Left within RECENT_DAYS. Their seat is
     drawn where they sat, until the opening for it is Closed, which is how
     HR says the seat is filled. Somebody who left longer ago than that is not
     drawn: a chart of everybody who ever left is not a chart.

   Each seat's opening is found by its title, which says whose seat it is
   (`seatTitle`, `replacementTitle`). hrms has no field linking an opening to
   the person it replaces, and a title HR can read on the desk is a better
   link than a hidden one. Pure.
   --------------------------------------------------------------------------- */

/** How long a seat somebody left is drawn as open, in days. */
export const RECENT_DAYS = 180;

const DAY = 86400000;
const dayOf = (d) => Date.parse(String(d || "").slice(0, 10) + "T00:00:00Z");

/** Serving notice: still Active, and the record says they are going. */
export const resigning = (e) => e?.status === "Active" && Boolean(e.resignation_letter_date || e.relieving_date);

/** Gone, recently enough that the seat is still open. A Left record with no
    relieving date cannot say when, and is not drawn. */
export function leftRecently(e, today) {
	if (e?.status !== "Left" || !e.relieving_date) return false;
	const gone = dayOf(e.relieving_date);
	return Number.isFinite(gone) && dayOf(today) - gone <= RECENT_DAYS * DAY;
}

/** The ladder level a person sat on: their grade, else their designation's. */
export const levelFor = (e) => (LEVELS.includes(e?.grade) ? e.grade : levelOf(e?.designation));

/** The opening for a head-office seat. */
export const seatTitle = (role) => `${role} (Head Office)`;

/** The opening for somebody's replacement. The code makes it one person's,
    since two people share a name and nobody shares a code. */
export const replacementTitle = (e) => `${e.designation || "Position"} — replacing ${e.employee_name || e.name}`
	+ (e.employee_number ? ` (${e.employee_number})` : "");

/** The opening a seat is recruited under: an open one first, else the latest. */
export function openingFor(openings, title, company) {
	const mine = (openings || []).filter((o) => o.job_title === title && o.company === company);
	return mine.find((o) => o.status !== "Closed") || mine[0] || null;
}

/** A seat whose opening exists and is Closed has been filled. */
export const filled = (openings, title, company) => openingFor(openings, title, company)?.status === "Closed";

/** A designation for a head-office seat, guessed from its role — "Logistics"
    finds "Logistics Manager". Only a suggestion: HR picks before anything is
    made, because hrms will not make an opening without one. */
export function guessDesignation(role, designations) {
	const names = (designations || []).map((d) => (typeof d === "string" ? d : d.name)).filter(Boolean);
	const words = String(role || "").toLowerCase().split(/[^a-z&]+/).filter((w) => w.length > 1 && w !== "head");
	if (!words.length) return "";
	const hit = (n) => words.every((w) => new RegExp(`(^|[^a-z])${w.replace(/&/g, "\\&")}([^a-z]|$)`, "i").test(n));
	return names.find((n) => hit(n) && /head|manager/i.test(n)) || names.find(hit) || "";
}

/** The seat a person leaves, as the resume panel needs it. */
export const seatOfPerson = (e) => ({
	title: replacementTitle(e),
	label: e.designation || "Position",
	company: e.company,
	designation: e.designation || "",
	department: e.department || "",
	who: e,
});

/** A head-office seat nobody is on. `left` is who last sat there, when known. */
export const seatOfRole = (role, company, designation, left) => ({
	title: seatTitle(role),
	label: role,
	company,
	designation: designation || "",
	department: left?.department || "",
	who: left || null,
});

/**
 * The seats one company's chart draws for people who have left: one per
 * person, on their level, with the same office-only rule the chart uses.
 *
 * @returns {{level: string, e: object}[]} `level` is "" for the last row.
 */
export function vacatedSeats(seps, company, today, openings, { officeOnly = false, officeGroup = () => "" } = {}) {
	return (seps || [])
		.filter((e) => e.company === company && leftRecently(e, today))
		.filter((e) => !officeOnly || isOfficeStaff(e, officeGroup))
		.filter((e) => !filled(openings, replacementTitle(e), company))
		.sort((a, b) => String(a.employee_name || "").localeCompare(String(b.employee_name || "")))
		.map((e) => ({ level: levelFor(e), e }));
}
