/**
 * Convert the Factor HR .docx letter formats into Letter Type records.
 *
 *     node tools/load_letter_types.js            # convert only, write nothing
 *     node tools/load_letter_types.js --apply
 *
 * Word documents are not a template format anybody can maintain in a browser,
 * so each one is converted to HTML with its `{MergeField}` tokens intact. HR
 * can then edit the wording in ERPNext without opening Word or asking a
 * developer.
 *
 * ## What is deliberately not attempted
 *
 * **Layout is not preserved.** These documents use tab stops and tables to line
 * up `Employee Name    :    {EmployeeName}`, and reproducing that faithfully in
 * HTML would mean guessing at intent. Tables become tables; tab-aligned lines
 * become a two-column table, which is what they were imitating. Everything else
 * becomes a paragraph.
 *
 * The wording, the order and the merge fields all survive. The letterhead does
 * not — that belongs in a Frappe Letter Head, applied at print time, not baked
 * into seventeen separate templates.
 *
 * **Two files convert to nothing.** `Form2Revised` and `Form3ARevised` hold
 * their content in form controls or images rather than text. They are statutory
 * PF forms and are flagged rather than silently imported as blank.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { readDocx, runsOf, styleOf, tableRows, textOf } from "./lib/docx.js";
import { createDoc, requireKey, updateDoc } from "./lib/erp.js";

const SRC = "data/factohr/Letter Formats";

/* Which of these are actually letters and which are government forms. The
   distinction matters: a statutory form has a legally fixed layout and should
   be reproduced exactly or not at all, whereas a letter is ours to reword. */
const CATEGORY = {
	"CandidateOfferLetter": "Offer / Onboarding",
	"Experience Certificate-Format": "HR Letter",
	"Service Certificate Letter": "HR Letter",
	"TO WHOM IT MAY CONCERN": "HR Letter",
	"Gratuity": "HR Letter",
	"Salary Advance": "HR Letter",
	"Request For Liquor Permit": "HR Letter",
	"Traffic Warning": "Warning / Notice",
};

const TOKEN = /\{([A-Za-z0-9 _.\-/]{2,40})\}/g;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One paragraph, keeping bold runs and turning tab-aligned label/value lines
    into a two-column row — which is the shape they were imitating. */
function paraHtml(pXml) {
	const text = textOf(pXml);
	if (!text.trim()) return "";

	// "Employee Name\t:\t{EmployeeName}" and friends
	if (text.includes("\t")) {
		const cells = text.split("\t").map((c) => c.trim()).filter(Boolean);
		if (cells.length >= 2) {
			return "<tr>" + cells.map((c) => `<td>${esc(c)}</td>`).join("") + "</tr>";
		}
	}

	const bits = [];
	for (const run of runsOf(pXml)) {
		if (!run.text) continue;
		const t = esc(run.text);
		bits.push(run.bold ? `<b>${t}</b>` : t);
	}
	const body = bits.join("") || esc(text);
	return styleOf(pXml).includes("heading") ? `<h3>${body}</h3>` : `<p>${body}</p>`;
}

async function convert(file) {
	const parts = await readDocx(file);
	const out = [];
	let openTable = false;

	const close = () => {
		if (openTable) { out.push("</table>"); openTable = false; }
	};

	for (const part of parts) {
		if (part.kind === "tbl") {
			close();
			out.push('<table class="letter-table" border="1">');
			for (const row of tableRows(part.xml)) {
				out.push("<tr>" + row.map((c) => `<td>${esc(c)}</td>`).join("") + "</tr>");
			}
			out.push("</table>");
			continue;
		}

		const html = paraHtml(part.xml);
		if (!html) continue;
		if (html.startsWith("<tr>")) {
			if (!openTable) { out.push('<table class="letter-fields">'); openTable = true; }
			out.push(html);
		} else {
			close();
			out.push(html);
		}
	}
	close();

	const html = out.join("\n");
	const fields = [...new Set([...html.matchAll(TOKEN)].map((m) => m[1].trim()))].sort();
	return { html, fields };
}

const padEnd = (s, n) => String(s).padEnd(n);
const padStart = (s, n) => String(s).padStart(n);

async function main() {
	const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });
	if (values.apply) requireKey();

	if (!fs.existsSync(SRC)) {
		process.stderr.write(`No letter formats at ${SRC}\n`);
		process.exit(1);
	}

	let made = 0;
	let skipped = 0;

	for (const fn of fs.readdirSync(SRC).sort()) {
		if (!fn.toLowerCase().endsWith(".docx")) continue;
		const stem = path.basename(fn, path.extname(fn));

		let html;
		let fields;
		try {
			({ html, fields } = await convert(path.join(SRC, fn)));
		} catch (e) {
			console.log(`  ${padEnd(stem.slice(0, 44), 44)} FAILED: ${String(e.message).slice(0, 50)}`);
			continue;
		}

		if (html.replace(/<[^>]+>/g, "").trim().length < 40) {
			console.log(`  ${padEnd(stem.slice(0, 44), 44)} SKIPPED - no extractable text`);
			skipped++;
			continue;
		}

		const category = CATEGORY[stem] || "Statutory Form";
		console.log(`  ${padEnd(stem.slice(0, 44), 44)} ${padEnd(category, 20)}`
			+ ` ${padStart(fields.length, 2)} fields, ${html.length} chars`);

		if (!values.apply) continue;

		const doc = {
			doctype: "Letter Type", letter_name: stem, category, is_active: 1,
			source_file: fn, template: html, fields_used: fields.join(", "),
		};
		try {
			await createDoc("Letter Type", doc);
			made++;
		} catch (e) {
			if (String(e.message).includes("Duplicate")) {
				// Already loaded: update the wording rather than fail the run.
				await updateDoc("Letter Type", stem, {
					template: html, fields_used: fields.join(", "), category,
				});
				made++;
			} else {
				console.log(`      -> ${String(e.message).slice(0, 90)}`);
			}
		}
	}

	console.log(`\n${made} template(s) ${values.apply ? "written" : "converted (dry run)"}, ${skipped} skipped`);
	if (!values.apply) console.log("Re-run with --apply to write them into ERPNext.");
}

main();
