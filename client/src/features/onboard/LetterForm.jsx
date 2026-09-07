import { useState } from "react";

import CreateLetters from "@/features/onboard/CreateLetters";
import NewLetter from "@/features/onboard/NewLetter";

/* Factor HR's On Board menu, as its flyout reads after the 3 Sep 2026 trim:

       Create Letter / Form · Document Entry · Assets Details · Assets Assignment

   This one has been photographed three times: the register behind the menu item
   on 3 Sep 2026, the Create New Letter form their blue button opens on 4 Sep,
   and the letter screen itself before either. The other three screens on the
   menu were captured the same day, so every page on this menu is now drawn from
   a capture rather than guessed at.

   The page is their two screens and nothing else. It used to open on a pair of
   panels of ours — a catalogue of the 17 letter types, and a merge box that
   rendered a chosen format against a chosen person's real record and listed
   every token ERPNext could not fill. Both are gone. What that merge could do
   and nothing here now does is preview a letter *before* it is issued; the eye
   on each register row still shows an issued one as its text was stored, and
   `mergeLetter` in lib/letter.js is still there, with no caller. */

export default function LetterForm() {
	/* Their Create Letter opens a form of its own — Create New Letter, drawn in
	   NewLetter.jsx. It replaces the register while it is up, the way theirs
	   replaces theirs, rather than opening over it in a dialog: their screen is a
	   page, and a form behind a modal cannot be linked to, printed or scrolled
	   past. Cancel puts the register back. */
	const [creating, setCreating] = useState(false);

	return (
		<>
			<div className="legend">
				<b className="font-display">Create Letter / Form</b>
				<span>
					Factor HR’s letter register and the form behind its blue button, drawn control for
					control. One letter has been issued through it in three years, against 17 maintained
					formats.
				</span>
			</div>

			{creating
				? <NewLetter onCancel={() => setCreating(false)} />
				: <CreateLetters onCreate={() => setCreating(true)} />}
		</>
	);
}
