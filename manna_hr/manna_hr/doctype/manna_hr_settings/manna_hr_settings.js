/* The group-wide switches, in Desk.
 *
 * **Everything here is a courtesy, not a control.** `manna_hr_settings.py`
 * checks the radius again on save, and `checkin.py` is what reads these values
 * when a punch arrives. See CLAUDE.md §1.
 *
 * Every field on this form applies to all six companies at once, which is what
 * the warnings below are for: there is no per-company version of any of it, so
 * a switch flipped here is flipped for everybody, and the person who notices is
 * whoever cannot punch tomorrow morning.
 */

frappe.ui.form.on("Manna HR Settings", {
	refresh(frm) {
		mannaSettingsSummary(frm);
	},

	enforce_geofence(frm) {
		if (!frm.doc.enforce_geofence) {
			frm.dashboard.set_headline(
				__("Geofencing is off for the whole group. Mobile punches will be accepted "
					+ "from anywhere, and nothing downstream records that they were unchecked."),
			);
		}
		mannaSettingsSummary(frm);
	},

	default_radius_metres(frm) {
		const r = frm.doc.default_radius_metres;
		if (r === null || r === undefined || r === "") return;
		if (r <= 0) {
			/* The server throws on this too. A zero radius refuses every phone
			   punch in the group, and the error each person sees blames their
			   own location. */
			frm.dashboard.set_headline(
				`<span class="text-danger">${__("A radius of zero refuses every phone punch in the group. The server will refuse to save this.")}</span>`,
			);
		} else if (r < 25) {
			frm.dashboard.set_headline(
				__("{0} m is tighter than the accuracy these phones report (about 20 m). "
					+ "Applies to every gate that has no radius of its own.", [r]),
			);
		}
	},

	trusted_device_prefix(frm) {
		/* The trap in CLAUDE.md §5, said on the field that causes it: a
		   `device_id` that does not start with this prefix is treated as a
		   mobile punch — geofenced, and refused, because no fingerprint machine
		   sends a coordinate. Change it and every machine's punches change
		   meaning at once. */
		if (!frm.doc.trusted_device_prefix) {
			frm.dashboard.set_headline(
				`<span class="text-danger">${__("With no prefix set, every biometric punch is treated as a mobile punch and geofenced. The machines send no coordinate, so they will all be refused.")}</span>`,
			);
			return;
		}
		frm.dashboard.set_headline(
			__("Every fingerprint machine's device_id must start with \"{0}\", including the ones "
				+ "named in bridge/config.toml. Anything else is treated as a mobile punch and geofenced.",
			[frm.doc.trusted_device_prefix]),
		);
	},

	enforce_punch_window(frm) {
		mannaWindowNote(frm);
	},

	punch_in_from(frm) {
		mannaWindowNote(frm);
	},

	punch_out_until(frm) {
		mannaWindowNote(frm);
	},
});

/** The night-shift trap, on the two fields that spring it.
 *
 * A window that closes before it opens is how a night worker is refused at
 * 22:00 for a shift that started at 20:00 — see CLAUDE.md §5. */
function mannaWindowNote(frm) {
	if (!frm.doc.enforce_punch_window) return;
	const { punch_in_from: from, punch_out_until: until } = frm.doc;
	if (!from || !until) return;

	if (until < from) {
		frm.dashboard.set_headline(
			__("This window closes at {0} and opens at {1}, so it crosses midnight. "
				+ "Confirm night-shift punches are still accepted before relying on it.", [until, from]),
		);
	}
}

/** One line saying what is currently switched on, because four checkboxes over
    two sections do not read as a policy until they are written as one. */
function mannaSettingsSummary(frm) {
	const on = [];
	if (frm.doc.enforce_geofence) on.push(__("geofence {0} m", [frm.doc.default_radius_metres || 0]));
	if (frm.doc.require_location_for_mobile) on.push(__("location required on mobile"));
	if (frm.doc.enforce_punch_window) {
		on.push(__("window {0}–{1}", [frm.doc.punch_in_from || "—", frm.doc.punch_out_until || "—"]));
	}

	frm.dashboard.clear_headline();
	frm.dashboard.set_headline(
		on.length
			? __("Enforced for all six companies: {0}.", [on.join(", ")])
			: __("Nothing is being enforced. Every punch is accepted as it arrives."),
	);
}
