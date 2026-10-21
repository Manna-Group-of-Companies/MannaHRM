# The HRDashboard reference, view by view

What the client is being rebuilt to be, and where each view's data lives on
the site. Read off the reference and checked against the live site on
21 October 2026. **Nothing here is built yet.** This is the plan Step 1 asked
for. The rows marked **decide** or **⛔** wait on an answer.

- **The reference** is `docs/design/hrdashboard-reference.html`, one file
  holding its CSS and its script. It came from `Downloads`, and the copy at the
  root of the main checkout is the same file (same SHA-256). It loads Google
  Fonts and one QR-code library from cdnjs, keeps everything else in one
  `localStorage` key, and makes no other network calls.
- **Its pictures** are made by `npm run refshots` in `client/`, using the view
  list in `client/scripts/refroutes.mjs`. The run covers 97 routes and 37
  popups, drawers and modals, light and dark, at 1440 and 390 wide. Each view
  is a fresh load, so only its own menu group is open, and a long page gets one
  more picture per screenful. That makes 862 pictures and 63 MB, which land in
  `docs/design/reference-shots/`, named `<view>__<light|dark>__<1440|390>.png`.
  Git ignores that folder, because this repo is what `bench get-app` clones
  onto the site.
- **The Figma kit** (`rw2wFC3TBfQ1ioG4Mtbv8B`) comes second. Its 135 frames are
  flattened pictures with no variables, and this account's Figma plan has run
  out of tool calls for now.
- **Layout, not figures.** The reference makes up its numbers and ours reads the
  site, so a comparison is of layout, type, colour, spacing and motion.

## How the reference is put together

| | |
|---|---|
| Routing | `#/view/param/param`; about 95 addresses (below) |
| Data | one object, `S`, seeded with 28 people at Unpixel Studio and saved to `localStorage['hrms-full-v1']` |
| Theme | `data-theme` on `<html>`, falling back to `prefers-color-scheme` |
| Shell | 260 px side menu: green Dashboard button, seven groups with their pages, Help Center with a badge, Setting, and a Light/Dark switch. Below that, a top bar: search on `/`, Documents · News · Payslip · Report, the notification and message popups, and the account menu. On a phone the side menu becomes a drawer and a five-button bottom bar appears |
| Shared pieces | modal and drawer (a bottom sheet on a phone), confirm, toast with Undo, dropdown menu, sliding tabs, table with a pager (cards on a phone), stepper, line, bar and donut charts, stars, switch, upload drop zone, empty state, skeleton |
| Keys | `/` search · `?` shortcuts · `g` then a letter (d e t a p r n o m s c h x) · `n` adds the page's thing · Esc · Enter on a row |
| Breakpoints | 1280, 1200, 980, 880 (the menu becomes a drawer), 640 (sheets and card tables), 380 |

## Status

- **live**: a doctype on the site holds it, and the page is built on real data.
- **ours**: a page of ours already does this work. The reference's view takes
  over its job and keeps its data, rules and permissions.
- **partial**: a doctype holds most of it. The fields with nowhere to live
  are named in the row.
- **decide**: needs your answer. The D-number is in the list at the end.
- **⛔**: nothing on the site can hold it. Under your brief it runs on sample
  data **only** with `VITE_KIT_SAMPLE=on`, and never in a build anybody uses,
  until you decide.

## Addresses

Ours is `/module/page`. The reference has records and tabs below a page: one
employee's Job tab, one job's pipeline, one person's slip for a month. Those
are written `/module/page/<record>/<view>` below, which needs **D1**.

Every address we have today keeps working. Where a reference view and an
existing page are the same job, the reference's view takes the page's address
and keeps what the page does (**D2**).

---

## The views

### Sign-in and set-up (no side menu)

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `signin` | any address while signed out | User, Frappe's own sign-in | ours |
| `signin`, wrong email | same | the site's "Invalid login credentials" | ours |
| `signup` | `/login/signup` | User. The site has sign-up **switched off** (`disable_signup = 1`) | decide D9 |
| `forgot` | `/login/forgot` | User (`reset_password` emails a link) | live |
| `otp` | — | The reference sends a 4-digit code to reset a password. Frappe sends a link, and its two-factor sign-in is off | decide D9 |
| `newpass` | `/login/newpass` | User (`update_password` with the key from the link) | live · D9 |
| `resetok` | same, done | — | live |
| `ob/1` to `ob/4`: company, industry, role, reasons | — | Company, which has the six already, and `domain` for an industry. Size, role and reasons have no field | ⛔ D10 |

