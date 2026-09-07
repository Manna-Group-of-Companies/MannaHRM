import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/* ---------------------------------------------------------------------------
   What a test is allowed to touch.

   **Nothing reaches the network.** `axios` is replaced whole rather than
   stubbed per call, so a screen that grows a read nobody mocked fails on the
   first render instead of quietly hitting `mannarubber.m.frappe.cloud` from
   somebody's laptop. That is the one rule in this file worth keeping: a suite
   that can reach the live site is a suite that can be made to write to it, and
   the site has a daily compute limit that a test loop would spend in minutes
   (docs/OPEN_QUESTIONS.md §0).

   Everything else here is jsdom being smaller than a browser. The gaps are
   filled rather than worked around in the components, because a component that
   knows it is under test is a component nobody is really testing.
   --------------------------------------------------------------------------- */

vi.mock("axios", () => {
	const answer = () => Promise.resolve({ data: {}, status: 200, headers: {} });
	const instance = {
		get: vi.fn(answer),
		post: vi.fn(answer),
		put: vi.fn(answer),
		delete: vi.fn(answer),
		request: vi.fn(answer),
		defaults: { headers: { common: {} } },
		interceptors: {
			request: { use: vi.fn(), eject: vi.fn() },
			response: { use: vi.fn(), eject: vi.fn() },
		},
	};
	const axios = { ...instance, create: vi.fn(() => instance), isAxiosError: () => false };
	return { default: axios, ...axios };
});

/* `matchMedia` is what `SubNav` asks the browser before it scrolls the page
   strip: somebody who has asked their system for less motion gets an instant
   jump rather than a smooth one. jsdom has no implementation at all, and the
   throw lands inside a layout effect — which reads as the component being
   broken rather than as the environment being incomplete.

   `matches: false` is the right stand-in rather than a convenience: it is the
   same answer a browser gives when nothing has been asked for. */
if (!window.matchMedia) {
	window.matchMedia = (query) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	});
}

/* Several screens measure or scroll a container they have just drawn. jsdom
   lays nothing out, so these are absent rather than zero. */
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!window.scrollTo) window.scrollTo = () => {};
if (!window.print) window.print = () => {};

/* The export controls build a Blob and hand it to an anchor. jsdom has Blob and
   not this, and an export is a control on nine toolbars — a page that throws
   here would look like a broken page rather than a missing browser API. */
if (!URL.createObjectURL) URL.createObjectURL = () => "blob:test";
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

afterEach(() => {
	cleanup();
	/* The router pushes real history entries. Without this the next test starts
	   on whatever page the last one navigated to, and a failure then depends on
	   the order the files ran in — which is the hardest kind to read. */
	window.history.replaceState({}, "", "/");
});
