import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "@/store";
import App from "./App";
import Boundary from "@/components/Boundary";
import "@/styles/index.css";

/* There is nothing to apply before the first paint any more. The palette is
   `:root` in styles/themes.css and the app is dark, full stop — no attribute to
   write, no preference to read, and so no window in which the page is painted
   in one scheme and then flipped to another. That flip is the thing people
   notice, and the way to not have it is to not have a choice. */

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