### Dashboard

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `dashboard`, layout 1 | `/dashboard` (today Start Up) | Employee, Job Applicant, Leave Application, Salary Slip, ToDo, Work Location | live · D2 · D16 |
| `dashboard`, layout 2 | same, layout chosen per person | same, plus Job Opening | live |
| attention banner | same | Leave Application (Open), Salary Slip (draft), ToDo (overdue) | live |
| Team Performance chart | same | the reference's is random. Nothing on the site rates teams by month | decide D16 |
| welcome popup | same | remembered per person, like the rail's open or closed state | live |
| skeleton while loading | every page | — | live |

### Employees

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `employees`: table, filter drawer, sort, bulk status, CSV | `/employees` (today Employee Master) | Employee, Department, Designation, Work Location | ours · D2 |
| new profile, three steps | `/employees/new` (Create Employee) | Employee with this site's required fields, Salary Structure Assignment, Leave Allocation | ours |
| `emp/<id>/general` | `/employees/profile/<employee>/general` | Employee: name, gender, birth date, marital status, contacts, address, emergency contact | ours · D1 |
| `emp/<id>/job` | `…/job` | Employee (department, designation, reports_to, employment type, joining date, work location, shift), Leave Allocation, and the Internal Work History table | ours |
| `emp/<id>/payroll` | `…/payroll` | Salary Structure Assignment (base), Employee bank fields, Salary Slip | ours |
| `emp/<id>/documents` + upload | `…/documents` | Employee Document (ours), File, kept private | ours |
| `emp/<id>/setting`: email, role, 2FA, active | `…/setting` | User linked to the Employee (role, enabled). 2FA is site-wide | partial · D8 |
| status pill: Active / Onboarding / Offboarding | profile | worked out from Employee Onboarding and Employee Separation; Employee's own status is Active / Inactive / Suspended / Left | live |
| Remove | — | Frappe will not delete an Employee that anything links to | decide D11 |
| `directory` | `/employees/directory` (hidden since 25 Sep) | Employee, Department | ours · D15 |
| `orgchart`: zoom, collapse, pan | `/employees/orgchart` (hidden) | Employee `reports_to` | ours · D15 |

### Checklist

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `todo`: tabs, quick add, new task | `/checklist` | ToDo (15 on the site): description, priority, date, allocated_to, status | live |
| `todo/<id>` with subtasks | `/checklist/todo/<todo>` | ToDo has no subtasks | partial · D12 |
| `onboarding` | `/checklist/onboarding` | Employee Onboarding (3) | live |
| `offboarding` | `/checklist/offboarding` | Employee Separation (0) | live |
| `checklist/<id>`: one person's tasks | `/checklist/list/<onboarding or separation>` | its Activities, each a Task | live |
| `checklist-settings` | `/checklist/settings` | Employee Onboarding Template, Employee Separation Template (0 each) | live |
| `template/<id>` | `/checklist/template/<template>` | the template's Activities (owner, days from start) | live |

On Board (`/onboard`, the employee's Google Form, with Letters, Documents and
Assets) is a different job and stays.

### Time Off (our `leave` module)

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `timeoff-me` | `/leave/mine` | Leave Allocation and Leave Application of the signed-in person's Employee | decide D3 |
| `timeoff-team`, list | `/leave/team` | Leave Application. Open is Pending; approving goes through our Approvals code | ours |
| `timeoff-team`, calendar | same | Leave Application, Holiday List | live |
| leave request modal | everywhere | Leave Application, raised as an Open draft (today Apply Leave, `/leave`) | ours |
| leave detail drawer | everywhere | Leave Application | live |
| `timeoff-emp` | `/leave/employees` (today Leave Balance Report) | Leave Allocation, Leave Ledger Entry | ours |
| `timeoff-settings/holidays` | `/leave/settings/holidays` (today Employees → Calendar) | Holiday List (1), Holiday List Assignment | ours |
| `timeoff-settings/types` | `/leave/settings/types` | Leave Type (5) and Leave Policy (1). Leave Type has no colour, so one is assigned by name | live · D17 |

