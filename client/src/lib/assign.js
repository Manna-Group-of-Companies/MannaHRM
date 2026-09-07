/* ---------------------------------------------------------------------------
   Handing a thing to a person, and getting it back — the arithmetic.

   A port of `manna_hr/assets.py`, and the two have to agree. The server is the
   one that decides: this exists so the form can refuse a handover that does not
   add up *before* it is sent, with the box named, rather than bouncing back a
   sentence from the site half a second later. A rule enforced only here is a
   suggestion to anybody holding `curl` (CLAUDE.md §1) — which is why the same
   rules run in `validate` on the doctype and why both sets of tests exist.

   Pure, and importing nothing. Same bargain as `lib/roster.js`: whether more
   units can come back than went out should be arguable in a test, not by
   opening a browser and typing into a form.
   --------------------------------------------------------------------------- */

/** The states an assignment can be in, in the order the dropdown offers them.

    **The words are `manna_hr/rules.py`'s, exactly.** They are written into
    `asset_status` and read back out of it, so a word this file spells
    differently is a row the site refuses or a filter that matches nothing. The
    two `Partly` states are ours rather than Factor HR's — theirs cannot say
    that six of ten came back, having no unit counts to say it with. */
export const STATUSES = [
	"Assigned", "Partly Returned", "Returned", "Partly Lost", "Lost", "Scrapped",
	"Damaged Or Not Working",
];

/** The two a person picks, because no count can produce them.

    Everything else on that dropdown is arithmetic — how many went out, how many
    came back, how many did not. These two are judgments about the *thing*:
    a laptop that comes back with a dead screen was returned, on every count
    there is, and is still not something to hand to the next person. That is a
    sentence the numbers cannot say, which is why this is the one place the
    status is typed rather than derived. */
export const JUDGED = ["Scrapped", "Damaged Or Not Working"];

/** The ones where nothing is outstanding — what the register counts against.

    The complement of `rules.assignment_is_open`, and it has to stay that way.
    `Damaged Or Not Working` is deliberately *not* one of them: the person is
    still holding it, so it cannot be issued to anybody else and a Valid Till
    that has gone by is still overdue. Broken is not the same as back. */
export const CLOSED = ["Returned", "Lost", "Scrapped"];

/** A count, however the form spelled it. An empty box is zero, not NaN. */
const int = (v) => {
	const n = Number(String(v ?? "").trim() || 0);
	return Number.isFinite(n) ? Math.trunc(n) : 0;
};

const money = (v) => {
	const n = Number(String(v ?? "").trim() || 0);
	return Number.isFinite(n) ? n : 0;
};

/** How many units are still with the person.

    Negative is possible here and is reported by `problems` rather than clamped:
    a number that quietly cannot go below zero hides the typo that produced it. */
export function outstanding(row) {
	return int(row.assign_units) - int(row.return_unit) - int(row.lost_units);
}

/** What an assignment *is*: the counts, with at most one word of judgment.

    Their form has an Asset Status dropdown at the top, which means somebody can
    set it to Returned on a row that says nothing came back — and then the
    register disagrees with the arithmetic printed beside it. So the counts
    decide, except for the two in `JUDGED` that no count can produce. Anything
    else picked there is refused by `problems` rather than overwritten here. */
export function statusFor(row) {
	if (JUDGED.includes(row.asset_status)) return row.asset_status;
	return countedStatus(row);
}

/** What the numbers alone say, ignoring anything chosen.

    **A line-for-line port of `rules.assignment_status`**, and the order of the
    tests is the whole content of the rule: a handover can be two of these at
    once — two returned, one lost, none outstanding — and one field has to pick
    a word. Loss outranks return throughout, because a person needs to be told
    about the laptop that is gone before the two that came back.

    Separate from `statusFor` so `problems` can hold the choice and the counts
    up against each other; asking a function that honours the choice would have
    it agree with itself every time. */
