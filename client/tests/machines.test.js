import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ADMS_QUIET_MINUTES, machineRows, routeOf } from "@/lib/machines";

const NOW = new Date("2026-11-02T10:00:00");

describe("which road a machine is on", () => {
	it("is ADMS while the site saw the machine there in the last fifteen minutes", () => {
		expect(routeOf({ last_seen: "2026-11-02 09:50:00.1" }, { creation: "2026-11-02 08:00:00" }, NOW)).toBe("ADMS");
	});

	it("is the bridge once ADMS has gone quiet and a punch still reached the site today", () => {
		expect(routeOf({ last_seen: "2026-11-02 09:40:00" }, { creation: "2026-11-02 09:30:00" }, NOW)).toBe("Bridge");
	});

	it("stays the bridge through a quiet afternoon, when nobody punches at a gate for hours", () => {
		expect(routeOf({ last_seen: null }, { creation: "2026-11-01 15:00:00" }, new Date("2026-11-02T15:14:00"))).toBe("Bridge");
	});

	it("is quiet when neither road has brought anything for a day", () => {
		expect(routeOf({ last_seen: null }, { creation: "2026-11-01 09:59:00" }, NOW)).toBe("Quiet");
		expect(routeOf({}, null, NOW)).toBe("Quiet");
	});

	it("uses the bridge's own fifteen minutes, so the page and the bridge never disagree", () => {
		const py = fs.readFileSync(path.resolve(__dirname, "../../bridge/mannabridge/failover.py"), "utf8");
		expect(Number(py.match(/^QUIET_AFTER_MINUTES = (\d+)/m)[1])).toBe(ADMS_QUIET_MINUTES);
	});

	it("lists ADMS machines first, then the bridge's, then the quiet ones", () => {
		const rows = machineRows(
			[
				{ name: "Quiet one", device_id: "BIO-Q", last_seen: null },
				{ name: "Gate", device_id: "BIO-G", last_seen: "2026-11-02 09:58:00" },
				{ name: "Retreads", device_id: "BIO-R", last_seen: null },
			],
			{ "BIO-R": { time: "2026-11-02 09:40:00", creation: "2026-11-02 09:45:00" } },
			NOW,
		);
		expect(rows.map((r) => [r.name, r.route])).toEqual([["Gate", "ADMS"], ["Retreads", "Bridge"], ["Quiet one", "Quiet"]]);
		expect(rows[1].lastPunch).toBe("2026-11-02 09:40:00");
	});
});