### Attendance

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `att-me` and Check in / Check out | `/attendance/mine` | Employee Checkin from a browser, for the signed-in person's Employee | decide D3 |
| Edit paid time | everywhere | Employee Attendance Regularization, which writes the missing punch. **Never `Attendance`** (CLAUDE.md §5) | ours |
| `att-team` | `/attendance/team` | Attendance, Employee Checkin, Shift Assignment (today Monthly Summary and Daily Detail) | ours |
| `att-emp` | `/attendance/employee` | Attendance, Employee Checkin, Employee Overtime | ours |
| `att-settings/general`: start, end, late minutes | `/attendance/settings/general` | Shift Type (29): `start_time`, `end_time`, `late_entry_grace_period`. Remote, selfie and auto-out have no single home | partial · D13 |
| `att-settings/location` | `/attendance/settings/location` | Work Location (ours): latitude, longitude, radius | ours |
| `att-settings/qr` | — | nothing punches by QR code | ⛔ |

### Payroll

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `payroll`: month, net pay, Pay / Pay all | `/payroll/employees` | Salary Slip, Additional Salary (bonus, allowance, deduction), Payroll Entry. Pay goes through our Payroll page's run. Company logins cannot change pay | ours · D14 |
| `payslip/<employee>/<month>` | `/payroll/slips/<employee>/<YYYY-MM>` | Salary Slip (today Payslips) | ours · D1 |
| `payroll-settings/general`: currency, tax %, insurance %, OT rate | `/payroll/settings/general` | Payroll Settings. *Attendance* there is what makes an absent day a salary cut. PF and ESI are our Salary Setup's, not one tax rate | decide D6 |
| `payroll-settings/cycle`: payday, cut-off, first date | — | nothing holds a payday or cut-off. Payroll Period is a date range | ⛔ D6 |

### Performance

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `performance`: reviews by status, start a review, review drawer with stars and goals | `/performance` | Appraisal Cycle, Appraisal, Goal / KRA, Employee Performance Feedback. All are on the site, all empty; hrms wants a cycle and a template before the first review | decide D7 |

### Recruitment

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `jobs`: cards, funnel, status menu | `/recruitment` | Job Opening (2). Its status is Open / Closed; the reference also has On hold and Draft | partial · D5 |
| `job/<id>/pipeline`, drag between stages | `/recruitment/job/<opening>/pipeline` | Job Applicant (3). Its status is a fixed list; the reference's stages are HR's own | decide D5 |
| `job/<id>/table` | `…/table` | Job Applicant | live |
| `job/<id>/activity` | `…/activity` | Comment, Version | live |
| `job-new`: three steps | `/recruitment/new` | Job Opening, Designation, Department. Step 2 is the stages | live · D5 |
| `candidates`, add one, bulk CVs | `/recruitment/candidates` | Job Applicant, Job Applicant Source (6), File (private). Bulk CVs reuse the Resumes panel's code | ours |
| `applicant/<id>/profile`: tags, notes, CV | `/recruitment/applicant/<applicant>/profile` | Job Applicant, Tag | live |
| `applicant/<id>/evaluation`: four stars | `…/evaluation` | Job Applicant `applicant_rating`; Interview Feedback when there was an interview | partial |
| `applicant/<id>/email` | `…/email` | Communication sent through the site's Email Account, and Email Template (7). **Sends real mail** | live |
| `applicant/<id>/activity` | `…/activity` | Comment, Version | live |
| Create profile from a hired applicant | `/employees/new`, pre-filled | Employee from Job Applicant | live |
| `recruit-settings/workflow` | `/recruitment/settings/workflow` | the stages | decide D5 |
| `recruit-settings/tags` | `…/tags` | Job Applicant Source, Tag | live |
| `recruit-settings/email` | `…/email` | Email Template | live |

The Resumes button on the Hierarchy Chart (12 October) stays, and opens the
same applicants.

### Documents

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `documents`: folders | `/documents` | File, folders (`is_folder`) | live |
| `folder/<id>`: files, upload, rename, move | `/documents/folder/<folder>` | File, kept private | live |
| share a folder: people or everyone, viewer or editor | same | DocShare (`read`, `write`, `everyone`) | live |
| folder colour | — | no field, so it comes from the name | live |

