import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

import { appLoginDefault, appLoginProblem, appUserDoc, employeeDoc, makesAppLogin } from "@/lib/newemp";
import { NEW_EMP_STEPS } from "@/data/employees";

/* ---------------------------------------------------------------------------
   Create Employee → the phone app's login, made there and then (22 October
   2026): when somebody punches on the phone, a login and a password on the
   form become a User with the Employee role, linked to the new Employee.
   --------------------------------------------------------------------------- */

const APP = { custom_punch_method: "Mobile App", company_email: "anu@manna.in", employee_name: "Anu K" };

describe("the app login's rules", () => {
	it("offers the company email, else the personal one, as the login", () => {
		expect(appLoginDefault({ company_email: " anu@manna.in ", personal_email: "a@gmail.com" })).toBe("anu@manna.in");
		expect(appLoginDefault({ personal_email: "a@gmail.com" })).toBe("a@gmail.com");
	});

	it("makes a login only for somebody who punches on the phone, and only once a password is typed", () => {
		expect(makesAppLogin(APP, { email: "anu@manna.in", password: "secret123" })).toBe(true);
		expect(makesAppLogin({ ...APP, custom_punch_method: "Both" }, { email: "x@y.in", password: "secret123" })).toBe(true);
		expect(makesAppLogin(APP, { email: "anu@manna.in", password: "" })).toBe(false);
		expect(makesAppLogin({ ...APP, custom_punch_method: "Fingerprint Machine" }, { email: "x@y.in", password: "secret123" })).toBe(false);
	});

	it("wants an email for the login and eight characters for the password", () => {
		expect(appLoginProblem(APP, { email: "anu", password: "secret123" })).toMatch(/email address/);
		expect(appLoginProblem(APP, { email: "anu@manna.in", password: "short" })).toMatch(/8 characters/);
		expect(appLoginProblem(APP, { email: "anu@manna.in", password: "secret123" })).toBe("");
		expect(appLoginProblem(APP, { email: "", password: "" })).toBe("");
	});

	it("makes a User with the Employee role, the password typed and no welcome email", () => {
		expect(appUserDoc({ employee_name: "Anu Mary K" }, { email: " Anu@Manna.in ", password: "secret123" })).toEqual({
			email: "anu@manna.in", first_name: "Anu", last_name: "Mary K", enabled: 1, user_type: "System User",
			send_welcome_email: 0, new_password: "secret123", roles: [{ role: "Employee" }],
		});
	});

	it("never puts a login or a password on the Employee record", () => {
		const doc = employeeDoc({ ...APP, first_name: "Anu", app_password: "secret123", new_password: "x", password: "y" });
		expect(Object.keys(doc).some((k) => /pass/.test(k))).toBe(false);
	});
});

/* ---- the site step ---- */

const calls = [];
let site = { users: [], refuseUser: false };
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (dt) => Promise.resolve(dt === "User" ? site.users : []),
	apiCreate: (dt, doc) => {
		calls.push(["create", dt, doc]);
		if (dt === "User" && site.refuseUser) return Promise.reject(new Error("Password is too weak"));
		return Promise.resolve({ name: dt === "Employee" ? "HR-EMP-00900" : doc.email, ...doc });
	},
	apiWrite: (dt, name, patch) => { calls.push(["write", dt, name, patch]); return Promise.resolve({ ok: true }); },
}));

const { createAppLogin } = await import("@/api/employee");

describe("making the login on the site", () => {
	beforeEach(() => { calls.length = 0; site = { users: [], refuseUser: false }; });
	const emp = { name: "HR-EMP-00900", employee_name: "Anu K" };

	it("makes the User and then links the Employee to it", async () => {
		const r = await createAppLogin(emp, { email: "anu@manna.in", password: "secret123" });
		expect(r).toEqual({ ok: true, login: "anu@manna.in", existed: false, linked: true });
		expect(calls.map((c) => [c[0], c[1]])).toEqual([["create", "User"], ["write", "Employee"]]);
		expect(calls[1][3]).toEqual({ user_id: "anu@manna.in" });
	});

	it("links a login that is already there and leaves its password alone", async () => {
		site.users = [{ name: "anu@manna.in" }];
		const r = await createAppLogin(emp, { email: "anu@manna.in", password: "secret123" });
		expect(r).toMatchObject({ ok: true, existed: true });
		expect(calls.some((c) => c[1] === "User")).toBe(false);
	});

	it("says what the site refused and links nothing, without throwing", async () => {
		site.refuseUser = true;
		const r = await createAppLogin(emp, { email: "anu@manna.in", password: "secret123" });
		expect(r).toEqual({ ok: false, login: "anu@manna.in", error: "Password is too weak" });
		expect(calls.some((c) => c[0] === "write")).toBe(false);
	});
});

/* ---- the form ---- */

const { default: CreateEmployee } = await import("@/features/employees/CreateEmployee");
const { store, set, resetStore, getState } = await import("@/store");
const { loadedState } = await import("./fixture");

describe("Create Employee asks for the login beside Punch Method", () => {
	const punchStep = NEW_EMP_STEPS.findIndex((st) => st[2].some(([, rows]) => rows.some((r) => r[0] === "custom_punch_method")));
	const draw = async (f) => {
		resetStore();
		set(loadedState());
		set({ newemp: { ...getState().newemp, step: punchStep, f: { status: "Active", ...f } } });
		await act(async () => { render(<Provider store={store}><CreateEmployee /></Provider>); });
	};

	it("draws a login and a password for somebody on the phone, the login filled from their email", async () => {
		await draw({ custom_punch_method: "Mobile App", company_email: "anu@manna.in" });
		expect(screen.getByLabelText("App login").value).toBe("anu@manna.in");
		expect(screen.getByLabelText("App password").type).toBe("password");
	});

	it("draws neither for somebody on the fingerprint machine", async () => {
		await draw({ custom_punch_method: "Fingerprint Machine" });
		expect(screen.queryByLabelText("App login")).toBeNull();
		expect(screen.queryByLabelText("App password")).toBeNull();
	});

	it("keeps the password out of the store", async () => {
		await draw({ custom_punch_method: "Mobile App", company_email: "anu@manna.in" });
		fireEvent.change(screen.getByLabelText("App password"), { target: { value: "secret123" } });
		expect(JSON.stringify(getState())).not.toContain("secret123");
	});

	it("says a short password before Create is pressed", async () => {
		await draw({ custom_punch_method: "Mobile App", company_email: "anu@manna.in" });
		fireEvent.change(screen.getByLabelText("App password"), { target: { value: "short" } });
		expect(screen.getByText("The app password needs at least 8 characters.")).toBeTruthy();
	});
});
