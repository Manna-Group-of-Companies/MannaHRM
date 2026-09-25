/* The colours the attendance exports paint with — Excel and PDF both, and all
   three reports, so a green cell means present whichever file somebody opened.
   ARGB, because ExcelJS wants it; `rgbOf` turns one into what jsPDF wants. */

/** Manna orange, for a header row, and the pale band between data rows. */
export const HEAD_FILL = "FFE8651A";
export const ZEBRA_FILL = "FFFDF1E8";

/** By the muster's letters. Absent is pale on purpose: this is evidence, not a verdict. */
export const LETTER_FILL = {
	P: "FFD9F2E3", // present
	A: "FFFBE1E1", // absent
	HD: "FFFFF2CC", // half day
	L: "FFDDEBF7", // on leave
	LA: "FFEAF2FB", // leave applied, not yet approved
	WO: "FFE9E9E9", // weekly off
	H: "FFE6F0FA", // holiday
	MP: "FFFCE4D6", // one punch only — a punch is missing
};

/** The same, by the word Daily Detail's Day Status column prints. */
const STATUS_LETTER = {
	Present: "P", "Work From Home": "P", Absent: "A", "Half Day": "HD", "On Leave": "L",
	"Leave Applied": "LA", "Weekly Off": "WO", Holiday: "H", "In Only": "MP", "Out Only": "MP",
};

/** A Day Status cell's fill. The trailing " *" (from punches, not processed) does not change the colour. */
export const statusFill = (v) => LETTER_FILL[STATUS_LETTER[String(v || "").replace(/ \*$/, "")]] || null;

/** The In / Out report's: green in, orange out, and a colour per stream. */
export const PUNCH_FILL = {
	IN: "FFD9F2E3", OUT: "FFFCE4D6",
	Mobile: "FFDDEBF7", Terminal: "FFEDEDED", Correction: "FFFFF2CC", Unknown: "FFF8D7DA",
};

/** A late arrival or an early leaving. */
export const LATE_FILL = "FFFCE4D6";

export const rgbOf = (argb) =>
	argb ? [1, 3, 5].map((i) => parseInt(String(argb).slice(i + 1, i + 3), 16)) : null;
