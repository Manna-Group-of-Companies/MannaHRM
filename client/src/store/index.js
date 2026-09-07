import { useSelector, useStore as useReduxStore } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import appReducer, { setAction, patchKey, reset } from "./appSlice";

export { NO_APPROVALS, initialState, freshState } from "./initialState";

/* ---------------------------------------------------------------------------
   One store, and every screen reads it.

   This was a hand-rolled `useSyncExternalStore` for most of the build. It is
   Redux Toolkit now, and the whole point of the way it is wired is that the
   fifty-three files reading it did not have to change: `set`, `patch`,
   `update`, `getState` and `useApp` still mean what they meant, and still take
   what they took. The migration is this file plus a `<Provider>` in `main.jsx`.

   Why that mattered enough to do it this way: the alternative was rewriting
   ninety components to take `useDispatch`, which is ninety chances to change a
   filter's behaviour while claiming to be changing a state library.

   What Redux Toolkit actually buys here, given the API is unchanged:
     · the devtools timeline, which on a page that is one snapshot per keystroke
       is the difference between reading a bug and reproducing it;
     · `createAsyncThunk` for the reads, so "loading / loaded / failed" is one
       shape rather than three hand-written flags per screen — see thunks.js;
     · a store that can be handed to a test, rather than module state that a
       second test inherits from the first.

   `appsel` is a `Set`, which is not serialisable and never will be — it is a
   selection, rebuilt whole on every tick. So `enableMapSet` is on and the
   serialisability check is off, said out loud here rather than discovered as a
   console full of warnings.
   --------------------------------------------------------------------------- */

enableMapSet();

export const store = configureStore({
	reducer: { app: appReducer },
	middleware: (getDefault) =>
		getDefault({
			/* `appsel` is a Set and `newemp.done` / `rev.done` hold whole documents
			   as the site returned them. Neither is a bug and neither is going in a
			   URL, so the check has nothing to protect here. */
			serializableCheck: false,
			/* Every reducer above returns a fresh object, so nothing is ever
			   mutated in place — but this walks the whole employee list on every
			   dispatch, and a dispatch is a keystroke. Off in production only, the
			   way Redux Toolkit ships it. */
			immutableCheck: process.env.NODE_ENV !== "production",
		}),
	devTools: process.env.NODE_ENV !== "production",
});

/** Read the store outside React — loaders and CSV exports need it.

    Returns the slice rather than the root, so `getState().employees` is what it
    always was. Nothing outside this file should know the root has a shape. */
export const getState = () => store.getState().app;

/** Shallow-merge a patch. Anything nested is replaced, never merged, so a
    caller has to say what it means: `set({cal: {...s.cal, month}})`. */
export function set(patch) {
	store.dispatch(setAction(patch));
}

/** Patch one of the nested form objects without spelling out the spread. */
export function patch(key, part) {
	store.dispatch(patchKey({ key, part }));
}

/** For the handful of places that need the previous value to compute the next.

    Not a reducer, because the argument is a function and an action carrying a
    function is an action that cannot be replayed or logged. Read-then-dispatch
    is the same thing the old store did and is safe for the same reason: there
    is one store, on one thread, and nothing between the read and the dispatch
    can await. */
export function update(fn) {
	set(fn(getState()));
}

/** Put the whole store back to how it opened. */
export const resetStore = () => store.dispatch(reset());

/** Subscribe to one slice. The selector must return something stable by
    identity between renders, or React re-renders forever — so select values
    and arrays that already live in the store, never fresh objects. */
export function useStore(selector) {
	return useSelector((root) => selector(root.app));
}

/** The whole store. Every screen here re-reads all of it on any change, which
    is exactly what the page it replaces did on every keystroke — at this size
    it is cheap, and it is why the selected count, the checkboxes and the
    "N of M shown" line can never disagree.

    Identity-stable by construction: `root.app` is the object the reducer
    returned, not a fresh one built per render, so `useSelector`'s default
    reference check does the right thing. */
export const useApp = () => useSelector((root) => root.app);

/** The store instance, for the rare component that wants to read without
    subscribing. `useApp` is what you want almost always. */
export const useAppStore = useReduxStore;
