/* ---------------------------------------------------------------------------
   A resume against one position, out of ten (asked for 12 October 2026).

   Pure: the resume's text and the position's criteria in, a score and the
   reasons for it out. No React, no network — `lib/resumetext.js` turns a file
   into text and `api/recruitment.js` writes the answer to the site. Argued
   about in `tests/resumescore.test.js`.

   **Ten is a resume that shows everything the position asks for.** The
   position sets up to five things on its Job Opening — must-have skills,
   good-to-have skills, years of experience, a qualification and a location —
   and each is worth its share of ten (`WEIGHTS`). A part the position leaves
   blank is not scored, and the others are scaled up so the whole is still out
   of ten: a position that only lists skills is scored on skills, rather than
   capped at five because nobody typed a location.

   **It is a reading of what the resume says, and it rejects nobody.** Every
   applicant is created Open whatever they score; the number only orders the
   list HR reads. So a resume that states no experience is scored as one with
   none stated, and the breakdown says so — but a file with no text in it at
   all (a scanned image) is *not scored*, never scored zero. Nothing in it was
   judged, and a zero would put somebody at the bottom of a list for the
   format their resume was saved in.

   **Where it has to guess, it guesses in the applicant's favour**, and the
   comment at each guess says so: a good candidate buried by the arithmetic is
   the expensive mistake, and a weak one ranked too high costs HR a minute.
   --------------------------------------------------------------------------- */

export const OUT_OF = 10;

/** What each part is worth when a position sets all five. */
export const WEIGHTS = { must: 5, experience: 2, qualification: 1.5, good: 1, location: 0.5 };

export const PART_LABEL = {
	must: "Must have",
	experience: "Experience",
	qualification: "Qualification",
	good: "Good to have",
	location: "Location",
};

/** The Job Opening fields the criteria are kept in — `manna_hr/install.py`. */
export const CRITERIA_FIELDS = {
	must: "custom_must_have",
	good: "custom_good_to_have",
	experience: "custom_min_experience",
	qualification: "custom_qualification",
	location: "custom_preferred_location",
};

/** Fewer letters than this and a file is treated as unread — a scan, or a PDF
    whose text is drawn as shapes. A real resume has thousands. */
const READABLE = 40;

/* ---------------------------------------------------------------------------
   The criteria
   --------------------------------------------------------------------------- */

/** "AutoCAD, Tally / Tally Prime" → two items, the second with two spellings.
    A comma or a new line separates items; a slash or " or " separates ways
    of writing the same one. */
export function parseList(text) {
	return String(text || "")
		.split(/[\n,;]+/)
		.map((item) => item.trim())
		.filter(Boolean)
		.map((item) => ({
			label: item,
			alts: item.split(/\s*\/\s*|\s+or\s+/i).map((a) => a.trim()).filter(Boolean),
		}))
		.filter((item) => item.alts.length);
}

/** A Job Opening's criteria fields → what `scoreResume` reads. */
export function criteriaOf(opening) {
	const o = opening || {};
	const years = Number(o[CRITERIA_FIELDS.experience]);
	return {
		must: parseList(o[CRITERIA_FIELDS.must]),
		good: parseList(o[CRITERIA_FIELDS.good]),
		years: Number.isFinite(years) && years > 0 ? years : 0,
		qualification: parseList(o[CRITERIA_FIELDS.qualification]),
		location: parseList(o[CRITERIA_FIELDS.location]),
	};
}

/** Whether a position has said anything a resume can be scored against. */
export const hasCriteria = (c) => Boolean(c && (c.must.length || c.good.length || c.years
	|| c.qualification.length || c.location.length));

/* ---------------------------------------------------------------------------
   Finding a term
   --------------------------------------------------------------------------- */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The pattern one spelling of a term is found by.

    Punctuation and spaces inside a term are optional, so "B.Tech" finds
    "BTech", "B. Tech" and "B-Tech", and "MS Excel" finds "MS-Excel". `+` and
    `#` are kept, so "C++" and "C#" are not found in a bare "C".

    **A term typed in two to four capitals is an abbreviation**, matched in
    capitals only and with optional dots between its letters: "ITI" finds
    "I.T.I", and "BE" finds "B.E." without finding the word "be" in every
    sentence. Anything else is matched whatever its case. */
