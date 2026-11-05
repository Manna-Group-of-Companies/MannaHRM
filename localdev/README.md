# Local development: ERPNext, Manna HR and the CMMS on one PC

A copy of `mannarubber.m.frappe.cloud` running on this PC, with the CMMS pointed
at it instead of at the live site. SAP comes after, against a **test** company
database only.

```
Windows                                   WSL2 Ubuntu 24.04
───────                                   ─────────────────
CMMS client  localhost:5173  ──►  CMMS API  localhost:5055  ──►  ERPNext  localhost:8000
                                                                   site manna.localhost
                                                                   frappe · erpnext · hrms
                                                                   india_compliance · manna_hr
                                                                   (manna_hr symlinked to this repo)
```

Frappe does not run on Windows, which is why the ERPNext half lives in WSL2.
WSL forwards `localhost` both ways, so the CMMS on Windows reaches it at
`http://localhost:8000` with nothing to configure.

## 1. WSL2 (once, needs an administrator and a restart)

In PowerShell **run as administrator**:

```powershell
wsl --install -d Ubuntu-24.04
```

Restart, open *Ubuntu* from the Start menu, and pick a Linux username and
password when it asks. Run the install from **your own** Windows login: a
distribution belongs to the Windows user who installed it, and one installed
from an administrator account is invisible to yours.

Then `C:\Users\<you>\.wslconfig` holds:

```ini
[wsl2]
networkingMode=mirrored
```

and `wsl --shutdown` applies it. The office's Cloudflare One client and WSL's
default (NAT) networking together stall Python package downloads for 4–30
seconds each, against half a second from Windows; mirrored took them back to
0.2–0.6 s (22 Oct 2026). One side effect: a local port nothing listens on
**hangs instead of refusing**, so "Timeout connecting" from bench usually means
its Redis is not running (`bench start`), not that the network is down.

## 2. The bench (once, about 20 minutes)

In the Ubuntu window:

```bash
bash /mnt/c/Users/Melvin/Documents/MANNA/MannaHRM/localdev/setup_bench.sh
```

It asks for the Linux password for `sudo`. It installs MariaDB 11.8, Redis,
Python 3.14, Node 24 and bench, then makes `~/frappe-bench` on `version-16`
with erpnext, hrms and india_compliance, and links `manna_hr` to this checkout.

## 3. The site

**A copy of the live site** is what the CMMS needs: its `CMMS …` doctypes, the
companies, warehouses, items and logins exist only there. On Frappe Cloud:
*Sites → mannarubber → Backups → Download* the latest **database**, **public
files** and **private files** into `Downloads`, then:

```bash
bash /mnt/c/Users/Melvin/Documents/MANNA/MannaHRM/localdev/new_site.sh \
  /mnt/c/Users/Melvin/Downloads/<name>-database.sql.gz \
  /mnt/c/Users/Melvin/Downloads/<name>-files.tar \
  /mnt/c/Users/Melvin/Downloads/<name>-private-files.tar
```

`--fresh` instead of the files gives an empty site, which is enough for Manna HR
work and useless for the CMMS.

The script switches off everything a copy of production must not do on its
own: outgoing and incoming mail, the scheduler (the hourly leave rules, every
scheduled job), and it resets the Administrator password so the copy's is not
the live one's. **The copy holds real salaries, bank details and phone numbers.**
It stays on this PC; it is not to be shared or exposed on the network.

`manna_hr` is linked into the bench but **not installed on the copied site**.
The live site still holds its doctypes as `custom: 1`, and installing the app on
top of them is the migration failure `docs/DOCTYPES.md` §14 warns about. Doing
that install here first is exactly the rehearsal that section needs.

Start it, and leave the window open:

```bash
bash /mnt/c/Users/Melvin/Documents/MANNA/MannaHRM/localdev/start.sh
```

Sign in at <http://127.0.0.1:8000> as Administrator (password in
`~/.frappe-admin-manna.localhost`) or as yourself with your live password,
which came across in the copy.

**`127.0.0.1`, not `localhost`.** Windows tries `::1` first, bench serves IPv4
only, and under mirrored networking the IPv6 attempt hangs instead of failing
over. A browser falls back within a second; Node and PowerShell wait out their
timeout. The CMMS's `ERPNEXT_URL` says `127.0.0.1` for this reason.

**It stays on this PC.** Frappe's dev server binds `0.0.0.0` (hard-coded in
`frappe/app.py`) and its log says *Running on http://192.168.100.12:8000*, but
the Hyper-V firewall that fronts WSL blocks inbound connections by default and
that address does not answer, from this PC or anywhere else (checked 22 Oct
2026). Never add a firewall rule for 8000 while a copy of the live site is on
it.

### What has been run on this PC

**22 Oct 2026** — a fresh site with **manna_hr installed**, the first install
of the app anywhere. It found three bugs, fixed alongside this file: a missing
`import frappe` in `workflow._ensure_masters`, the
`Employee Attendance Regularization` controller still named for the doctype's
old name, and `Asset Category` rows that ERPNext 16 refuses without accounts.

