# The group, and what to create

Working record of the org structure. **Two lines are unconfirmed** and marked as
such — nothing gets created on the live site until they are settled, because a
Company in ERPNext brings a whole chart of accounts with it and is unpleasant to
remove once anything links to it.

Last updated 22 August 2026.

---

## Target structure

| Company | Source | Action | Status |
|---|---|---|---|
| Manna Rubber Products Private Limited | both | keep as is | confirmed |
| Manna Tyre Retreads | both | keep as is | confirmed |
| Manna Treads | both | keep, **and absorb Hi-Tech Pretreads** | confirmed 22 Aug |
| Hi-Tech Rubber Industries | CMMS only | **create in ERPNext** | confirmed |
| Manna Group H-QTRS | Factor HR only | **create, HR only** | confirmed |
| Manna Tyre UAE | ERPNext only | keep, **own clock** | confirmed |

Six companies when done. Four exist today.

### Hi-Tech Rubber Industries — create

Exists in the CMMS system for maintenance management; never created in ERPNext.
50 rows in the Factor HR master.

### Manna Group H-QTRS — create, for HR only

The headquarters of all the companies combined. One person in Factor HR.

Created as a Company because `Employee.company` is a Link and every person needs
one — **not** because it trades. It should carry no items, no sales, no
purchases. Worth saying out loud in the company's own description field, so the
next person to open it does not start booking against it.

### Hi-Tech Pretreads → Manna Treads — confirmed 22 Aug 2026

**They are the same company.** Hi-Tech Pretreads is not created separately.

So **112 Factor HR rows load into Manna Treads**, joining the 4 already there —
116 people, which makes Manna Treads the second largest employer in the group
rather than the smallest. Worth knowing before anyone reads a headcount report
and assumes it is wrong.

Note that the Factor HR tenant itself is branded HI-TECH PRETREADS, and the
employee codes are `HPT-###`. Those codes stay in `custom_factor_hr_id`
regardless — they are the reconciliation key and must not be rewritten to match
a new company name.

---

## What is still needed before creating anything

Only **two** companies now need creating: Hi-Tech Rubber Industries and
Manna Group H-QTRS.

- **Abbreviation for each.** ERPNext appends it to every account and warehouse
  name (`Production - MT`), and it is hard to change afterwards. Existing ones
  are MRPPL, MT, MTR, MRU. Proposed: **HRI** and **MGHQ** — say if you would
  rather have something else.
- Whether either needs a full chart of accounts, or exists only to hold
  employees. If HR-only, they can be created against a minimal template and
  should carry a description saying so.

---

## Naming, and why it will bite

Factor HR, ERPNext and the sales app spell the same companies three ways:

| Factor HR | ERPNext Company | Sales Person `custom_company` |
|---|---|---|
| MANNA RUBBER PRODUCTS PVT.LTD. | Manna Rubber Products Private Limited | — |
| MANNA TREADS PVT.LTD | Manna Treads | Manna Treads |
| MANNA TYRE RETREADS | Manna Tyre Retreads | Manna Tyre Retreads |
| — | Manna Tyre **UAE** | Manna **Tyres** UAE |

None of these join on a string match. The import maps them explicitly, from a
table, and anything not in the table stops the import rather than guessing —
a guessed company is a person in the wrong payroll.
