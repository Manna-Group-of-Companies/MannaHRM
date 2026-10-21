import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

import Login from "@/features/auth/Login";
import { http } from "@/api/client";
import { store, getState, resetStore } from "@/store";
import { PRIVACY, TERMS } from "@/data/policies";

/* ---------------------------------------------------------------------------
   The sign-in page as the HRDashboard reference draws it (21 October 2026).
   The look is the reference's; the call, the accepted ids and the messages
   are the ones it always had.
   --------------------------------------------------------------------------- */

const draw = () => render(<Provider store={store}><Login /></Provider>);
const type = (label, v) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
const refused = (status) => Object.assign(new Error(String(status)), { status });

beforeEach(() => resetStore());
afterEach(() => vi.restoreAllMocks());

describe("the sign-in page", () => {
	it("is the reference's form, without the parts this site cannot back", () => {
		draw();
		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Login first to your account");
		expect(screen.getByLabelText("Email Address").type).toBe("text");
		expect(screen.getByLabelText("Password").type).toBe("password");
		expect(screen.getByRole("button", { name: "Login" }).disabled).toBe(true);
		expect(screen.getByRole("button", { name: "Forgot password" })).toBeTruthy();
		/* No Remember me (a session is the site's cookie), no sign-up, and no
		   Google or Apple: the site has no Social Login Key. */
		for (const gone of [/remember me/i, /create account/i, /google/i, /apple/i]) {
			expect(document.body.textContent).not.toMatch(gone);
		}
	});

	it("signs in with the same call, a user id as well as an email, trimmed", async () => {
		const post = vi.spyOn(http, "post").mockResolvedValue({ data: {} });
		vi.spyOn(http, "get").mockResolvedValue({ data: { message: "hr@mannarubber.com" } });
		draw();
		type("Email Address", "  hr  ");
		type("Password", "secret");
		await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Login" })); });
		expect(post.mock.calls[0][0]).toBe("/api/method/login");
		expect(post.mock.calls[0][1]).toEqual({ usr: "hr", pwd: "secret" });
		expect(getState().user).toBe("hr@mannarubber.com");
	});

	it("shows a wrong password in the red error box, in the words it always used", async () => {
		vi.spyOn(http, "post").mockRejectedValue(refused(401));
		draw();
		type("Email Address", "hr@mannarubber.com");
		type("Password", "wrong");
		await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Login" })); });
		expect(document.querySelector(".k-auth-err[role=alert]").textContent).toBe("Wrong user or password.");
		expect(getState().user).toBeFalsy();
	});

	it("shows and hides the password with the eye", () => {
		draw();
		const box = screen.getByLabelText("Password");
		fireEvent.click(screen.getByRole("button", { name: "Show password" }));
		expect(box.type).toBe("text");
		fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
		expect(box.type).toBe("password");
	});

	it("asks the site to mail its own reset link for Forgot password", async () => {
		const post = vi.spyOn(http, "post").mockResolvedValue({ data: {} });
		draw();
		type("Email Address", "anita@mannarubber.com");
		fireEvent.click(screen.getByRole("button", { name: "Forgot password" }));
		expect(screen.getByLabelText("Email Address").value).toBe("anita@mannarubber.com");
		await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send reset link" })); });
		expect(post.mock.calls[0][0]).toBe("/api/method/frappe.core.doctype.user.user.reset_password");
		expect(post.mock.calls[0][1]).toEqual({ user: "anita@mannarubber.com" });
		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Check your email");
	});

	it("says so when the site knows nobody by that name", async () => {
		vi.spyOn(http, "post").mockRejectedValue(refused(404));
		draw();
		fireEvent.click(screen.getByRole("button", { name: "Forgot password" }));
		type("Email Address", "nobody@example.com");
		await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send reset link" })); });
		expect(document.querySelector(".k-auth-err").textContent).toBe("No account with that email or user id.");
	});

	it("opens Terms and Privacy from the footer, each marked a draft", () => {
		draw();
		fireEvent.click(screen.getByRole("button", { name: "Terms & Conditions" }));
		expect(document.body.textContent).toContain(TERMS[0][0]);
		expect(document.body.textContent).toContain("Draft — HR to review");
		const closes = screen.getAllByRole("button", { name: "Close" });
		fireEvent.click(closes[closes.length - 1]);
		fireEvent.click(screen.getByRole("button", { name: "Privacy Policy" }));
		expect(document.body.textContent).toContain(PRIVACY[0][0]);
	});
});
