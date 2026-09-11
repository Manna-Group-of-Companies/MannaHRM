# Who punches on the phone

The seventeen people the app is for, given by Manna on 10 September 2026, and
what has to be true on the site before each of them can punch.

This list exists because the app is **not** for the whole group. It was asked
whether everybody gets it or only some, and the answer was only some — these.
Everyone else's attendance arrives another way, or does not arrive yet, and
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) is where that is argued about rather
than here.

---

## The list, as given

Two columns on the sheet, and **what the split means has not been said**. It is
recorded as given rather than flattened, because thirteen and four is a
distinction somebody drew on purpose and guessing at it is how four people end
up with the wrong role.

| # | Name | Column |
|--:|---|---|
| 1 | Rajiv CS | first |
| 2 | Eapen K Mathew | first |
| 3 | Abhilash MG | first |
| 4 | Pradeep AK | first |
| 5 | Shantu Poulose | first |
| 6 | Sreekumar PS | first |
| 7 | Binuja Karunakaran | first |
| 8 | Ajmal Imthiyas | first |
| 9 | Nikhil Sabu | first |
| 10 | Sunny M.J | first |
| 11 | Ramesh E.N | first |
| 12 | Biju Thomas Den | first |
| 13 | Ajith Vijayan | first |
| 14 | Lijo Aliyas | second |
| 15 | Sijo George | second |
| 16 | Eldhose Kuriakose | second |
| 17 | Ebin Joy | second |

---

## What each of them needs, on the site

The app has no accounts of its own. It signs in to
`mannarubber.m.frappe.cloud` with the person's own ERPNext credentials, and
every punch it writes is logged as them under their own roles — which is the
whole security model (CLAUDE.md §1). So three things, per person, all of them
on the desk and none of them in this repo:

1. **A `User` record**, with the **Employee** role. This is what they type into
   the app.
2. **`Employee.user_id` pointing at that user.** This is the join the app makes
   — it reads the Employee row whose `user_id` is the signed-in session. With it
   blank the app cannot tell who is punching and says so on a card rather than
   showing an empty month, which is deliberate: a punch button that does not
   know whose day it is, is worse than no punch button.
3. **A shift** — `Employee.default_shift`, or a Shift Assignment. The punches
   land either way; without one they never become `Attendance`, because the
   shift job has no window to measure them against. The punch screen says
   *"No shift on your record"* for exactly this, and it is a warning rather
   than a refusal.

And once, for the group: **Shift Type → Enable Auto Attendance**, with
*Process Attendance After* set. Without it the checkins sit there and no day is
ever generated from them. See [SCHEMA.md](SCHEMA.md).

---

## What the fingerprint machine says about them

The seventeen were matched, on 10 September 2026, against the 438 users
enrolled on the Identix at `192.168.1.40` — the roster in
[`data/devices/`](../data/devices/), read on 9 September.

**Sixteen of the seventeen are not on it.** The only genuine match is
**Ebin Joy**, device user `490`. Everything else the matcher offered was a
coincidence of first names against a different person — `Rajiv CS` against
*Rajiv Kumar*, `Sunny M.J` against *paul sunny*, `Eldhose Kuriakose` against
*AJITH ELDHOSE* — and none of them is the same human being.

That is consistent with what Manna said when the list was given: **these people
have no punch machine.** The phone is not a second way in for them, it is the
only one, which is why the app never refuses a punch on its own judgement and
always offers the correction instead.

**It is weak evidence and should not be treated as more.** The names on that
machine were typed by whoever enrolled each person, in whatever case and
spelling they used at the time; a person can be enrolled under a nickname, an
initial, or a payroll number and match nothing. The real check is the `Employee`
record, and that needs credentials — `tools/check_schema.py` is the shape of it.

---

## Still to be answered

- **What the second column is.** Four names were separated from thirteen and
  nobody has said why. If it is *approvers* they need the
  `Manna Attendance Approver` role as well, and their own corrections then need
  somebody else to decide them.
- **Whether these seventeen already have `Employee` records**, and under which
  company. Sixteen are strangers to the fingerprint machine, which says nothing
  either way about the HR master.
- **Who approves their corrections.** A correction raised on the phone lands
  `Pending Approval` and waits. If nobody on this list can approve, the queue
  fills up on the dashboard and the app looks broken from the outside — see
  `manna_hr/workflow.py`.
