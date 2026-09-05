import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "@/store";
import App from "./App";
import Boundary from "@/components/Boundary";
import { applyStoredTheme } from "@/lib/theme";
import "@/styles/index.css";

/* Before the first render, not in an effect. An effect runs after the browser
   has already painted, so the page would appear in whatever `:root` holds and
   then flip — and the flip is the thing people notice, not the palette. */
applyStoredTheme();

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