export function countedStatus(row) {
	const out = int(row.assign_units);
	const back = int(row.return_unit);
	const gone = int(row.lost_units);

	if (out <= 0) return "";
	if (gone >= out) return "Lost";
	if (back + gone >= out) return gone === 0 ? "Returned" : "Partly Lost";
	if (back + gone === 0) return "Assigned";
	if (gone > 0) return "Partly Lost";
	return "Partly Returned";
}

/** Everything wrong with one handover, in the order somebody would fix it.

    Sentences rather than a bool, and every one names the box on the form.
    `[]` means it is fine. Each is a real way to lose money: more returned than
    issued is a count nobody can reconcile at audit, and a recovery amount with
    no loss behind it is a deduction from somebody's pay with no reason on it. */
export function problems(row) {
	const said = [];
	const assigned = int(row.assign_units);
	const returned = int(row.return_unit);
	const lost = int(row.lost_units);

	if (!row.employee) said.push("An assignment needs the person it went to.");
	if (!row.asset) said.push("An assignment needs the asset that went out.");
	if (!row.assign_date) said.push("An assignment needs the date it went out on.");

	if (assigned < 1) said.push("Assign Units has to be at least 1 — nothing was handed over otherwise.");
	if (returned < 0) said.push("Return Unit cannot be negative.");
	if (lost < 0) said.push("Lost Units cannot be negative.");

	if (assigned >= 1 && returned + lost > assigned) {
		said.push(`${returned} returned and ${lost} lost is more than the ${assigned} that went out.`);
	}

	/* A count with no date, and a date with no count. Both are half a fact, and
	   the half that is missing is the one a register reports on. */
	if (returned > 0 && !row.returned_on) {
		said.push(`Return Unit says ${returned} came back, so Returned On needs the date.`);
	}
	if (row.returned_on && returned <= 0) {
		said.push("Returned On has a date but Return Unit says nothing came back.");
	}
	if (lost > 0 && !row.lost_on) {
		said.push(`Lost Units says ${lost} went missing, so Lost On needs the date.`);
	}
	if (row.lost_on && lost <= 0) {
		said.push("Lost On has a date but Lost Units says nothing was lost.");
	}

	if (money(row.recovery_amount) > 0 && lost <= 0) {
		said.push("Recovery Amount is money taken off somebody's pay. It needs the loss it recovers.");
	}

	/* The dropdown, held against the arithmetic under it — the port of
	   `rules.assignment_status_problem`, down to the wording, because this is
	   the sentence the person reads and the site would say the same one a
	   moment later. Refused rather than quietly corrected: somebody who picks
	   Returned on a row where nothing came back has either mis-picked or
	   forgotten to fill Return Unit, and rewriting the box answers neither
	   question. The two judgments are exempt — see JUDGED. */
	const chosen = row.asset_status;
	const counted = countedStatus(row);
	if (chosen && !JUDGED.includes(chosen)) {
		if (!STATUSES.includes(chosen)) {
			said.push(`${chosen} is not one of the states a handover can be in.`);
		} else if (counted && chosen !== counted) {
			said.push(`Asset Status says ${chosen}, but the counts under it make it ${counted}.`);
		}
	}

	/* Dates compared as strings: the site stores every one as YYYY-MM-DD and
	   that sorts correctly as text — the same choice api/attendance.js makes. */
	const out = row.assign_date;
	if (out) {
		for (const [field, label] of [["valid_till", "Valid Till"],
			["returned_on", "Returned On"], ["lost_on", "Lost On"]]) {
			const when = row[field];
			if (when && String(when).slice(0, 10) < String(out).slice(0, 10)) {
				said.push(`${label} is before the assignment went out on ${String(out).slice(0, 10)}.`);
			}
		}
	}
	return said;
}

/** Past its Valid Till and still not back.

    The one question the new fields make answerable and `Asset Movement` never
    could. False rather than an error on a row with no Valid Till — most have
    none, and "no end agreed" is not "overdue". */
export function overdue(row, today) {
	if (!row.valid_till || CLOSED.includes(statusFor(row))) return false;
	return String(row.valid_till).slice(0, 10) < String(today).slice(0, 10);
}
