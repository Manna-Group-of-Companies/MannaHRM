/* The answer to every formula on a sheet, saved beside the formula.

   ExcelJS writes a formula and, unless told, no answer. Excel on a desk works
   the sheet out when it opens it — but a file downloaded from the internet
   opens in Protected View, which does not, and neither does a phone, a mail
   preview or Drive. Each of those draws a formula with no saved answer as an
   empty cell, so the register's money columns came out blank on every copy
   HR downloaded from the live site and looked fine on the machine that
   built it.

   So this works the sheet's own formulas out, rather than a second copy of
   each rule in JavaScript that could drift from the formula beside it. It
   knows the functions the registers use and nothing more: a formula it cannot
   read, or one that comes to an Excel error, is left without an answer — the
   cell is blank until Excel recalculates, as before — and never given a guess.
   `fullCalcOnLoad` stays set on the workbook, so Excel still works everything
   out again the moment the sheet is trusted. */

/** "AB" → 28. */
function colNumber(s) {
	let n = 0;
	for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
	return n;
}

function colLetter(n) {
	let s = "";
	for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
	return s;
}

class Unreadable extends Error {}
const fail = (why) => { throw new Unreadable(why); };

const TOKEN = /\s*(?:(\$?[A-Z]{1,3}\$?\d+)|(\d+(?:\.\d+)?)|("(?:[^"]|"")*")|([A-Z][A-Z0-9.]*)(?=\()|(<>|<=|>=|[-+*/%^(),:=<>&]))/y;

function tokenize(src) {
	const out = [];
	TOKEN.lastIndex = 0;
	while (TOKEN.lastIndex < src.length) {
		if (/^\s*$/.test(src.slice(TOKEN.lastIndex))) break;
		const m = TOKEN.exec(src);
		if (!m) fail(`cannot read ${src}`);
		if (m[1]) out.push({ ref: m[1].replace(/\$/g, "") });
		else if (m[2]) out.push({ num: Number(m[2]) });
		else if (m[3]) out.push({ str: m[3].slice(1, -1).replace(/""/g, '"') });
		else if (m[4]) out.push({ fn: m[4] });
		else out.push({ op: m[5] });
	}
	return out;
}

/* Excel's own order: comparison, then &, then + and -, then * and /, then ^,
   then a sign, then %. */
function parse(src) {
	const t = tokenize(src);
	let i = 0;
	const peek = (op) => t[i] && t[i].op === op;
	const take = (op) => { if (!peek(op)) fail(`expected ${op} in ${src}`); i++; };

	const binary = (next, ops) => () => {
		let left = next();
		while (t[i] && ops.includes(t[i].op)) { const op = t[i++].op; left = { op, left, right: next() }; }
		return left;
	};
	const primary = () => {
		const tok = t[i++];
		if (!tok) fail(`unexpected end of ${src}`);
		if ("num" in tok) return { value: tok.num };
		if ("str" in tok) return { value: tok.str };
		if (tok.ref) {
			if (peek(":")) { i++; const end = t[i++]; if (!end || !end.ref) fail(`bad range in ${src}`); return { range: [tok.ref, end.ref] }; }
			return { ref: tok.ref };
		}
		if (tok.fn) {
			take("(");
			const args = [];
			if (!peek(")")) { args.push(compare()); while (peek(",")) { i++; args.push(compare()); } }
			take(")");
			return { fn: tok.fn, args };
		}
		if (tok.op === "(") { const e = compare(); take(")"); return e; }
		return fail(`unexpected ${tok.op} in ${src}`);
	};
	const percent = () => { let e = primary(); while (peek("%")) { i++; e = { op: "%", left: e }; } return e; };
	const sign = () => {
		if (peek("-") || peek("+")) { const op = t[i++].op; return { op: `u${op}`, left: sign() }; }
		return percent();
	};
	const power = binary(sign, ["^"]);
	const product = binary(power, ["*", "/"]);
	const sum = binary(product, ["+", "-"]);
	const concat = binary(sum, ["&"]);
	const compare = binary(concat, ["=", "<>", "<", ">", "<=", ">="]);

	const tree = compare();
	if (i !== t.length) fail(`trailing text in ${src}`);
	return tree;
}

/** A cell's value as arithmetic sees it: empty is 0, text is an error. */
function num(v) {
	if (v === null || v === undefined || v === "") return 0;
	if (typeof v === "number") return v;
	if (typeof v === "boolean") return v ? 1 : 0;
	return fail(`#VALUE! from ${JSON.stringify(v)}`);
}

/* Excel rounds half away from zero; Math.round rounds half up. The small
   nudge keeps 2.675 from coming out 2.67 on a float that is really 2.67499…. */
function round(x, digits) {
	const f = 10 ** digits;
	return (Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9)) / f;
}
function roundUp(x, digits) {
	const f = 10 ** digits;
	return (Math.sign(x) * Math.ceil(Math.abs(x) * f - 1e-9)) / f;
}

/* Text compares without case, as Excel's = does; a number never equals text. */
function equal(a, b) {
	const blank = (v) => v === null || v === undefined || v === "";
	if (blank(a) && blank(b)) return true;
	if (blank(a)) a = typeof b === "string" ? "" : 0;
	if (blank(b)) b = typeof a === "string" ? "" : 0;
	if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
	return a === b;
}

function order(a, b) {
	if (typeof a === "string" || typeof b === "string") return String(a ?? "").toLowerCase().localeCompare(String(b ?? "").toLowerCase());
	return num(a) - num(b);
}

