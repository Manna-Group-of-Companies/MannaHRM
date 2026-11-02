/* Settings → Machines (2 November 2026, asked for by HR): each fingerprint
   machine, and which road its punches are on — ADMS straight to the site, or
   the bridge on the gate PC.

   The site writes `Attendance Device.last_seen` when a machine checks in over
   ADMS, at most every five minutes. The bridge (bridge/mannabridge/failover.py)
   stops reading a machine seen there in the last fifteen and reads it again
   after, so this page uses the same fifteen: the two cannot disagree about
   which road a machine is on. */

export const ADMS_QUIET_MINUTES = 15;

/* A punch that reached the site in the last day, off a machine ADMS has not
   seen, came by the bridge. A day, not an hour (2 November 2026): between the
   morning's arrivals and the evening's departures nobody punches at a gate, and
   an hour read every bridge machine as Not connected by eleven. The bridge
   sends no heartbeat of its own, so a punch is the only sign there is. */
export const BRIDGE_QUIET_MINUTES = 24 * 60;

const stamp = (v) => {
	if (!v) return null;
	const t = new Date(String(v).slice(0, 19).replace(" ", "T"));
	return Number.isNaN(t.getTime()) ? null : t;
};

/** "ADMS", "Bridge" or "Quiet" for one machine, at `now`. */
export function routeOf(device, lastPunch, now = new Date()) {
	const seen = stamp(device?.last_seen);
	if (seen && now - seen <= ADMS_QUIET_MINUTES * 60000) return "ADMS";
	const reached = stamp(lastPunch?.creation);
	if (reached && now - reached <= BRIDGE_QUIET_MINUTES * 60000) return "Bridge";
	return "Quiet";
}

/** The table's rows, ADMS first, then Bridge, then Quiet, by name within each. */
export function machineRows(devices, lastPunches, now = new Date()) {
	const order = { ADMS: 0, Bridge: 1, Quiet: 2 };
	return (devices || [])
		.map((d) => {
			const p = (lastPunches || {})[d.device_id] || null;
			return {
				name: d.name,
				deviceId: d.device_id,
				company: d.company || "",
				active: Boolean(d.is_active),
				route: routeOf(d, p, now),
				lastSeen: d.last_seen || "",
				lastPunch: p?.time || "",
				reached: p?.creation || "",
			};
		})
		.sort((a, b) => order[a.route] - order[b.route] || a.name.localeCompare(b.name));
}
