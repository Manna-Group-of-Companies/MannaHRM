/* The gate, in Desk.
 *
 * **Everything here is a courtesy, not a control.** `work_location.py` checks
 * the same coordinate again on the server, and `checkin.py` is what actually
 * decides whether a punch is inside the fence. See CLAUDE.md §1.
 *
 * The one thing on this form that is not a mirror is the Capture button: a
 * coordinate typed from memory is the commonest way a gate ends up refusing
 * everybody, and the Python comment says as much — "capture them while standing
 * at the gate". This is the button that lets somebody do that.
 */

frappe.ui.form.on("Work Location", {
	refresh(frm) {
		mannaCoordinateNote(frm);

		/* Only offered on a secure origin, because `navigator.geolocation` is
		   silently unavailable on plain http and a button that does nothing is
		   worse than no button. */
		if (navigator.geolocation && window.isSecureContext) {
			frm.add_custom_button(__("Capture from this device"), () => mannaCapture(frm));
		}

		if (mannaIsRealCoordinate(frm.doc.latitude, frm.doc.longitude)) {
			frm.add_custom_button(__("Show on a map"), () => {
				/* Opened rather than embedded: an embedded map is a third-party
				   script on a page that lists where every gate is. */
				window.open(
					`https://www.openstreetmap.org/?mlat=${frm.doc.latitude}&mlon=${frm.doc.longitude}#map=18/${frm.doc.latitude}/${frm.doc.longitude}`,
					"_blank", "noopener",
				);
			});
		}
	},

	latitude(frm) {
		mannaCoordinateNote(frm);
	},

	longitude(frm) {
		mannaCoordinateNote(frm);
	},

	radius_metres(frm) {
		const r = frm.doc.radius_metres;
		if (r === null || r === undefined || r === "") return;
		if (r < 0) {
			frm.dashboard.set_headline(__("A radius cannot be negative."));
			return;
		}
		/* Not refused, either here or on the server — but a fence this tight
		   refuses honest punches made indoors, and the samples from the mobile
		   export sit around 20 m of GPS accuracy. */
		if (r > 0 && r < 25) {
			frm.dashboard.set_headline(
				__("{0} m is tighter than the accuracy these phones report (about 20 m). "
					+ "A fence smaller than the error refuses people who are standing at the gate.", [r]),
			);
		}
	},
});

/** The same test as `geo.is_real_coordinate`, and for the same reason.
 *
 * (0, 0) is in the Atlantic and is what an unset Float reads as. A location
 * saved that way refuses every punch at that gate, and the error the employee
 * sees blames their phone. */
function mannaIsRealCoordinate(lat, lng) {
	if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
	const a = Number(lat);
	const b = Number(lng);
	if (!isFinite(a) || !isFinite(b)) return false;
	if (Math.abs(a) > 90 || Math.abs(b) > 180) return false;
	return !(a === 0 && b === 0);
}

function mannaCoordinateNote(frm) {
	frm.dashboard.clear_headline();
	const { latitude: lat, longitude: lng } = frm.doc;
	if ((lat === null || lat === undefined || lat === 0)
		&& (lng === null || lng === undefined || lng === 0)) {
		return; // A blank new record is not yet wrong.
	}
	if (!mannaIsRealCoordinate(lat, lng)) {
		frm.dashboard.set_headline(
			`<span class="text-danger">${__("That is not a real place. The server will refuse it — capture the coordinate while standing at the gate.")}</span>`,
		);
	}
}

/** Read this device's position into the two fields.
 *
 * `enableHighAccuracy` because the default is a network fix that can be a
 * kilometre out, and a kilometre is the whole geofence. The accuracy is
 * reported rather than hidden: a fix worse than the radius is not worth saving,
 * and the person capturing it is the only one who can walk ten metres and try
 * again. */
function mannaCapture(frm) {
	frappe.show_alert({ message: __("Reading this device's position…"), indicator: "blue" });

	navigator.geolocation.getCurrentPosition(
		(pos) => {
			const { latitude, longitude, accuracy } = pos.coords;
			frm.set_value("latitude", Number(latitude.toFixed(6)));
			frm.set_value("longitude", Number(longitude.toFixed(6)));

			const metres = Math.round(accuracy);
			const radius = frm.doc.radius_metres;
			const poor = radius && metres > radius;
			frappe.msgprint({
				title: __("Captured"),
				indicator: poor ? "orange" : "green",
				message: poor
					? __("Accurate to about {0} m, which is wider than this gate's {1} m radius. "
						+ "Step outside, wait a moment and capture again before saving.", [metres, radius])
					: __("Accurate to about {0} m.", [metres]),
			});
		},
		(err) => {
			frappe.msgprint({
				title: __("Could not read a position"),
				indicator: "red",
				message: __("{0}. This has to be done on a device standing at the gate, "
					+ "with location permission granted to this site.", [err.message]),
			});
		},
		{ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
	);
}