### News

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `news`: categories, search, pinned first | `/news` | Manna Announcement (ours). It has kind, title, company, published, dates, body and posted by, but no category beyond Announcement / CEO Speak, and no pin | partial · D4 |
| `news/<id>` | `/news/item/<id>` | same | live |
| `news/<id>/edit`, `news-new` | `/news/item/<id>/edit`, `/news/new` | same | live |

Dashboard → Announcements & CEO Speak, the record page for the same doctype,
stays.

### Reports

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `reports`: eight tiles | `/reports` (today All Reports, which stays as a section of it) | — | ours |
| `report/headcount` | `/reports/headcount` | Employee | live |
| `report/onboarding` | `/reports/onboarding` | Employee `date_of_joining`, Employee Onboarding | live |
| `report/offboarding` | `/reports/offboarding` | Employee `relieving_date`, Employee Separation | live |
| `report/balance` | `/reports/balance` | Leave Allocation, Leave Ledger Entry | live |
| `report/pipeline` | `/reports/pipeline` | Job Applicant, Job Opening, Job Applicant Source | live |
| `report/data`: age, gender, birthdays | `/reports/data` | Employee `date_of_birth`, `gender` | live |
| `report/schedule`: the next 30 days | `/reports/schedule` | Leave Application | live |
| `report/turnover` | `/reports/turnover` | Employee joining and relieving dates | live |

### Settings

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| `settings/company` | `/settings/company` | Company (6): name, email, phone, website, description. The reference has one company; this site has six | live |
| `settings/office` | `/settings/office` | Work Location (ours). Branch holds no rows | ours |
| `settings/department` | `/settings/department` | Department (101). It has no head field | partial |
| `settings/titles` | `/settings/titles` | Designation (64). It has no department | partial |
| `settings/schedules`: days, hours, break, default | `/settings/schedules` | Shift Type (29). Working days come from the Holiday List, not the shift | partial |
| `settings/permission/admins` | `/settings/permission/admins` | User, Has Role | decide D8 |
| `settings/permission/roles`: view/edit grid | `/settings/permission/roles` | Role and Custom DocPerm. Field-level access is our Security → Employee fields | decide D8 |
| `settings/integration` | — | nothing behind the reference's apps | ⛔ |
| `settings/subscription/overview`, `history`, `plans`, payment | — | none. Frappe Cloud's billing is not on the site; ERPNext's Subscription is for selling to customers | ⛔ |
| `settings/password` | `/settings/password` | User (`update_password`) | live |
| `settings/notifications`: nine switches | `/settings/notifications` | Notification Settings (one per person). Its switches are not the reference's nine | partial |

Setup readiness (`/settings`), Module coverage and Security are ours and
stay in Settings' list.

### Notifications, messages, help

| Reference | Ours | Doctype(s) | Status |
|---|---|---|---|
| notification popup (top bar) | every page | Notification Log | live |
| `notifications` | `/notifications` | Notification Log | live |
| message popup (top bar) | — | no chat on the site | ⛔ D12 |
| `messages`, `messages/<thread>` | — | none. Raven, Frappe's chat app, would be an app install | ⛔ D12 |
| `help` | `/help` | fixed text | live |
| `help/faq` | `/help/faq` | Help Article (on the site, empty), or fixed text | decide D18 |
| `help/privacy` | `/help/privacy` | fixed text, which somebody has to write | decide D18 |
| `help/shortcuts` | `/help/shortcuts` | fixed text: the shortcuts this app has | live |
| `help/contact`, a ticket form | `/help/contact` | Issue (Support module, on the site, unused), or an email to IT | ⛔ D18 |
| not found | any unknown address | — | live |

---

## Our pages the reference does not have

They stay, rebuilt in the reference's style and put on its side menu.
Proposed places are in **D2**.

