/* Settings → Machines' read: every Attendance Device, and the newest punch off
   each. One small request per machine — there are five — rather than a month
   of everybody's punches to find five rows. See lib/machines.js. */

import { api, listAll } from "@/api/client";

export async function loadMachines() {
	const devices = await listAll("Attendance Device", ["name", "device_id", "company", "is_active", "last_seen"]);
	const last = {};
	await Promise.all(devices.filter((d) => d.device_id).map(async (d) => {
		const r = await api("/api/resource/Employee Checkin", {
			fields: JSON.stringify(["time", "creation"]),
			filters: JSON.stringify([["device_id", "=", d.device_id]]),
			order_by: "time desc",
			limit_page_length: 1,
		});
		last[d.device_id] = (r.data || [])[0] || null;
	}));
	return { devices, last };
}