**23 Oct 2026** — that site dropped and the live backup of 09:49 restored in
its place. Production is `erpnext-fzf-yzy.m.frappe.cloud` on Frappe Cloud
(mannarubber is its domain), and was running frappe 16.31.0, erpnext 16.32.3,
**hrms 16.16.0**, india_compliance 16.8.4 and Frappe Cloud's
`email_delivery_service`; the copy was migrated to the bench's 16.52 and the
last of those struck off. 514 employees, 70 enabled users, 47 CMMS machines,
2,213 private files. manna_hr is linked but **not installed** on it — see §3.

To restore a newer backup, drop the site first:

```bash
cd ~/frappe-bench && bench drop-site manna.localhost --db-root-password "$(cat ~/.frappe-db-root)" --force --no-backup
```

The CMMS's `ERPNEXT_API_KEY` is for this site's Administrator and dies with
it. After a restore, make a new one (it prints the secret — paste both into
`Manna_CMMS\server\.env`, never into chat or a commit):

```bash
cd ~/frappe-bench && bench --site manna.localhost execute frappe.core.doctype.user.user.generate_keys --args '["Administrator"]'
```

## What on this PC can reach something live — nothing, and how

Checked 24 Oct 2026. `bash localdev/unlive.sh --check` repeats the site half
and exits non-zero if anything has crept back; `new_site.sh` runs `unlive.sh`
after every restore and stops if it fails.

| Path to production | Closed by |
|---|---|
| Mail from the copy | outgoing and incoming off on every Email Account; `mute_emails`; Frappe Cloud's `email_delivery_service` struck off |
| Scheduled jobs (leave rules, syncs) | scheduler disabled and paused |
| **Webhooks** — three post every User insert, update and delete to `frappecloud.com` | disabled (`unlive.sh`) |
| **GST API** — e-invoice and e-way bill under Manna's GSTIN | `enable_api` and its three automatic siblings off (`unlive.sh`); its secret is also undecryptable without production's key |
| **SAP company names in ERPNext** — `sap_db` in `SAP Item Category Sync Control`, and the pricing snapshot | `HITECH_RUBBER_LIVE` → `HITECH_RUBBER` (the demo); every other `…_LIVE` → `NOTEST_…`, which no SAP company is called (`unlive.sh`) |
| SAP itself | `localdev/sap/sapguard.mjs`: `HITECH_RUBBER` is the only company allowed; anything ending `_LIVE` refused by name or pattern; certificate pinned |
| Server scripts (23, from production) | **on**, deliberately — none makes an outbound call, and the SAP ones only raise a flag the SAP server's watcher reads from *production* |
| CMMS dev | client → API `localhost:5055` → ERPNext `127.0.0.1:8000`, sync and drift **off**, key made on the local site. `npm run build` / `preview` still use the Render production API — that is the deploy build |
| HR dashboard dev | `client/.env.development.local` (gitignored) sends `npm run dev` to `127.0.0.1:8000`; without it the proxy defaults to the live site. Not run yet on this PC (`npm install` first) |
| `Manna_CMMS/sap-sync` scripts | read their keys from `C:\Users\eldhose\…`, which is the SAP server's disk and absent here |

What is *not* covered: anything you point at production yourself — a script
given the live site's API key, Postman, the desk in a browser tab. The copy
cannot reach out; a person still can.

## How CMMS work goes from here to production

ERPNext is not developed here and nothing in the bench is tracked in git. When
the CMMS needs a new doctype or field it gets one the way it always has — a
setup script in `Manna_CMMS/sap-sync/` (`setup-goods-receipt.js` and the rest)
that creates it through the API:

1. Run it against the local site first (`127.0.0.1:8000`, the local key in
   `Manna_CMMS/server/.env`) and build the CMMS change on top.
2. When both work, run the same script against production.

`sap-sync/erp.js` reads `C:/Users/eldhose/Manna_CMMS/server/.env` today, so
those scripts need a way to be told which site — an argument or an
environment variable, defaulting to *local* — before step 1 works from this PC.

The sales repo has no setup scripts. Its ERPNext changes are files, put on live
by hand in Desk: `SALES_DASHBOARD/app/server/*.py` (each a Server Script, named
and typed in its header) and `*_doctypes.json` (custom doctypes).
`node localdev/apply-sales-erp.mjs` shows what the local copy is missing, and
`--apply` adds it. It refuses any ERPNext but `127.0.0.1`. It never changes a
doctype that already exists, only reports it. First run, 5 Nov 2026: created
`Manna Pick List` / `Manna Pick List Item` and the Server Scripts
`manna_pick_lists`, `manna_pick_list_submit`, `manna_sales_targets` and
`manna_sales_target_guard`. The last one was not yet on live that day.

## 4. The CMMS against it

Already configured on this PC (both files are gitignored in `Manna_CMMS`):

| File | Says |
|---|---|
| `server/.env` | `ERPNEXT_URL=http://127.0.0.1:8000`, port 5055, sync **off**, and an API key made on the *local* site for Administrator |
| `client/.env.development.local` | `VITE_API_URL=http://localhost:5055/api` |