| Module | Pages |
|---|---|
| Dashboard | Approvals · HR, Attendance and Payroll Dashboards · one dashboard per company · Product Updates · Announcements & CEO Speak (records) |
| On Board | Onboarding (the Google Form) · Letters · Documents · Assets · Asset Assignment · Letter Types · Document Types · Employee Documents |
| Employees | Calendar (becomes Time Off → Holidays) · New Joining · Hierarchy Chart · Company Chart · Import From Onboarding · File Import · and, hidden today, Salary Master, Employee Detail, CTC, Categories, Category Types, Weekoff Holiday Report, Profile Change Requests, Employee Letters |
| Attendance | Employee Attendance Regularization (the register) · In Out Activities · Daily Detail · Monthly Basic (the muster) · Monthly Summary · Present · Absent · MSP · In/Out Count · Employee Shift Report · Head Count And Attendance · OT · Weekly · App Punches · Manage Shift · Overtime Entries · Work Locations · Attendance Regularization (records) · and, hidden, Submit Attendance, Statutory Reports |
| Leave | Apply Leave · Leave Application History · Leave Monthly Availed · and, hidden, Pending, Availed |
| Payroll | Payroll (the month's run) · Salary Setup · Increments · Advances & Loans · Payslips · Bank Transfer · Actual Salary · and, hidden, the older Factor HR pages |
| Loans, Survey | hidden modules, kept |
| Reports | All Reports (every report as Excel or PDF) |
| Settings | Setup readiness · Module coverage · Security |

## Colours changed to pass contrast

The reference's palette is in `client/src/styles/themes.css` as roles. `npm
run contrast` holds every text colour to 4.5:1 on every surface, and control
edges and chart marks to 3:1. Where one of the reference's colours fails, the
nearest shade that passes is used, with the same hue and saturation and only
the lightness stepped:

| Reference | Used | Where | Why |
|---|---|---|---|
| green `#1AAE5F` | `#14884A` | the Dashboard button, green buttons (white text on them) | white on it is 2.95:1 |
| green `#1AAE5F` | `#19AA5D` | focus ring, marks, bars, the chart's first hue | 2.95:1 against white, needs 3:1 |
| green ink `#138A4A` | `#117B42` | green text | 4.3:1 on the row divider |
| muted `#6B7280` | `#666C7A` | second text | 4.43:1 on its own grey well |
| faint `#A0A6B1` | `#666C7A` | the lightest text | 2.5:1. The exact `#A0A6B1` is kept for chevrons and icons only, never text |
| red ink `#C9353A` | `#C73439` | red text | 4.45:1 on the divider |
| red `#E5484D` | `#E12E34` | red buttons (white text) | white on it is 3.9:1 |
| yellow ink `#8F7000` | `#856800` | "partial" text | 4.4:1 on the divider |
| line-2 `#E3E6EA` | `#7C8A9D` | the edge of an input or select | 1.2:1. A control's edge needs 3:1 |
| yellow `#F5C518` | `#B69008` | the chart's third hue on white | 1.6:1 |
| dark faint `#6A7384` | `#8991A0` | the lightest text, dark mode | 3.6:1 |
| dark line-2 `#2C3340` | `#637390` | the edge of a control, dark mode | 1.3:1 |

Everything else is the reference's value exactly. In dark mode its
see-through washes (green 16%, red 16%, yellow 15%, blue 18%) are worked out
against the card, because a role is an opaque colour.

## Sample data behind `VITE_KIT_SAMPLE=on`

Only until you decide, and only for: Messages and the message popup ·
Integrations · Subscription · Attendance QR code · Payroll pay cycle · the
set-up wizard · Contact Support's ticket list. Each page says on screen that
its data is a sample. This list shrinks as decisions come in.

---

## Decisions

**D1, record addresses.** Add `/module/page/<record>/<view>` for one employee,
job, applicant, slip, list, template, folder or news item, so that each has an
address that survives a refresh. Every two-level address stays as it is.
*Recommended.*

**D2, the menu, and where both have a page.** Use the reference's menu:
Dashboard, Employees, Checklist, Time Off, Attendance, Payroll, Performance,
Recruitment. `data/sections.js` says the order follows Factor HR's and "must
not be" changed, so this overrides it. Where a reference view and one of our
pages do the same job (Employee Master, Employee Profile, Payslips, Leave
Balance, the holiday Calendar, All Reports, Work Locations), the reference's
view takes over the address and keeps the page's data, rules and permissions.
Our other pages join the closest group:
- On Board under Checklist
- Approvals under Dashboard
- the attendance reports and the muster under Attendance → Reports
- Payroll's own pages under Payroll

*Recommended.*

**D3, "My" pages and Check in / Check out.** None of the logins this dashboard
is used from (`it@`, `hr@`, the four company logins) has an Employee record;
13 of 55 logins do. A Check in button would also be a second punch route with
no server rule behind it, and CLAUDE.md §1 and §7 say a rule must never be
left in that state. *Recommended:* no Check in/out. My Time Off and My
Attendance are shown only to a login linked to an Employee.

**D4, news categories and pin.** The reference has Announcement, Policy,
Event, Benefits and Company, and a pin. *Recommended:* add those categories to
Manna Announcement's `kind`, and add a `pinned` box. That is a doctype change,
so it waits for your answer.

**D5, hiring stages and job status.** The reference lets HR name the stages
and drag people between them; hrms's Job Applicant has a fixed status list.
The reference's job is Open, On hold, Draft or Closed; hrms has Open and
Closed. *Recommended:* one Select field for the stage on Job Applicant,
holding a list HR keeps in Manna HR Settings, and Job Opening's status
widened by a custom field. These are custom fields, not new doctypes, but they
still change the site.

**D6, payroll settings.** General would write Payroll Settings. Pay cycle has
nothing behind it. *Recommended:* General read-only, showing what the site
does (attendance-based, PF and ESI by structure). No pay cycle.

**D7, Performance.** The doctypes are there, all empty, and hrms needs an
appraisal cycle and a template first. *Recommended:* build the page on
Appraisal, and you say when to start a cycle. Until then it shows its empty
state.

**D8, permissions and account settings.** Changing roles from a page is the
riskiest write in the reference. Frappe replaces permissions rather than
merging them, and an empty condition means *everybody* (CLAUDE.md §5).
*Recommended:* admins and their roles shown, not edited; field access stays in
Security; no new roles from here.

**D9, sign-up, code and new password.** Sign-up is off on the site.
Frappe resets a password with an emailed link, not a code, and that link
opens the site's own page unless the reset email is changed on the server.
*Recommended:* no sign-up; Forgot password sends Frappe's link; no code
screen.

**D10, the set-up wizard.** It is a sign-up for a new company. The six
companies exist, and creating one in ERPNext also creates its accounts.
*Recommended:* not built.

**D11, Remove, Delete and Undo.** The reference removes an employee and undoes
any change from a snapshot. On the site, an Employee is set to *Left* and
never deleted. Undo is a second write that puts the old value back, so it is
offered where one exists (a status, a decision, a pin), and a delete asks
first instead. *Recommended.*

**D12, Messages and to-do subtasks.** There is no chat on the site; Raven
would be an app install. ToDo has no subtasks. *Recommended:* no Messages,
and the chat icon comes off the top bar; to-do without subtasks.

**D13, attendance settings.** Late minutes and shift times are Shift Type's,
and there are 29 of them, not one. *Recommended:* the General tab picks a
shift and edits its times and grace minutes. Remote, selfie and auto-out stay
where they are (Employee and the phone app).

**D14, paying from the list.** The reference's Pay and Pay all mark people
paid with a click. Here, paying is the Payroll page's run (Salary Slips, then
the bank sheet). *Recommended:* the list shows each slip's status and opens
the run, and does not mark anyone paid itself.

**D15, Directory and Org Chart** were hidden on 25 September, asked for by
IT. The reference has both on its menu. Show them again?

**D16, the dashboard.** Start Up (Mood, Wishes, Announcements, CEO Speak) and
the reference's Layout 1 are both the front page, and the reference's Team
Performance chart is random. *Recommended:* the reference's layouts, with
Start Up's panels as a section of Layout 2, and the chart showing attendance
by month.

**D17, leave types and policies.** The one policy on the site decides who
earns Casual Leave (CLAUDE.md §7). *Recommended:* read-only until you say.

**D18, Help.** Should the FAQ be fixed text or Help Articles that HR edits?
The privacy policy needs its text from you. And where should a support
request go: an Issue on the site, or an email to IT?

**D19, the company picker.** The reference is one company. This site has six,
and our top bar's company picker scopes every page; the four company logins
see only their own. *Recommended:* keep the picker in the reference's top bar,
between search and the links, and show the chosen company's name where the
reference shows "Unpixel Studio".
