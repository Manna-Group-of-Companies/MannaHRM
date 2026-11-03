import { describe, expect, test } from "vitest";
import { formLinkFor, isFormLink, shareText, submittedBy, whatsappLink } from "@/lib/formshare";

const LINK = "https://docs.google.com/forms/d/e/1FAIpQ/viewform?usp=pp_url&entry.111=NUMBER&entry.222=NAME&entry.333=Manna+Treads";

describe("share form", () => {
	test("the persons own number and name go where NUMBER and NAME were, and nothing else changes", () => {
		const out = formLinkFor(LINK, { pin: "861", name: "Manoj ram" });
		expect(out).toBe("https://docs.google.com/forms/d/e/1FAIpQ/viewform?usp=pp_url&entry.111=861&entry.222=Manoj%20ram&entry.333=Manna+Treads");
	});

	test("only a google form pre-filled with NUMBER is accepted as the link", () => {
		expect(isFormLink(LINK)).toBe(true);
		expect(isFormLink("https://forms.gle/abc")).toBe(false);
		expect(isFormLink("https://docs.google.com/forms/d/e/1/viewform")).toBe(false);
	});

	test("whatsapp opens with the message and leaves the contact to choose", () => {
		const text = shareText({ pin: "861", name: "Manoj ram", company: "Manna Rubber Products Private Limited" }, "https://x");
		expect(text).toContain("machine no. 861");
		expect(whatsappLink(text)).toMatch(/^https:\/\/wa\.me\/\?text=Hello%20Manoj%20ram/);
	});

	test("the link is never the end of the message so a second share cannot run into it", () => {
		const text = shareText({ pin: "861", name: "Manoj ram" }, "https://x/form?entry.2=Manoj%20ram");
		const twice = text + text;
		expect(twice).toContain("https://x/form?entry.2=Manoj%20ram\n");
		expect(twice).not.toContain("Manoj%20ramHello");
	});
});

describe("who sent the form back", () => {
	test("a response is matched to the machine number Share form put in the link, latest first", () => {
		const got = submittedBy([
			{ Timestamp: 46327.5, "Machine Number": "512", "Full Name": "Manoj Ram" },
			{ Timestamp: 46328.25, "Machine Number": " 512 ", "Full Name": "Manoj Ram K" },
			{ Timestamp: 46328, "Machine Number": "", "Full Name": "Nobody's number" },
		]);
		expect(Object.keys(got)).toEqual(["512"]);
		expect(got["512"]).toEqual({ name: "Manoj Ram K", at: "2026-11-02 06:00" });
	});
});
