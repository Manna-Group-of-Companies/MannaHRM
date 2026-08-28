# What the Factor HR exports actually contain

Read from the nine reports in `data/factohr/` on 22 August 2026. Counts only —
no personal data is reproduced here, and the exports themselves are gitignored.

Reproduce with `python tools/analyse_factohr.py`.

---

## 1. Headcount

**504 people in the master. 160 active, 344 inactive.**

That last number is the useful one: two thirds of the file is leavers. The live
workforce is 160, which is far smaller than the raw file suggests and changes
the plan — this is a small enough group to migrate carefully rather than in
bulk.

| Company (as Factor HR spells it) | Rows | In ERPNext? |
|---|---|---|
| MANNA RUBBER PRODUCTS PVT.LTD. | 306 | yes — *Manna Rubber Products Private Limited* |
| **HI-TECH PRETREADS** | 112 | **no** |
| **HI-TECH RUBBER INDUSTRIES** | 50 | **no** |
| MANNA TYRE RETREADS | 31 | yes |
| MANNA TREADS PVT.LTD | 4 | yes — *Manna Treads* |
| **MANNA GROUP H-QTRS** | 1 | **no** |
| — | — | |
| *(absent from Factor HR)* | — | **Manna Tyre UAE** exists in ERPNext only |

**The two systems disagree about what the group is.** Three companies overlap.
Factor HR has three that ERPNext does not; ERPNext has one that Factor HR does
not.

This is the first thing to settle. Three of them — Hi-Tech Pretreads, Hi-Tech
Rubber Industries and Manna Group H-QTRS — account for **163 of the 504 rows**,
and no ERPNext Company exists to put them in. Nothing else can be loaded until
somebody says whether those are legal employers, cost centres, or historical
names.

## 2. The biometric machine codes exist

The field is called **`Machine Code`** on the employee master, and it is the
`attendance_device_id` equivalent — the join between a fingerprint template and
a person.

| | |
|---|---|
| Active employees | 160 |
| **Have a Machine Code** | **139** |
| Missing one | 21 |
| Duplicate codes among active staff | **none** |

Every code is unique, which is the thing that could have gone wrong and did not.
A shared code would mean two people's punches were indistinguishable, and no
amount of care afterwards recovers that.

The 21 without a code, by company: Hi-Tech Pretreads 9, Manna Rubber Products 7,
Manna Tyre Retreads 3, Manna Group H-QTRS 1, Manna Treads 1. Some will be office
staff who punch on the phone; the rest need enrolling. **A blank here is silent
— that person simply looks absent every day.**

## 3. Shifts — 23 of them, and some are long

The active workforce runs on **23 distinct shifts**. The largest:

| Shift | People |
|---|---|
| Manna Rubber Products — Production 8h | 36 |
| Manna Rubber Products — Production 12 | 25 |
| Hi-Tech Pretreads — Production shift1 | 23 |
| Hi-Tech Rubber Industries — Production shift | 13 |

Among the rest are **`Production24hr shift`, `Production22hr shift`,
`Production12hr shift`**, a `Driver shift`, a `Cook shift`, and an
`Other location` shift.

A 22- and 24-hour shift is not a person working 24 hours; it is almost certainly
a *rotating* pattern or a window inside which any 8 hours count. **Which of the
two it is changes the entire auto-attendance configuration**, and it cannot be
guessed from the name. These need to be walked through one by one.

The one confirmed timing, from the Daily Attendance Detail report: Manna Treads
Office shift runs **09:30–18:30**, and a 09:36 punch is recorded as `Late Coming
By 00:06` while the day still counts as Full Day. So late is measured to the
minute with no grace, and being late does not by itself cost the day.

## 4. Uniform where it helps

Across all 160 active employees:

- **Week-off: Sunday — 100%.** No exceptions. This matches the sales system's
  assumption and one Holiday List rule can cover the group.
- **Employment type: Permanent — 100%.**
- **Payroll group: General Monthly — 100%.**

Departments are concentrated: **Production 120 of 160 (75%)**, then Maintenance
8, Finance & Accounts 7, Logistics 7. Fifteen departments in use against the 53
already sitting in ERPNext — worth pruning rather than mapping onto.

Six active employees have **no Reporting Manager**, which matters because that
field decides who approves their corrections.

## 5. The two punch streams, confirmed

Both come out of one report — `rptInOutActivitiesSelfiePunch` — and differ only
in which columns are filled. That is the same single-funnel design as
`Employee Checkin`, which is why the mapping is clean.

| | Biometric | Mobile |
|---|---|---|
| `Terminal` | `Manna_Rubber_Products` | *blank* |
| `Location` | *blank* | a street address |
| `Punch Info` | *blank* | `Loc Acc`, `Device Info`, `Latitude`, `Longitude` |
| Selfie | none | **an embedded image per punch** |

The mobile export carried 35 embedded images for 34 punches — roughly 14 KB
each. So the selfie is real and it is stored, and at 160 people it is on the
order of 5 MB a day.

`Punch Info` also carries **GPS accuracy** (`Loc Acc: 22.7 m` in the samples) and
the handset model. Accuracy is the more useful of the two: a geofence that
ignores it refuses honest punches made indoors, and the sample values here sit
around 20 m, which is good.

Only one terminal name appears — `Manna_Rubber_Products` — but that is one
sample report from one company. **The full device list is still needed.**

## 6. Regularization — the model we should copy

The report carries 36 columns, and the design is worth taking:

`Original In` · `Original Out` · **`AR In`** · **`AR Out`** · `AR Hours` ·
`Day Status` · `Reason` · `Remarks` · `Initiated By` · `Current Status` ·
`Last Action By` · `Last Action On`

The original punch is **never overwritten**. The corrected time sits beside it in
its own column, and the row records who asked, who decided, and when. The
observed reason is a picked value — *"Forgot to Punch"* — not free text, with
remarks alongside.

It also carries `Break Out` / `Break In` (and their AR equivalents), an
`Exemption Type`, and `Overtime Duration`, `Late Coming Duration`,
`Early Going Duration` per row.

**Breaks are tracked.** Nothing in the current design accounts for them, and
`Personal Break Duration` appears as its own column on the daily report —
separate from `Break Duration`. Two kinds of break, counted differently.

## 7. Leave

Types seen: `Casual Leave`, `Leave Without Pay`. Half days are first-class —
`Leave Value` is `First Half Day` / `Second Half Day` with `Total Leave` of 0.5.
Each row carries the `Leave Balance` at the time, an `Approval Status`
(`Initiated`, `Approved`), `Last Action By`, and separate `Remarks` and
`Approval Remarks`.

`Leave Availed Days` and `Leave Availed Dates` are populated only once approved.

Frappe HR's leave ledger covers all of this and covers it well. No custom work
expected here.

---

## What this changes in the plan

1. **The company question is now blocking**, not a curiosity. 163 rows have
   nowhere to go.
2. **The biometric leg is viable** — the codes exist and are unique. 21 gaps to
   close, which is an afternoon's work, not a project.
3. **Shifts are the real complexity**, not headcount. 23 patterns for 160 people,
   including several that need explaining before they can be configured.
4. **Breaks need designing in.** They were not in the original plan and they
   affect worked hours, which affects pay.
5. **160 active people is small.** A careful, verified migration is affordable
   here in a way it would not be at 2,000.
