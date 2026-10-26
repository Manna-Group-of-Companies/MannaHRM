import { describe, expect, it } from "vitest";

import { registerWorkbook } from "@/lib/registerxlsx";
import { settleFormulas } from "@/lib/xlsxsettle";

/* ---------------------------------------------------------------------------
   A formula with no saved answer is an empty cell in Protected View, on a
   phone and in a mail preview — which is how every register downloaded from
   the live site opens. So every formula on a register carries its answer,
   worked out from the sheet's own formula.
   --------------------------------------------------------------------------- */

const days = Array.from({ length: 30 }, () => 1);
const slip = (code, net, extra = {}) => ({
	srl: 1, code, name: `Person ${code}`, days, paymentDays: 30, state: "Submitted",
	gross: net + 200, deduction: 200, net, esi: 150, due: net + 200, agreed: net + 200,
	company: "Manna Rubber Products Pvt.Ltd", ...extra,
});
const preview = (code, base, extra = {}) => ({
	srl: 1, code, name: `Person ${code}`, days, kind: "Salary", base, clBrought: 1, clEarned: 1,
	pfMember: true, esiMember: true, ...extra,
});

const unanswered = (ws) => {
	const out = [];
	ws.eachRow((row) => row.eachCell((cell) => {
		/* `.model`, not `.value`: ExcelJS's `.value` drops a saved answer of 0. */
		const m = cell.model;
		if (m.formula && m.result === undefined && !(cell.isMerged && cell.master !== cell)) out.push(cell.address);
	}));
	return out;
};

async function bareSheet(cells) {
	const ExcelJS = (await import("exceljs")).default;
	const ws = new ExcelJS.Workbook().addWorksheet("S");
	for (const [a, v] of Object.entries(cells)) ws.getCell(a).value = v;
	return settleFormulas(ws);
}

describe("a downloaded register shows its figures before Excel recalculates", () => {
	it("saves an answer beside every formula on a register built from slips, payment split included", async () => {
		const rows = [slip("A1", 18000, { actualSalary: 29000 }), slip("B2", 15000, { bankPercent: 50 }), slip("C3", 24000)];
		const ws = (await registerWorkbook(rows, { ym: "2026-09", company: "C", paymentSplit: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect(unanswered(ws)).toEqual([]);
	});

	it("saves an answer beside every formula on the preview, where no slip exists yet", async () => {
		const rows = [preview("A1", 20000), preview("W1", 0, { kind: "Wages", daily: 700, days: days.map((d, i) => (i % 7 === 6 ? "SNDY" : d)) })];
		const ws = (await registerWorkbook(rows, { ym: "2026-09", company: "C", preview: true, paymentSplit: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect(unanswered(ws)).toEqual([]);
	});

	it("gives the payment split the same figures the formulas come to: net, the bank cap, and the rest in cash", async () => {
		const ws = (await registerWorkbook([slip("C3", 24000)], { ym: "2026-09", company: "C", paymentSplit: true, bankCap: 20000 })).getWorksheet("Wages Register");
		const row = ws.getRow(6);
		const split = [];
		row.eachCell((c) => { if (c.value && c.value.formula && /^C[UVW]6$/.test(c.address)) split.push(c.value.result); });
		expect(split).toEqual([24000, 20000, 4000]);
	});

	it("works a preview's net out from the salary, as Excel would: 20,000 less PF on 50%, ESI and PT", async () => {
		const ws = (await registerWorkbook([preview("A1", 20000)], { ym: "2026-09", company: "C", preview: true })).getWorksheet("Wages Register");
		const net = ws.getCell("CR6").value;
		expect(net.formula).toBe("ROUNDUP(CQ6,0)+CS6");
		/* PF 12% of 10,000 = 1,200; ESI 0.75% of 20,000 = 150; PT 750 ÷ 6, a
		   half-year of 60,000 being in the 750 slab. */
		expect(net.result).toBe(20000 - 1200 - 150 - 125);
	});

	it("carries the answers into the file itself, zeros included, as Excel will read it", async () => {
		const ExcelJS = (await import("exceljs")).default;
		const wb = await registerWorkbook([preview("A1", 20000)], { ym: "2026-09", company: "C", preview: true, paymentSplit: true, bankCap: 20000 });
		const back = new ExcelJS.Workbook();
		await back.xlsx.load(await wb.xlsx.writeBuffer());
		const ws = back.getWorksheet("Wages Register");
		expect(unanswered(ws)).toEqual([]);
		expect(ws.getCell("CR6").model.result).toBe(18525);
		expect(ws.getCell("AM6").model.result).toBe(0);
	});

	it("keeps an answer the register already worked out rather than working it again", async () => {
		const ws = await bareSheet({ A1: 5, B1: { formula: "A1*2", result: 999 } });
		expect(ws.getCell("B1").value).toEqual({ formula: "A1*2", result: 999 });
	});
});

describe("the evaluator answers only what it can read, and never guesses", () => {
	it("leaves a function it does not know without an answer, and the cells that read it", async () => {
		const ws = await bareSheet({ A1: { formula: "VLOOKUP(1,B1:B2,1)" }, A2: { formula: "A1+1" }, A3: { formula: "2+2" } });
		expect(ws.getCell("A1").value.result).toBeUndefined();
		expect(ws.getCell("A2").value.result).toBeUndefined();
		expect(ws.getCell("A3").value.result).toBe(4);
	});

	it("leaves a division by zero without an answer rather than writing infinity", async () => {
		const ws = await bareSheet({ A1: 0, B1: { formula: "10/A1" } });
		expect(ws.getCell("B1").value.result).toBeUndefined();
	});

	it("leaves arithmetic on text without an answer, as Excel's #VALUE!", async () => {
		const ws = await bareSheet({ A1: "SNDY", B1: { formula: "A1+1" } });
		expect(ws.getCell("B1").value.result).toBeUndefined();
	});

	it("rounds half away from zero, as ROUND and ROUNDUP do in Excel", async () => {
		const ws = await bareSheet({ A1: { formula: "ROUND(2.5,0)" }, A2: { formula: "ROUND(-2.5,0)" }, A3: { formula: "ROUNDUP(-1.1,0)" }, A4: { formula: "ROUND(1.005,2)" } });
		expect([1, 2, 3, 4].map((r) => ws.getCell(`A${r}`).value.result)).toEqual([3, -3, -2, 1.01]);
	});

	it("skips text in a SUM range, counts text without case in COUNTIF, and reads an empty cell as 0", async () => {
		const ws = await bareSheet({
			A1: 1, B1: "sndy", C1: 0.5, D1: "SNDY",
			E1: { formula: "SUM(A1:D1)" }, F1: { formula: 'COUNTIF(A1:D1,"SNDY")' }, G1: { formula: "Z9" }, H1: { formula: 'IF(Z9="",1,2)' },
		});
		expect(["E1", "F1", "G1", "H1"].map((a) => ws.getCell(a).model.result)).toEqual([1.5, 2, 0, 1]);
	});

	it("gives percent, sign and comparison Excel's order: -2^2 is 4 and 50%*2 is 1", async () => {
		const ws = await bareSheet({ A1: { formula: "-2^2" }, A2: { formula: "50%*2" }, A3: { formula: "1+1=2" }, A4: { formula: "+(2*3)+1" } });
		expect([1, 2, 3, 4].map((r) => ws.getCell(`A${r}`).value.result)).toEqual([4, 1, true, 7]);
	});
});