/**
 * Save the answer beside every formula on `ws` that has none. Answers already
 * there are kept: they were worked out by the code that wrote the formula.
 *
 * @param {object} ws an ExcelJS worksheet
 */
export function settleFormulas(ws) {
	const known = new Map();

	const cellsOf = ([from, to]) => {
		const a = /^([A-Z]+)(\d+)$/.exec(from);
		const b = /^([A-Z]+)(\d+)$/.exec(to);
		const out = [];
		for (let r = Math.min(+a[2], +b[2]); r <= Math.max(+a[2], +b[2]); r++)
			for (let c = Math.min(colNumber(a[1]), colNumber(b[1])); c <= Math.max(colNumber(a[1]), colNumber(b[1])); c++)
				out.push(`${colLetter(c)}${r}`);
		return out;
	};

	const valueOf = (address) => {
		if (known.has(address)) {
			const v = known.get(address);
			return v === known ? fail(`circular at ${address}`) : v;
		}
		const raw = ws.getCell(address).value;
		if (raw === null || raw === undefined) return null;
		if (raw instanceof Date) return fail(`a date at ${address}`);
		if (typeof raw !== "object") return raw;
		if (!("formula" in raw)) {
			if ("result" in raw) return raw.result;
			return fail(`${address} holds rich text`);
		}
		if (raw.result !== undefined) return raw.result;
		known.set(address, known);
		try {
			const v = evaluate(parse(raw.formula));
			known.set(address, v);
			return v;
		} catch (e) {
			known.delete(address);
			throw e;
		}
	};

	const evaluate = (e) => {
		if ("value" in e) return e.value;
		if (e.ref) return valueOf(e.ref);
		if (e.range) return fail("a range outside a function");
		if (e.fn) return call(e.fn, e.args);
		switch (e.op) {
			case "u-": return -num(evaluate(e.left));
			case "u+": return evaluate(e.left);
			case "%": return num(evaluate(e.left)) / 100;
			case "^": return num(evaluate(e.left)) ** num(evaluate(e.right));
			case "*": return num(evaluate(e.left)) * num(evaluate(e.right));
			case "/": {
				const d = num(evaluate(e.right));
				return d === 0 ? fail("#DIV/0!") : num(evaluate(e.left)) / d;
			}
			case "+": return num(evaluate(e.left)) + num(evaluate(e.right));
			case "-": return num(evaluate(e.left)) - num(evaluate(e.right));
			case "&": return `${evaluate(e.left) ?? ""}${evaluate(e.right) ?? ""}`;
			case "=": return equal(evaluate(e.left), evaluate(e.right));
			case "<>": return !equal(evaluate(e.left), evaluate(e.right));
			case "<": return order(evaluate(e.left), evaluate(e.right)) < 0;
			case ">": return order(evaluate(e.left), evaluate(e.right)) > 0;
			case "<=": return order(evaluate(e.left), evaluate(e.right)) <= 0;
			case ">=": return order(evaluate(e.left), evaluate(e.right)) >= 0;
			default: return fail(`operator ${e.op}`);
		}
	};

	/* SUM, MIN and MAX skip text and empty cells in a range, as Excel's do. */
	const numbers = (args) => args.flatMap((a) =>
		a.range ? cellsOf(a.range).map(valueOf).filter((v) => typeof v === "number") : [num(evaluate(a))]);

	const call = (fn, args) => {
		switch (fn) {
			case "SUM": return numbers(args).reduce((s, v) => s + v, 0);
			case "MIN": { const v = numbers(args); return v.length ? Math.min(...v) : 0; }
			case "MAX": { const v = numbers(args); return v.length ? Math.max(...v) : 0; }
			case "IF": {
				const test = evaluate(args[0]);
				const yes = typeof test === "string" ? fail("#VALUE! in IF") : Boolean(test);
				if (yes) return evaluate(args[1]);
				return args.length > 2 ? evaluate(args[2]) : false;
			}
			case "ROUND": return round(num(evaluate(args[0])), args[1] ? num(evaluate(args[1])) : 0);
			case "ROUNDUP": return roundUp(num(evaluate(args[0])), args[1] ? num(evaluate(args[1])) : 0);
			case "COUNTIF": {
				if (!args[0].range) return fail("COUNTIF without a range");
				const want = evaluate(args[1]);
				/* A criterion such as ">5" or "SN*" is a rule, not a value; none of
				   the registers write one, so it is refused rather than misread. */
				if (typeof want === "string" && /^[<>=]|[*?~]/.test(want)) return fail("COUNTIF criterion with an operator");
				return cellsOf(args[0].range).filter((a) => { const v = valueOf(a); return v !== null && v !== "" && equal(v, want); }).length;
			}
			default: return fail(`function ${fn}`);
		}
	};

	ws.eachRow({ includeEmpty: false }, (row) => {
		row.eachCell({ includeEmpty: false }, (cell) => {
			const v = cell.value;
			if (!v || typeof v !== "object" || !("formula" in v) || v.result !== undefined) return;
			/* A merged cell's other halves report the master's value; only the
			   master holds the formula. */
			if (cell.isMerged && cell.master !== cell) return;
			try {
				/* A formula pointing at an empty cell shows 0 in Excel, not nothing. */
				const result = valueOf(cell.address) ?? 0;
				if (typeof result === "number" && !Number.isFinite(result)) return;
				cell.value = { formula: v.formula, result: typeof result === "number" ? round(result, 10) : result };
			} catch (e) {
				if (!(e instanceof Unreadable)) throw e;
			}
		});
	});
	return ws;
}
