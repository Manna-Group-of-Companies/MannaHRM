import { Cols, Empty, NoteBelow, Panel, SpecTable, Tile, Tiles } from "@/components/ui";
import { dmy, fmt } from "@/lib/format";
import { useApp } from "@/state/store";
import { assetRows, assetsUnread, onboardWait } from "./shared";

const CARRIES = [
	["Asset", "Link &rarr; Asset", "stock", ""],
	["Employee", "custodian on Asset, set by Asset Movement", "stock",
		"One holder at a time, and the history says who held it before"],
	["Issued on / returned on", "Asset Movement transaction date", "stock",
		"Purpose: Issue, Transfer, Receipt"],
	["Location", "Link &rarr; Location", "stock",
		"Where it went, for the things that are not carried by a person"],
	["Acknowledgement", "Attach or check", "build",
		"A handover the employee has signed. Nothing stock records that they agreed to hold it"],
	["Condition on issue and return", "Small Text", "build",
		"The argument on separation is always about condition, not about whether it was issued"],
	["Return on separation", "Employee Separation activity", "stock",
		"Stock Frappe HR checklist &mdash; but only if separations are run in the system"],
	["Recovery from final settlement", "Payroll", "build",
		"Deferred with the rest of payroll. Note it now: an unreturned asset that nobody deducts for is the whole point of the register"],
];

export default function AssetAssign() {
	const s = useApp();
	const rows = assetRows(s);
	const held = rows.filter((a) => a.custodian);
	const moves = s.assetMoves;

	const byPerson = new Map();
	held.forEach((a) => {
		const k = a.custodian;
		const l = byPerson.get(k) || [];
		l.push(a);
		byPerson.set(k, l);
	});

	return (
		<>
			<div className="legend">
				<b className="font-display">Assets Assignment</b>
				<span className="cov none">Never screenshotted</span>
				<span>
					Who is holding what. In ERPNext this is the asset’s <code>custodian</code>, moved by an{" "}
					<code>Asset Movement</code> — so the register and the assignment are one record, not two
					lists to reconcile.
				</span>
			</div>

			<Cols>
				<Panel title="Issued to employees" cov={s.assetErr ? "none" : held.length ? "live" : "part"} ico="🤝">
					{assetsUnread(s, "assignments") || (held.length ? (
						<>
							<Tiles>
								<Tile k="Assigned" n={fmt(held.length)} s={`of ${fmt(rows.length)} assets`} />
								<Tile k="People holding" n={fmt(byPerson.size)} />
								<Tile k="Unassigned" n={fmt(rows.length - held.length)} cls="warn"
									s="in store or unallocated" />
							</Tiles>
							<div className="mt-[.7rem] rows">
								{[...byPerson.entries()]
									.sort((a, b) => b[1].length - a[1].length)
									.map(([emp, list]) => {
										const e = s.byName[emp];
										return (
											<div className="row" key={emp}>
												<span>
													{e ? e.employee_name : emp}{" "}
													<span className="muted">{e?.employee_number || emp}</span>
												</span>
												<span className="val">{list.length}</span>
												<span className="col-[1/-1] text-[.8rem] text-ink-3">
													{list.map((a) => a.asset_name || a.name).join(", ")}
												</span>
											</div>
										);
									})}
							</div>
						</>
					) : (
						<Empty title="Nothing is assigned">
							{rows.length
								? `${fmt(rows.length)} assets are registered and none of them names a custodian.`
								: "The asset register is empty, so there is nothing to assign yet."}{" "}
							Whether Factor HR holds handovers at all is unknown — the screen has never been
							opened.
						</Empty>
					))}
				</Panel>

				<Panel title="Movement history" cov={moves.length ? "live" : "part"} ico="🔁">
					{onboardWait(s, "the movement history") || (moves.length ? (
						<>
							<div className="rows">
								{moves.slice(0, 25).map((m) => (
									<div className="row" key={m.name}>
										<span>
											{m.purpose || "Movement"} <span className="muted">{m.name}</span>
										</span>
										<span className="val">{dmy(m.transaction_date)}</span>
									</div>
								))}
							</div>
							<NoteBelow>
								<b>Which asset moved to whom is in the child rows</b>, and this page reads lists
								rather than documents — open the movement in ERPNext for the detail.
							</NoteBelow>
						</>
					) : (
						<Empty title="No movements recorded">
							Asset Movement is what makes an assignment auditable: who had it, from when, and
							whether it came back. Empty means nothing has been issued through ERPNext yet.
						</Empty>
					))}
				</Panel>
			</Cols>

			<Cols>
				<Panel title="What an assignment should carry" cov="part" ico="📋">
					<SpecTable cols={["Field", "Where it lives", "State", "Note"]} list={CARRIES} />
					<NoteBelow>
						<b>Two of eight need building</b>, and both are about a person agreeing rather than a
						thing moving. Everything else is stock and switched off rather than absent.
					</NoteBelow>
				</Panel>
			</Cols>
		</>
	);
}
