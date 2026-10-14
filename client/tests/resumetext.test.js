import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { jsPDF } from "jspdf";

import { docxText, kindOf, pdfText, resumeText, wordXmlText } from "@/lib/resumetext";
import { readContact } from "@/lib/resumescore";

/* A resume file → its text — lib/resumetext.js. Real files, made here: a
   Word document is a zip of XML, and a PDF is made by the jsPDF this app
   already ships. */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const para = (...runs) => `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${runs.map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join("")}</w:p>`;

async function docx(body, header = "") {
	const zip = new JSZip();
	zip.file("[Content_Types].xml", "<Types/>");
	zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`);
	if (header) zip.file("word/header1.xml", `<?xml version="1.0"?><w:hdr xmlns:w="${W}">${header}</w:hdr>`);
	return zip.generateAsync({ type: "uint8array" });
}

const fileOf = (name, bytes) => ({ name, size: bytes.byteLength, arrayBuffer: async () => bytes });

describe("a Word resume", () => {
	it("reads the words, a line per paragraph, and the header before the body", async () => {
		const bytes = await docx(
			para("Work Experience") + para("Fitter, ", "Jan 2019 - Present"),
			para("Priya Nair") + para("priya.nair@example.com"),
		);
		expect(await docxText(bytes)).toBe("Priya Nair\npriya.nair@example.com\nWork Experience\nFitter, Jan 2019 - Present");
	});

	it("keeps nothing but the text — a drawing's offsets are not a phone number", () => {
		const xml = `<w:p><w:r><w:drawing><wp:posOffset>9847012345</wp:posOffset></w:drawing><w:t>Skills</w:t></w:r></w:p>`;
		expect(wordXmlText(xml)).toBe("Skills");
	});

	it("unescapes the XML", () => {
		expect(wordXmlText("<w:p><w:r><w:t>R&amp;D &lt;QA&gt; &#8211; ok</w:t></w:r></w:p>")).toBe("R&D <QA> – ok");
	});
});

describe("a PDF resume", () => {
	it("reads its lines in order, and the contact off the top", async () => {
		const pdf = new jsPDF();
		pdf.text("Anil Kumar", 10, 10);
		pdf.text("anil@example.com  +91 98470 12345", 10, 20);
		pdf.text("Work Experience", 10, 30);
		pdf.text("Jan 2018 - Present", 10, 40);
		const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
		const text = await pdfText(new Uint8Array(pdf.output("arraybuffer")), lib);
		expect(text.split("\n")).toEqual(["Anil Kumar", "anil@example.com +91 98470 12345", "Work Experience", "Jan 2018 - Present"]);
		expect(readContact(text, "Profile.pdf")).toEqual({ name: "Anil Kumar", email: "anil@example.com", phone: "+91 98470 12345" });
	}, 30000);
});

describe("any file", () => {
	it("knows the kind by the name, whatever the case", () => {
		expect(["a.PDF", "b.docx", "c.txt", "d.doc", "e.jpg"].map(kindOf)).toEqual(["pdf", "docx", "txt", "doc", ""]);
	});

	it("says why it cannot read an old .doc or an image, and never throws", async () => {
		expect((await resumeText(fileOf("old.doc", new Uint8Array(4)))).error).toMatch(/\.doc/);
		expect((await resumeText(fileOf("scan.jpg", new Uint8Array(4)))).error).toMatch(/Not a PDF/);
		expect((await resumeText(fileOf("broken.docx", new Uint8Array([1, 2, 3])))).error).toMatch(/Could not be read/);
	});

	it("reads a Word file it is handed as a file", async () => {
		const got = await resumeText(fileOf("cv.docx", await docx(para("Rahul Menon"))));
		expect(got).toEqual({ text: "Rahul Menon", error: "" });
	});
});
