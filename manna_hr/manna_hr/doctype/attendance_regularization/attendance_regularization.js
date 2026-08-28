/* The correction form, in Desk.
 *
 * **Everything here is a courtesy, not a control.** Every rule below is
 * enforced again in `attendance_regularization.py` and `regularization.py`, on
 * the server, on the server's clock. This file exists so somebody filling the
 * form finds out at the field rather than at Save — see CLAUDE.md §1. If you
 * add a rule here, add it there first; a rule that lives only in this file is a
 * suggestion to anyone holding `curl`.
 */

frappe.ui.form.on("Attendance Regularization", {
	refresh(frm) {
		/* Only people who are here can have a correction raised for them. The
		   server does not care, but a picker offering 344 leavers is a picker
		   somebody picks the wrong Suresh from. */
		frm.set_query("employee", () => ({ filters: { status: "Active" } }));

		mannaShowHours(frm);
		mannaWarnSelfApproval(frm);

		/* The decision trail is written by the server when the status changes —
		   see regularization.on_update. Typing into it by hand would make the
		   record say somebody decided this who did not. */
		["decided_by", "decided_on"].forEach((f) => frm.set_df_property(f, "read_only", 1));

		if (frm.doc.status === "Approved" && !frm.doc.__islocal) {
			frm.dashboard.set_headline(
				__("Approved. The corrected punches were written to Employee Checkin; "
					+ "Attendance is rebuilt from them by the shift job."),
			);
		}
	},

	attendance_date(frm) {
		if (!frm.doc.attendance_date) return;
		if (frappe.datetime.get_diff(frm.doc.attendance_date, frappe.datetime.get_today()) > 0) {
			/* A correction for a day that has not happened is either a typo or
			   somebody pre-approving their own attendance. */
			mannaSay(frm, __("That day has not happened yet. A correction can only be raised for a day that has."));
		}
	},

	requested_in(frm) {
		mannaCheckTimes(frm);
		mannaShowHours(frm);
	},

	requested_out(frm) {
		mannaCheckTimes(frm);
		mannaShowHours(frm);
	},

	status(frm) {
		mannaWarnSelfApproval(frm);
	},

	validate(frm) {
		/* Mirrors the two throws in the controller, so the message arrives
		   before a round trip rather than after one. The server still throws;
		   this only decides how it feels. */
		if (!frm.doc.requested_in && !frm.doc.requested_out) {
			frappe.throw({
				title: __("Nothing to correct"),
				message: __("Give at least one time — the punch in, the punch out, or both."),
			});
		}
	},
});

/** One line under the times, saying what the correction adds up to.
 *
 * Worded as Factor HR words it — "11 hrs 18 minutes", not 11.3 — because the
 * two systems are being read side by side and a different unit reads as a
 * different number. */
function mannaShowHours(frm) {
	const { requested_in: a, requested_out: b } = frm.doc;
	if (!a || !b) {
		frm.set_df_property("requested_out", "description", "");
		return;
	}
	const minutes = Math.round(
		(frappe.datetime.str_to_obj(b) - frappe.datetime.str_to_obj(a)) / 60000,
	);
	if (minutes < 0) return;
	frm.set_df_property(
		"requested_out", "description",
		__("{0} hrs {1} minutes", [Math.floor(minutes / 60), minutes % 60]),
	);
}

function mannaCheckTimes(frm) {
	const { requested_in: a, requested_out: b } = frm.doc;
	if (!a || !b) return;
	if (frappe.datetime.str_to_obj(b) < frappe.datetime.str_to_obj(a)) {
		mannaSay(frm, __("The punch-out is before the punch-in. If this is a night shift, "
			+ "the out time belongs to the following date."));
	}
}

/** Nobody signs off their own attendance.
 *
 * `_guard_self_approval` on the server is what actually refuses it. This says
 * so early, because finding out after pressing Approve — on somebody else's
 * behalf, in a queue of fifty — is how the guard gets read as a bug. */
function mannaWarnSelfApproval(frm) {
	if (frm.doc.status !== "Approved" || !frm.doc.employee) return;

	frappe.db.get_value("Employee", { user_id: frappe.session.user }, "name")
		.then((r) => {
			const me = r && r.message && r.message.name;
			if (me && me === frm.doc.employee) {
				frm.dashboard.clear_headline();
				frm.dashboard.set_headline(
					`<span class="text-danger">${__("This is your own correction. The server will refuse it — it goes to HR.")}</span>`,
				);
			}
		});
}

/** A note on the form rather than a modal. These are all things worth knowing
    and none of them should stop somebody mid-sentence. */
function mannaSay(frm, message) {
	frm.dashboard.clear_headline();
	frm.dashboard.set_headline(message);
}
