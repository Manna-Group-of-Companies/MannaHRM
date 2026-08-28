# The dashboard, running locally

```bash
# Git Bash
ERP_KEY=... ERP_SECRET=... python app/serve.py

# PowerShell
$env:ERP_KEY='...'; $env:ERP_SECRET='...'; python app/serve.py
```

Then open **http://localhost:8770**.

No install, no build step, no npm. Two files and the Python that ships with
Windows.

---

## Why it needs a server rather than just opening the HTML

A `file://` page — or a page on any other origin — cannot call
`mannarubber.m.frappe.cloud` from the browser. Frappe pins its CORS header to
its own origin, so the request is refused before ERPNext ever sees it. This is
the same wall the sales dashboard hits, and why that one needs a Cloudflare
function in front of it.

`serve.py` therefore serves the page **and** proxies `/api/...` through to
ERPNext, so the browser only ever talks to one origin.

## Two deliberate limits

**The token never reaches the browser.** It is read from the environment in
`serve.py` and attached server-side. Nothing in `index.html` knows it, so the
page can be opened, shared or screenshotted without leaking a key that can write
attendance for the whole group.

**Only GET is proxied, and only to an allowlist of doctypes.** This process
holds a System Manager token; a general-purpose proxy on localhost would hand
the entire site to anything that can reach port 8770. The dashboard is a window,
not a console — it cannot write anything.

---

## What it shows today

Live, from the real site:

- Active headcount, biometric enrolment, reporting lines, shift assignment
- Headcount by company and by department
- Today's punches
- Setup readiness — what the attendance engine still needs
- A searchable directory of all 161 people, filterable by company

**Today's panel will be empty, and that is correct.** `Employee Checkin` has no
rows until the fingerprint bridge is running and the phone app is live. The
panel says *nothing recorded* rather than showing 0%, because an empty
attendance table and an empty factory produce identical numbers and the
difference matters.

## What it does not show yet, and why

| Missing | Waiting on |
|---|---|
| Attendance, present/absent, late/early | shifts defined, then punches arriving |
| Leave balances and the leave queue | entitlements and opening balances from Factor HR |
| Payroll | salary structures, which have not been started |
| Geofence map | GPS coordinates per gate |

None of these are hard to add. All of them are waiting on data rather than on
code — see `docs/OPEN_QUESTIONS.md`.
