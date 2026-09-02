# Setup runbook

In order. Each step says **who** does it, because the first few cannot be done
from code and are the gate on everything after them.

---

## 0. ~~Restore API access~~ — done 22 Aug 2026

*Resolved: a new key was issued and works.* Original note kept below.

The Composio ERPNext connector authenticated
as `integration@mannarubber.com` and every call now returns `401
AuthenticationError`, on both connected accounts. The key was rotated, revoked,
or the user was disabled.

Until this is fixed nobody can read or write the site through the API — which
also means the field-sales app and the sales dashboard are either already broken
or running on separate credentials that will expire the same way.

To fix: Desk → **User** → `integration@mannarubber.com` → *API Access* →
**Generate Keys**, then give the new API key and secret to whoever administers
the Composio connection.

Check it is fixed: the account should answer `frappe.handler.ping`.

---

## 1. Move the site to a private bench — *Manna*

Done: the site plan was upgraded to the $25 tier (₹2,050) on 22 August 2026, and
Frappe HR is installed. The plan upgrade makes the site **eligible** for a
private bench; it does not by itself enable Server Scripts.

**A bench group costs nothing.** Frappe Cloud bills per site, not per bench, and
the $25 is already being paid. This is a capability already bought and not yet
switched on.

### The short path — one button, not two jobs

You do not create a bench group first. The site page does it for you.

1. Frappe Cloud dashboard → **Sites** → `mannarubber.m.frappe.cloud`.
2. A banner appears offering **Move to Private Bench**. (If it still says
   *Upgrade Plan*, the plan change has not registered yet.)
3. Click it. A dialog opens with the settings pre-filled — it carries the site's
   current apps across. Accept the defaults unless you specifically want a
   different region or an existing bench.
4. Confirm. A progress page tracks the migration.

**Server Scripts switch on by themselves** once the move completes. There is no
config key to set and no restart to request.

### Before pressing it

- **Do it outside working hours.** The move is a backup and restore, so the site
  goes away for a while. Reps punch out in the evening; a migration at 5pm is a
  migration people notice.
- **Take a backup first** anyway. Site → Backups.
- **Check the app list in the dialog** carries all four: `erpnext`, `hrms`,
  `india_compliance`, `email_delivery_service`. A bench missing one the site
  uses will fail the restore.
- **Do it before loading employees.** Today there are 0 employees and 0 punches
  in Frappe HR, so a failed migration costs nothing. That stops being true the
  moment 160 people start punching.

### What you take on

Updates become yours. On shared hosting Frappe deploys for you; on a private
bench you choose when. That is the control you wanted, and it is also a job —
a bench nobody deploys for a year is a bench behind on security patches.

## 2. ~~Install Frappe HR~~ — done 22 Aug 2026

Installed and verified: **hrms 16.16.0**, with `Employee Checkin`, `Shift Type`,
`Attendance`, `Leave Application` and `Salary Structure` all present and empty.

Kept below because the reasoning still matters for the second site, if the UAE
ever gets one.

**It does not need a private bench.** Frappe HR is one of the 20-odd
Frappe-maintained apps included with shared hosting, alongside ERPNext and
Frappe CRM. A private bench buys access to the wider third-party marketplace and
to custom apps — neither of which `hrms` is.

So this is the first real step and nothing else gates it.

This is a Frappe Cloud dashboard action; it cannot be done over the REST API.

> Frappe Cloud → your site → **Apps** → **Add App** → *Frappe HR* → Install.
> On a private bench, add `hrms` to the bench group first, then to the site.

Verify: `Employee Checkin` and `Shift Type` appear in Desk's DocType list.

**Take a backup before this.** Installing hrms adds a large number of doctypes
and a fixed set of Leave Types. It is not destructive, but it is not a thing to
do at 5pm on a Friday either.

---

## 3. Install `manna_hr` — *us, once 1 and 2 are done*

> **The `manna_hr` app is no longer in this repo** — removed 31 August 2026, when
> everything here became JavaScript. The commands below therefore have nothing
> to install yet, and are kept because the step is still required and the shape
> of it has not changed. See [ENFORCEMENT.md](ENFORCEMENT.md) for what has to be
> rebuilt, and the root [README](../README.md) for what moved where.


```bash
bench get-app https://github.com/Manna-Group-of-Companies/MannaHRM --branch main
bench --site mannarubber.m.frappe.cloud install-app manna_hr
bench --site mannarubber.m.frappe.cloud migrate
```

On Frappe Cloud the equivalent is: add the repository to the bench group as an
app, deploy the bench, then install onto the site from the dashboard.

`manna_hr` creates its own doctypes and custom fields on install — see
[SCHEMA.md](SCHEMA.md). It does not touch anything the sales apps use.

---

## 4. Master data — *Manna supplies, we load*

In this order; each depends on the one before.

1. **Companies.** Already exist. We need the exact list and which are real
   employers versus trading names — an employee belongs to one `Company`, and
   that choice follows them into payroll.
2. **Holiday List**, one per company. Kerala holidays differ from the others,
   and a factory's list differs from an office's.
3. **Department**, **Designation**, **Branch**, **Grade**.
4. **Employee**, everyone, every company. From the Factor HR export.
   - `attendance_device_id` **must** be set for anyone who punches on a machine.
     It is the only link between a fingerprint template and a person.
   - `company`, `date_of_joining`, `holiday_list`, `default_shift`.
5. **Work Location** (ours) — one per gate/office, with coordinates and radius.
6. **Shift Type**, per company or per pattern. See [SCHEMA.md](SCHEMA.md) §4 for
   the settings that matter and the night-shift trap.
7. **Shift Assignment**, per employee.

---

## 5. Bridge the fingerprint machines — *us, needs access*

`bridge/` polls each device and posts punches to `Employee Checkin`.

It has to run **inside your network**. `mannarubber.m.frappe.cloud` cannot
reach a factory LAN, so the bridge runs on a small always-on box at each
location — a mini PC or a Raspberry Pi — or on one box that reaches every site
over VPN.

Needed before this can start:
- Device make and model, per location. It must speak the ZK protocol.
- Device IP addresses and ports, and whether a comm key is set.
- One machine per location that stays on, or the VPN details.

See [bridge/README.md](../bridge/README.md).

---

## 6. Apps — *us*

- Phone: check-in with GPS, leave requests, payslips. Either extends the
  existing Flutter app or is new; see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).
- Web: HR and manager dashboards. Most of this exists already in
  `SALES_DASHBOARD/client/src/features/hr/` and is repointed rather than
  rewritten.

---

## 7. Run alongside Factor HR for one cycle — *both*

Do not cut over on a payroll boundary with no comparison. Run one full month
with both systems recording, then reconcile employee by employee before Factor
HR is switched off. Attendance disputes are found by people, not by tests.
