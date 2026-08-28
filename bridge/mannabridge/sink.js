/**
 * Delivering a punch to ERPNext.
 *
 * Posts to Frappe HR's own endpoint rather than creating `Employee Checkin`
 * directly, because that endpoint resolves the device's user number to an
 * `Employee` via `attendance_device_id` and applies hrms' own duplicate window.
 * Writing the doctype directly would mean reimplementing both, in a program
 * that runs unattended on a shelf.
 */

import { logger } from "./log.js";

const log = logger("mannabridge.sink");

const ENDPOINT =
	"/api/method/hrms.hr.doctype.employee_checkin.employee_checkin.add_log_based_on_employee_field";

/* hrms answers with this when the device's user number matches nobody. It is by
   far the commonest failure in a rollout, and it is a master-data problem, not
   a network one — so it must not be retried forever in silence. */
const NO_EMPLOYEE = "no employee found";

/** Transient. Worth retrying. */
export class DeliveryError extends Error {
	constructor(m) { super(m); this.name = "DeliveryError"; }
}

/** Permanent until somebody sets `attendance_device_id`. Not retried. */
export class UnmappedEmployee extends Error {
	constructor(m) { super(m); this.name = "UnmappedEmployee"; }
}

const trim = (u) => u.replace(/\/+$/, "");

export class ErpSink {
	constructor(baseUrl, apiKey, apiSecret, timeout = 30) {
		this._url = trim(baseUrl) + ENDPOINT;
		this._timeout = timeout * 1000;
		this._headers = {
			Authorization: `token ${apiKey}:${apiSecret}`,
			Accept: "application/json",
		};
	}

	_signal() {
		return AbortSignal.timeout(this._timeout);
	}

	/** Deliver one punch. Throws on failure; the caller decides what next. */
	async send({ deviceUser, punchedAt, deviceId, logType = null }) {
		const payload = {
			employee_field_value: deviceUser,
			timestamp: punchedAt,
			device_id: deviceId,
		};
		/* Only sent when the device actually reports direction. Most ZK machines
		   in the field are configured not to, and sending an empty log_type is
		   not the same as omitting it — hrms treats the blank as a real value
		   and the shift's pairing mode then has nothing to alternate on. */
		if (logType) payload.log_type = logType;

		let response;
		try {
			response = await fetch(this._url, {
				method: "POST",
				headers: { ...this._headers, "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				signal: this._signal(),
			});
		} catch (e) {
			throw new DeliveryError(String(e && e.message ? e.message : e));
		}

		const body = await response.text().catch(() => "");

		if (response.status === 200 || response.status === 201) {
			try {
				return JSON.parse(body).message ?? {};
			} catch {
				return {};
			}
		}

		if (body.toLowerCase().includes(NO_EMPLOYEE)) {
			throw new UnmappedEmployee(
				`device user ${deviceUser} on ${deviceId} matches no Employee.attendance_device_id`,
			);
		}

		if (response.status === 401 || response.status === 403) {
			// Retrying a dead token forever produces a silent bridge, which is
			// the failure this whole design exists to avoid.
			throw new DeliveryError(
				`authentication refused (${response.status}) — the API key has been rotated or revoked`,
			);
		}

		throw new DeliveryError(`HTTP ${response.status}: ${body.slice(0, 300)}`);
	}

	/**
	 * Tell every auto-attendance shift how far the checkins now reach.
	 *
	 * **Frappe HR does nothing at all without this.** `process_auto_attendance`
	 * returns immediately unless `last_sync_of_checkin` is set, so punches can
	 * arrive perfectly and no Attendance is ever generated — with no error
	 * anywhere to say why. The official biometric sync tool writes this field;
	 * a bridge that does not is silently useless.
	 *
	 * Set to the newest punch actually delivered, never to `now`. hrms only
	 * processes shifts whose end is before this timestamp, so pushing it into
	 * the future would have it close today's shift while people are still on
	 * the floor and mark them on whatever hours they had at that moment.
	 */
	async markSynced(baseUrl, upTo) {
		const base = trim(baseUrl);
		let shifts;
		try {
			const params = new URLSearchParams({
				fields: '["name"]',
				filters: '[["enable_auto_attendance","=",1]]',
				limit_page_length: "200",
			});
			const r = await fetch(`${base}/api/resource/Shift Type?${params}`, {
				headers: this._headers,
				signal: this._signal(),
			});
			shifts = ((await r.json()).data || []).map((s) => s.name);
		} catch (e) {
			log.warning("could not list shifts to update last_sync_of_checkin:", e.message);
			return 0;
		}

		let done = 0;
		for (const name of shifts) {
			try {
				await fetch(`${base}/api/resource/Shift Type/${encodeURIComponent(name)}`, {
					method: "PUT",
					headers: { ...this._headers, "Content-Type": "application/json" },
					body: JSON.stringify({ last_sync_of_checkin: upTo }),
					signal: this._signal(),
				});
				done++;
			} catch (e) {
				log.warning(`could not set last_sync_of_checkin on ${name}:`, e.message);
			}
		}
		return done;
	}

	/** Cheap liveness check, so a dead line is logged as a dead line. */
	async heartbeat(baseUrl) {
		try {
			const r = await fetch(trim(baseUrl) + "/api/method/frappe.handler.ping", {
				headers: this._headers,
				signal: this._signal(),
			});
			return r.status === 200;
		} catch {
			return false;
		}
	}
}