Double-click `Manna_CMMS\run-local.bat`. The client opens on
<http://localhost:5173>; sign in with your ERPNext email and password.

Sign-in, reading and anything the API does with the signed-in person's own
session work like this. The **background sync** (stock movements posted to
ERPNext, the nightly drift check) needs an integration key, and it must be one
made on the **local** site — never the live one, or a local test posts stock to
production:

1. <http://localhost:8000/app/user> → the integration user → *Settings → API
   Access → Generate Keys*.
2. Put the key and secret in `Manna_CMMS\server\.env` and set
   `ERPNEXT_SYNC_ENABLED=true`.

## 5. SAP Business One — test companies only

The Service Layer is `https://192.168.100.200:50000/b1s/v1/` (`v2` answers
too), reachable from the office network. Its certificate is self-signed and
**expired in July 2025**; `sap/sapguard.mjs` pins its SHA-256 fingerprint
instead of switching checking off, so the password is never sent to anything
else answering on that address. If SAP's certificate is renewed the pin fails
loudly — take the new fingerprint with
`openssl s_client -connect 192.168.100.200:50000 | openssl x509 -noout -fingerprint -sha256`
and confirm it with the SAP team before changing it.

A login names one `CompanyDB`, and that is the switch between live and test.
**`sapguard.mjs` is the only way anything here reaches SAP**, and it refuses
every database not listed in `test_dbs`, any name ending `_LIVE`, and the four
live ones by name even if somebody lists them (`MANNA_RUBBER_LIVE`,
`HITECH_PRETREADS_LIVE`, `HITECH_RUBBER_LIVE`, `MANNA_TYRE_LIVE`).

**Do not run `Manna_CMMS/sap-sync` against the local site as it is.** The sync
takes its database names from ERPNext — `item_master_options.<abbr>.sap_db` on
`SAP Item Category Sync Control` — and the local site is a copy of production,
so every one of them is `…_LIVE`. Pointing it at the local ERPNext with real
SAP credentials writes to the live companies.

Setting up:

1. `localdev\sap\sap.local.json` (gitignored) holds the SAP user and
   `test_dbs`. On this PC: `HITECH_RUBBER`, the demo copy of Hi-Tech Rubber
   (423 items; groups 106/108/109 as in the live company), user `manager`.
2. `node localdev/sap/probe.mjs` — signs in to each test company once, reads
   three items and five item groups, signs out. Writes nothing, and never
   retries a failed login: SAP locks a user after three wrong passwords.
   First run 24 Oct 2026: signed in, Service Layer 1000190.
3. `node localdev/sap/map.mjs` — everything `Manna_CMMS/sap-sync` calls,
   checked for presence in `$metadata` and read access, with row counts; plus
   the user's Superuser flag and the item master's `U_` fields. Writes
   `localdev/sap/out/<DB>-map.md` and the whole `$metadata` beside it
   (gitignored). Read only — write access is read off the user record, not
   tried.
4. `node --test localdev/sap/sapguard.test.mjs` — the guard's rules.

What the map found in `HITECH_RUBBER` on 2 Nov 2026: Service Layer 1000190,
315 entity sets, 507 actions; **`manager` is a Superuser**; all 15 resources
and 4 actions the sync uses present and readable — 447 items, 11 item groups,
112 HSN codes, 1,881 purchase orders, 2,391 GRPOs, 7,287 goods receipts,
7,767 goods issues, dating back to 2023, so this is a full copy of the company,
not an empty demo; `U_SubTypeA`, `U_SubTypeB`, `U_TaxRate` on the item master.

Two traps the guard hit on its first real run, both now handled in it: a
kept-alive connection reused for a second request reports no certificate, and
neither does a resumed TLS session — so the pin is checked once per connection
as it opens, and session resumption is off.

### The sales order sync, in the new order flow

`node localdev/sap/run-order-sync.mjs` runs
`SALES_DASHBOARD/sap-order-sync/Sync-SapOrders.ps1` in `manna_first` mode
against the local ERPNext and `TEST_HITECH_PRETREADS` / `TEST_MANNA_TREADS`:
a dry run of PASS M (the Manna Treads Sales Order, made as soon as the order
exists) over orders created today, unless `--since`, `--limit`, `--pass` or
`--apply` say otherwise. It writes the sync a config in the temp folder with
sapguard's fingerprint as `sap.pinned_cert_sha256`, and the sync itself
refuses a `TEST_` company with any ERPNext not on this PC. Its log is the
sync's own, in `sap-order-sync/logs/`.
`node localdev/sap/orderflow-discover.mjs` reads (only) what the flow
depends on in both companies — recent orders, the inter-company partners,
series and branches — into `out/orderflow-discover.json`.

First run, 3 Nov 2026: two test orders made on the local copy on the shared
codes PMB00101002 / PMB00101502 became TEST_MANNA_TREADS orders 555 (Alavisons,
Kerala, CG+SG@18, ₹33,979 — ERPNext's total to the rupee) and 556 (Kannan
Tyres, Karnataka, IGST@18); a lost write-back was adopted, not posted twice.
