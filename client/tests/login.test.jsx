import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Login from "@/features/auth/Login";
import { store } from "@/store";

/* The sign-in page's eye on the password box (17 October 2026). */

const signedIn = [];
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	login: async (u, p) => { signedIn.push([u, p]); return u; },
}));

const draw = () => render(<Provider store={store}><Login /></Provider>);

describe("the password box", () => {
	it("hides the password until the eye is pressed, and hides it again on a second press", () => {
		const view = draw();
		const box = view.getByLabelText("Password");
		expect(box.type).toBe("password");
		fireEvent.change(box, { target: { value: "Secret@2026" } });
		fireEvent.click(view.getByLabelText("Show password"));
		expect(box.type).toBe("text");
		expect(box.value).toBe("Secret@2026");
		fireEvent.click(view.getByLabelText("Hide password"));
		expect(box.type).toBe("password");
	});

	it("does not sign in when the eye is pressed — it is not the form's button", () => {
		signedIn.length = 0;
		const view = draw();
		fireEvent.change(view.getByLabelText("Email / user id"), { target: { value: "hr@mannarubber.com" } });
		fireEvent.change(view.getByLabelText("Password"), { target: { value: "x" } });
		fireEvent.click(view.getByLabelText("Show password"));
		expect(signedIn).toEqual([]);
	});

	it("signs in with what was typed whether it is shown or hidden", async () => {
		signedIn.length = 0;
		const view = draw();
		fireEvent.change(view.getByLabelText("Email / user id"), { target: { value: "hr@mannarubber.com" } });
		fireEvent.change(view.getByLabelText("Password"), { target: { value: "Secret@2026" } });
		fireEvent.click(view.getByLabelText("Show password"));
		await act(async () => { fireEvent.click(view.getByRole("button", { name: "Sign in" })); });
		expect(signedIn).toEqual([["hr@mannarubber.com", "Secret@2026"]]);
	});
});
