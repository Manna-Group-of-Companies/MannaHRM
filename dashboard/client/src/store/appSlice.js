import { createSlice } from "@reduxjs/toolkit";
import { initialState } from "./initialState";

/* ---------------------------------------------------------------------------
   The one slice, and every screen reads it.

   The page this replaced held a single mutable `S` and rebuilt the whole body
   on every keystroke — which is why so much of that file was state that looks
   like it belongs in the DOM: a filter, a search box, which value list is open.
   It is kept in the store here for the same reason it was kept in `S` there: a
   filtered list that quietly unfilters when you switch tabs and back is how
   somebody concludes a person is missing.

   **One slice rather than twenty.** The obvious Redux Toolkit shape for a store
   this size is a slice per feature, and it is the wrong one here: fifty-three
   files read this object flat, off a single `useApp()`, and the reason they can
   is that the selected count, the checkboxes and the "N of M shown" line all
   come out of one snapshot and therefore cannot disagree. Splitting it would
   buy nothing but a rename of every read.

   **Every reducer returns a new object rather than mutating the draft.** Redux
   Toolkit allows either, and returning is deliberate: it is exactly what the
   old `set` did, so the migration changed no semantics, and it means Immer
   never drafts the state — which matters because `appsel` is a `Set` and the
   employee list is a few hundred rows re-read on every keystroke.
   --------------------------------------------------------------------------- */

const appSlice = createSlice({
	name: "app",
	initialState,
	reducers: {
		/** Shallow-merge a patch. Anything nested is replaced, never merged, so a
		    caller has to say what it means: `set({cal: {...s.cal, month}})`. */
		set: (state, action) => ({ ...state, ...action.payload }),

		/** Patch one of the nested form objects without spelling out the spread.
		    `{ key, part }` rather than two arguments, because an action carries
		    one payload. */
		patchKey: (state, action) => {
			const { key, part } = action.payload;
			return { ...state, [key]: { ...state[key], ...part } };
		},

		/** Put the whole store back to how it opened. Nothing in the app calls
		    this yet; it is here so a test can, without reaching into module
		    state the way the hand-rolled store made it reach. */
		reset: () => initialState,
	},
});

export const { set: setAction, patchKey, reset } = appSlice.actions;
export default appSlice.reducer;