export function termPattern(term) {
	const tokens = String(term || "").match(/[A-Za-z0-9+#]+/g);
	if (!tokens) return null;
	const letters = tokens.join("").replace(/[^A-Za-z]/g, "");
	const abbr = letters.length >= 2 && letters.length <= 4 && letters === letters.toUpperCase()
		&& !/\d/.test(tokens.join(""));
	const body = tokens.length === 1 && abbr
		? [...tokens[0]].map(esc).join("\\.?\\s?")
		: tokens.map(esc).join("[\\s.\\-_/]*");
	return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9+#])`, abbr ? "" : "i");
}

/** The first spelling of an item the text holds, or "". */
export function findItem(text, item) {
	for (const alt of item.alts) {
		const re = termPattern(alt);
		if (re && re.test(text)) return alt;
	}
	return "";
}

/* ---------------------------------------------------------------------------
   Reading the resume
   --------------------------------------------------------------------------- */

/** One shape for text from any file: ligatures and full-width forms folded,
    every dash a hyphen, no non-breaking spaces. */
export function normalise(text) {
	return String(text || "")
		.normalize("NFKC")
		.replace(/[‐-―−]/g, "-")
		.replace(/[   ]/g, " ")
		.replace(/\r\n?/g, "\n");
}

const EXPERIENCE_HEADS = new Set([
	"experience", "work experience", "professional experience", "employment history", "work history",
	"employment", "employment details", "career history", "experience details", "relevant experience",
	"industrial experience", "job experience", "working experience", "experience summary",
	"professional background", "career summary",
]);

const OTHER_HEADS = new Set([
	"education", "educational qualification", "educational qualifications", "academic qualification",
	"academic qualifications", "academics", "academic details", "academic profile", "qualification",
	"qualifications", "education and training", "skills", "technical skills", "key skills", "skill set",
	"core competencies", "top skills", "it skills", "computer skills", "software skills", "projects",
	"academic projects", "certifications", "certificates", "licenses certifications", "languages",
	"languages known", "personal details", "personal information", "personal profile", "personal data",
	"hobbies", "interests", "achievements", "awards", "honors awards", "summary", "profile",
	"profile summary", "professional summary", "career objective", "objective", "declaration",
	"references", "training", "trainings", "contact", "contact details", "strengths", "publications",
	"extra curricular activities", "extracurricular activities", "volunteering", "internships",
]);

/** A line's heading key: lower case, letters and spaces only. */
const headKey = (line) => line.toLowerCase().replace(/&/g, " ").replace(/[^a-z ]+/g, " ")
	.replace(/\s+/g, " ").trim();

/** "experience" | "other" | "" for one line. A heading is a short line that is
    nothing but a known heading — a sentence mentioning experience is not one. */
export function headingOf(line) {
	const t = String(line || "").trim();
	if (!t || t.length > 45) return "";
	const k = headKey(t);
	if (EXPERIENCE_HEADS.has(k)) return "experience";
	if (OTHER_HEADS.has(k)) return "other";
	return "";
}

/** The lines under an experience heading, or null when the resume has none. */
export function experienceText(text) {
	const lines = normalise(text).split("\n");
	let inside = false;
	let found = false;
	const out = [];
	for (const line of lines) {
		const h = headingOf(line);
		if (h) {
			inside = h === "experience";
			found = found || inside;
			continue;
		}
		if (inside) out.push(line);
	}
	return found ? out.join("\n") : null;
}

const MON = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?"
	+ "|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE = `(?:${MON}[\\s.,'-]*\\d{4}|\\d{1,2}[/.-]\\d{4}|\\d{4})`;
const NOW = "(?:present|current|currently|now|till\\s+date|to\\s+date|date|today|ongoing|continuing)";
const RANGE = new RegExp(`(?<![A-Za-z0-9])(${DATE})\\s*(?:-|to|till|until)\\s*(${DATE}|${NOW})(?![A-Za-z0-9])`, "gi");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** One side of a range as a month count (year × 12 + month), and whether it
    named a month. A bare year opens in January and closes in December — the
    longer reading, in the applicant's favour. */
function monthOf(s, end, today) {
	const t = s.toLowerCase().trim();
	if (new RegExp(`^${NOW}$`, "i").test(t)) return { at: today, month: true };
	let m = /^(\d{1,2})[/.-](\d{4})$/.exec(t);
	if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 12 ? { at: Number(m[2]) * 12 + Number(m[1]) - 1, month: true } : null;
	m = /^([a-z]+)[\s.,'-]*(\d{4})$/.exec(t);
	if (m) return { at: Number(m[2]) * 12 + MONTHS.indexOf(m[1].slice(0, 3)), month: true };
	m = /^(\d{4})$/.exec(t);
	if (m) return { at: Number(m[1]) * 12 + (end ? 11 : 0), month: false };
	return null;
}

/** The months covered by the work dates in `text`, overlaps counted once.

    `monthsOnly` drops ranges written as bare years — "2014 - 2018" outside an
    experience section is nearly always a degree. */
export function workedMonths(text, today, monthsOnly) {
	const spans = [];
	for (const m of String(text || "").matchAll(RANGE)) {
		const a = monthOf(m[1], false, today);
		const b = monthOf(m[2], true, today);
		if (!a || !b) continue;
		if (monthsOnly && !a.month) continue;
		const from = a.at;
		/* A date after today is a typo or a notice period; it counts to today. */
		const to = Math.min(b.at, today);
		if (from / 12 < 1960 || to < from) continue;
		spans.push([from, to]);
	}
	spans.sort((x, y) => x[0] - y[0]);
	let months = 0;
	let open = null;
	for (const [from, to] of spans) {
		if (open && from <= open[1] + 1) open[1] = Math.max(open[1], to);
		else {
			if (open) months += open[1] - open[0] + 1;
			open = [from, to];
		}
	}
	if (open) months += open[1] - open[0] + 1;
	return months;
}

/** The largest number of years the resume says outright — "5+ years of
    experience", "experience of 3.5 yrs", "Total Experience: 6 Years 4 Months". */
export function statedYears(text) {
	let best = 0;
	const re = /(\d{1,2}(?:\.\d{1,2})?)\s*\+?\s*(?:years?|yrs?)\.?(?:\s*(?:and\s*)?(\d{1,2})\s*(?:months?|mos?))?/gi;
	for (const m of String(text || "").matchAll(re)) {
		const near = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
		if (!/experience|\bexp\b/i.test(near)) continue;
		const y = Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0);
		if (y > 0 && y <= 45) best = Math.max(best, y);
	}
	return best;
}

/** Years of experience, and where the number came from.

    The larger of what the dates add up to and what the resume states —
    in the applicant's favour: a resume that lists only its last two jobs and
    says "12 years of experience" is read as twelve. */
export function experienceYears(text, today) {
	const t = normalise(text);
	const section = experienceText(t);
	const months = section != null ? workedMonths(section, today, false) : workedMonths(t, today, true);
	const dated = Math.round((months / 12) * 10) / 10;
	const stated = Math.round(statedYears(t) * 10) / 10;
	if (!dated && !stated) return { years: 0, from: "" };
	return stated > dated ? { years: stated, from: "stated" } : { years: dated, from: "dates" };
}

/** Today as the month count `workedMonths` uses. */
export const monthNow = (d = new Date()) => d.getFullYear() * 12 + d.getMonth();

/* ---------------------------------------------------------------------------
   Who the resume belongs to
   --------------------------------------------------------------------------- */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

/** The first telephone number: ten to thirteen digits, preferring an Indian
    mobile (ten digits starting 6–9). A run of years — "2016 2018 2020" — is
    not a number anybody answers. */
export function findPhone(text) {
	let fallback = "";
	for (const m of String(text || "").matchAll(/\+?\d[\d\s().-]{8,18}\d/g)) {
		const raw = m[0].trim();
		const digits = raw.replace(/\D/g, "");
		if (digits.length < 10 || digits.length > 13) continue;
		const groups = raw.split(/[^\d]+/).filter(Boolean);
		if (groups.every((g) => /^(19|20)\d\d$/.test(g))) continue;
		if (/^[6-9]/.test(digits.slice(-10)) && (digits.length === 10 || /^(91|0|091)/.test(digits.slice(0, -10)))) {
			return raw;
		}
		fallback = fallback || raw;
	}
	return fallback;
}

const NOT_NAME = /\b(resume|r[eé]sum[eé]|curriculum|vitae|cv|biodata|bio data|profile|page|contact|email|e-mail|phone|mobile|address|linkedin|objective|summary|experience|skills)\b/i;

const title = (s) => s.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

const nameLike = (s) => {
	const t = s.trim().replace(/\s+/g, " ");
	if (t.length < 4 || t.length > 40 || NOT_NAME.test(t)) return "";
	const words = t.split(" ");
	if (words.length < 2 || words.length > 4) return "";
	if (!words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w))) return "";
	return t === t.toUpperCase() ? title(t) : t;
};

