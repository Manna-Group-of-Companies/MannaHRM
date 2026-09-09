import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "@/store";
import App from "./App";
import Boundary from "@/components/Boundary";
import { applyMode, storedMode } from "@/lib/mode";
import "@/styles/index.css";

/* **Before the first paint, and this line is the whole reason it is here.**

   The palette is an attribute on `<html>` (see styles/themes.css), and if it is
   written after React mounts there is a window — short, and long enough — in
   which the page is painted dark and then flips to light. That flip is the
   thing people notice about a theme, and the way to not have it is to write the
   attribute before anything is drawn. Same argument as the note that used to be
   here, reaching the opposite conclusion now that there is a choice to make. */
applyMode(storedMode());

/* The boundary is inside the Provider and outside App, which is the only place
   it can be useful: a throw while reading the store is the failure it exists to
   catch, so it has to be under the store, and it has to be over every screen
   rather than around one. */
createRoot(document.getElementById("root")).render(
	<React.StrictMode>
		<Provider store={store}>
			<Boundary>
				<App />
			</Boundary>
		</Provider>
	</React.StrictMode>,
);
