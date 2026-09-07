import React from "react";

/* ---------------------------------------------------------------------------
   The one thing standing between a thrown render and a page that looks broken
   in no particular way.

   React unmounts the whole tree when a render throws, and what is left is a
   blank page — or, if the throw happens on a re-render, a page still showing
   its last good paint while every click on it does nothing. Both of those are
   the same bug wearing different clothes, and neither of them says so.

   **In development Vite draws an overlay and this is redundant.** It is not
   redundant in two cases that matter: a production build, where there is no
   overlay at all; and a tab whose dev-server connection has died — after a
   restart, say — which keeps rendering old modules against a store the new ones
   have moved on from, and shows nothing when they throw.

   It is deliberately not a retry. Whatever put the app in this state is still
   in the store, so re-rendering the same tree reproduces the same throw; the
   way out is a reload, and that is the button.
   --------------------------------------------------------------------------- */

export default class Boundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = { err: null, where: "" };
	}

	static getDerivedStateFromError(err) {
		return { err };
	}

	componentDidCatch(err, info) {
		/* The component stack is the half that says *where*, and it is the half a
		   person reporting this can actually paste. Kept on state rather than only
		   in the console, because a console is not somewhere everybody looks. */
		this.setState({ where: (info && info.componentStack) || "" });
		// eslint-disable-next-line no-console
		console.error("[manna-hrm] render failed:", err, info);
	}

	render() {
		const { err, where } = this.state;
		if (!err) return this.props.children;

		return (
			<div className="bound">
				<div className="box">
					<b>This screen stopped rendering.</b>
					<p>
						Something threw while drawing the page, so React took the tree down. Nothing was
						written and nothing on the site has changed — but the page you were looking at is no
						longer live, which is why clicking it does nothing.
					</p>
					<p className="mono">{String(err && (err.message || err))}</p>
					<p>
						<b>The usual cause is a stale tab.</b> This app is one bundle and one store; if the dev
						server restarted under it, the tab keeps running the old code against a store the new
						code has moved on from. A hard reload — <b>Ctrl+Shift+R</b> — fixes that one.
					</p>
					<button className="btn tpl" onClick={() => window.location.reload()}>
						Reload the page
					</button>
					{where ? (
						<details>
							<summary>Where it threw</summary>
							<pre className="mono">{where.trim()}</pre>
						</details>
					) : null}
				</div>
			</div>
		);
	}
}