/** The applicant's name: a name-shaped line at the top of the resume, else the
    file's name, else the email's. HR can correct it before anything is saved. */
export function guessName(text, fileName, email) {
	for (const line of normalise(text).split("\n").slice(0, 12)) {
		if (headingOf(line)) break;
		const n = nameLike(line);
		if (n) return n;
	}
	const base = String(fileName || "").replace(/\.[^.]+$/, "")
		.replace(/[_.\-()[\]]+/g, " ")
		.replace(/\b(resume|cv|profile|updated|update|new|latest|final|copy|naukri|indeed|linkedin)\b/gi, " ")
		.replace(/\d+/g, " ");
	const fromFile = nameLike(base) || (/^[A-Za-z]{3,}$/.test(base.trim()) ? title(base.trim()) : "");
	if (fromFile) return fromFile;
	const local = String(email || "").split("@")[0].replace(/\d+/g, " ").split(/[._\-\s]+/)
		.filter((w) => w.length > 1);
	return local.length ? title(local.join(" ")) : "";
}

/** Indeed relays an applicant's mail through its own domain, and LinkedIn's
    "Save to PDF" profile has a sidebar nobody else writes. Either one settles
    where a resume came from; anything else is the source HR picked. */
export function guessSource(text, email, picked) {
	if (/@indeedemail\.com$/i.test(String(email || ""))) return "Indeed";
	const t = normalise(text);
	if (/linkedin\.com\/in\//i.test(t) && /^\s*top skills\s*$/im.test(t)) return "LinkedIn";
	return picked;
}

/** Name, email and phone, as far as the text says. */
export function readContact(text, fileName) {
	const t = normalise(text);
	const email = (EMAIL.exec(t)?.[0] || "").toLowerCase();
	return { name: guessName(t, fileName, email), email, phone: findPhone(t) };
}

/** Whether there is enough text to judge at all. */
export const readable = (text) => (String(text || "").match(/[A-Za-z]/g) || []).length >= READABLE;

/* ---------------------------------------------------------------------------
   The score
   --------------------------------------------------------------------------- */

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * One resume against one position's criteria.
 *
 * @returns {{score: number|null, why: string, parts: Array<{key: string, label: string,
 *   got: number, of: number, found: string[], missing: string[], years?: number, from?: string}>}}
 *   `score` is null, with `why` saying so, when the resume cannot be read or
 *   the position has set nothing to score against.
 */
export function scoreResume(text, criteria, today = monthNow()) {
	if (!readable(text)) return { score: null, why: "No text could be read from this file.", parts: [] };
	if (!hasCriteria(criteria)) return { score: null, why: "This position has no scoring criteria.", parts: [] };

	const t = normalise(text);
	const set = {
		must: criteria.must.length > 0,
		experience: criteria.years > 0,
		qualification: criteria.qualification.length > 0,
		good: criteria.good.length > 0,
		location: criteria.location.length > 0,
	};
	const total = Object.keys(WEIGHTS).filter((k) => set[k]).reduce((a, k) => a + WEIGHTS[k], 0);
	const worth = (k) => (WEIGHTS[k] * OUT_OF) / total;

	const parts = [];
	const items = (key, list, anyOne) => {
		const found = [];
		const missing = [];
		for (const item of list) (findItem(t, item) ? found : missing).push(item.label);
		const share = anyOne ? (found.length ? 1 : 0) : found.length / list.length;
		parts.push({ key, label: PART_LABEL[key], got: worth(key) * share, of: worth(key), found, missing });
	};

	if (set.must) items("must", criteria.must, false);
	if (set.experience) {
		const { years, from } = experienceYears(t, today);
		parts.push({
			key: "experience", label: PART_LABEL.experience,
			got: worth("experience") * Math.min(1, years / criteria.years), of: worth("experience"),
			found: [], missing: [], years, from,
		});
	}
	/* Any one qualification or place on the list is enough — they are
	   alternatives, where skills are a checklist. */
	if (set.qualification) items("qualification", criteria.qualification, true);
	if (set.good) items("good", criteria.good, false);
	if (set.location) items("location", criteria.location, true);

	const score = round1(Math.min(OUT_OF, parts.reduce((a, p) => a + p.got, 0)));
	return { score, why: "", parts: parts.map((p) => ({ ...p, got: round1(p.got), of: round1(p.of) })) };
}

/** One line per part, for the applicant's record and the page's breakdown. */
export function explain(result, criteria) {
	if (result.score == null) return result.why;
	return result.parts.map((p) => {
		if (p.key === "experience") {
			const y = p.years ? `${p.years} yrs${p.from === "stated" ? " (stated)" : ""}` : "none found";
			return `${p.label}: ${y} of ${criteria.years} — ${p.got}/${p.of}`;
		}
		const list = [...p.found.map((f) => `✓ ${f}`), ...p.missing.map((m) => `✗ ${m}`)].join(", ");
		return `${p.label}: ${list} — ${p.got}/${p.of}`;
	}).join("\n");
}

/** The site's `Rating` holds a fraction of five stars; the score is tenths of
    ten, so it goes in as itself over ten and comes back exact. An unscored
    resume has no rating rather than a rating of nought — see the top. */
export const toRating = (score) => (score == null ? null : Math.round(score * 10) / 100);
export const fromRating = (r) => (r == null || r === "" ? null : Math.round(Number(r) * 100) / 10);
