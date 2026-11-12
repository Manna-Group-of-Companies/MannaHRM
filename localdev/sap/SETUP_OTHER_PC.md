# SAP Service Layer on another PC: test companies only

This guide is for a second Windows PC with its own login, so that Claude Code
there can work with SAP Business One the same way it does on Melvin's PC. It is
written for both the person setting the PC up and the Claude session running on
it. Follow the steps in order.

The only companies it reaches are **`TEST_HITECH_PRETREADS`** and
**`TEST_MANNA_TREADS`**. The live companies are refused in code (see "The
rules" below), not just by convention.

Written 3 Nov 2026 from the working setup on Melvin's PC.

---

## What is needed

| | |
|---|---|
| Network | The office LAN. `192.168.100.200:50000` must answer (step 1). |
| Node.js | 20 or newer (Melvin's PC runs 24). No `npm install`: the tools use Node's built-in modules only. |
| Python 3 + `openpyxl` | Only for the item-code conversion helpers (`*.py`). Not needed to connect. |
| The SAP login | User and passwords for the two test companies, **from Melvin, by hand**. They are never written into this guide, a chat, or git. |
| WSL, ERPNext, the bench | **Not needed** to connect to SAP. The sync scripts need them: step 6. |

---

## 1. Check the network (PowerShell)

```powershell
Test-NetConnection 192.168.100.200 -Port 50000
```

You should see `TcpTestSucceeded : True`. If it says `False`, the PC is not on
the office network (or a VPN or firewall is in the way), so stop here.

If the Cloudflare One client is installed, it should be connected, as it is on
Melvin's PC. Node does not need its certificate for SAP, because the SAP
certificate is checked by its fingerprint (step 4).

---

## 2. Copy the tooling across

**Since 5 Nov 2026 `localdev/` is in git**, on MannaHRM's branch
`localdev/erpnext-and-sap` (not `main`), with the secrets below kept out by
`.gitignore`. So `git checkout localdev/erpnext-and-sap` brings it, and §7 is how
a PC that is already set up takes the latest. The copy below is only for a PC
without git access. Copy the folder `MannaHRM\localdev\` from Melvin's PC (USB
drive or a network share), **leaving out**:

- `sap\sap.local.json`: holds the password. You make your own in step 3.
- `sap\out\`: reports from Melvin's runs. They name users and contain business data.
- `TEST_LOGINS.md`: passwords to the test logins on Melvin's local ERPNext.
  A PC with its own local ERPNext makes its own with `make-test-logins.mjs`.

From Melvin's PC, this copies everything else into `D:\sap-transfer\localdev`
(change the drive letter as needed):

```powershell
robocopy "C:\Users\Melvin\Documents\MANNA\MannaHRM\localdev" "D:\sap-transfer\localdev" /E /XF sap.local.json TEST_LOGINS.md /XD out
```

If you were given `manna-localdev.zip`, that is this copy already made, and
you can skip the robocopy. On the new PC, unzip or copy it to
`<anything>\MannaHRM\localdev\`. If MannaHRM is cloned
there, put it inside that clone. The repo's `.gitignore` already keeps
`sap.local.json` and `out/` out of git.

No path in the scripts names a user. `localdev/paths.mjs` finds `Manna_CMMS`
and `SALES_DASHBOARD` as folders beside `MannaHRM` (for example all three in
`Documents\MANNA\`). If this PC keeps them somewhere else, set
`MANNA_CMMS_DIR` and `SALES_DASHBOARD_DIR` to their folders instead.

Check that the copy has no password file:

```powershell
Test-Path .\MannaHRM\localdev\sap\sap.local.json    # must be False
```

---

## 3. Make `sap.local.json` (by hand, on that PC)

Start from the example:

```powershell
cd <path>\MannaHRM\localdev\sap
Copy-Item sap.local.example.json sap.local.json
notepad sap.local.json
```

Fill it in like this, typing the passwords yourself:

```json
{
  "url": "https://192.168.100.200:50000/b1s/v1",
  "fingerprint256": "9D:1C:6A:3F:60:1A:39:BF:1F:5F:F9:82:68:D6:D1:DA:75:E9:F8:F1:0F:90:4D:2D:A3:AB:30:C2:47:0F:E8:97",
  "username": "<SAP user>",
  "password": "<password for TEST_HITECH_PRETREADS>",
  "password_overrides": {
    "TEST_MANNA_TREADS": "<password for TEST_MANNA_TREADS>"
  },
  "test_dbs": ["TEST_HITECH_PRETREADS", "TEST_MANNA_TREADS"]
}
```

- `password` is used for every company unless `password_overrides` names that
  company. The two test companies currently have **different** passwords for
  the same user, which is why `TEST_MANNA_TREADS` is listed there.
- `test_dbs` is the allow-list. A company not listed is refused before
  anything is sent.
- Then keep the file to this Windows user only:

  ```powershell
  icacls sap.local.json /inheritance:r /grant:r "$($env:USERNAME):(R,W)"
  ```

**Claude on that PC: do not create this file with the passwords in it, and do
not ask for them in chat.** Make it from the example with the placeholders and
ask the user to type the values into Notepad. Never print the file, `cat` it,
or echo the password.

**Better, when possible:** ask the SAP administrator for a separate SAP user for
this PC, with only the authorizations the work needs. Then nothing on this PC
can do more than that person may, and SAP's change log shows who made each
change. `manager` is a superuser, and the two PCs sharing it means sharing its
lockout too (see the rules).

---

## 4. Test the connection (read only)

From `MannaHRM` (the folder above `localdev`):

```powershell
node --test localdev/sap/sapguard.test.mjs
node localdev/sap/probe.mjs
```

The first command should show 5 tests passing. The second signs in to each
company in `test_dbs`, reads its name, three items and five item groups, signs
out, and writes nothing. Each company should show `signed in   Service Layer
1000190`.

| What you see | What it means |
|---|---|
| `REFUSED … not in test_dbs` | Spelling in `test_dbs`, or the wrong company on the command line. |
| `certificate fingerprint mismatch … nothing was sent` | SAP's certificate changed, or something else is answering on that address. **Do not change the fingerprint yourself**: confirm the new one with the SAP team first. Get it with `openssl s_client -connect 192.168.100.200:50000 \| openssl x509 -noout -fingerprint -sha256` (Git Bash). |
| `FAILED … 401` or `Invalid user name or password` | **Stop. Do not run it again.** SAP locks the user after three wrong passwords. Fix `sap.local.json` and only then try once more. |
| Timed out | Step 1 again. |

For the full read-only map of one company (what the sync uses, row counts, the
user's superuser flag, the item master's `U_` fields):

```powershell
node localdev/sap/map.mjs TEST_HITECH_PRETREADS
node localdev/sap/map.mjs TEST_MANNA_TREADS
```

The reports go to `localdev/sap/out/` and stay on that PC.

---

## 5. Tell Claude on that PC the rules

Paste this into `MannaHRM\CLAUDE.md` on that PC (or into the user's
`%USERPROFILE%\.claude\CLAUDE.md` if MannaHRM is not cloned there), so every
session there starts with it:

```markdown
## SAP Business One — test companies only

- SAP is reached **only** through `localdev/sap/sapguard.mjs` (`SapSession`).
  Never call `https://192.168.100.200:50000` with curl, PowerShell,
  `fetch`, or a new HTTPS client, and never switch certificate checking off.
- Allowed companies: `TEST_HITECH_PRETREADS`, `TEST_MANNA_TREADS`. Never add a
  `_LIVE` name or any other company to `test_dbs`, and never edit `LIVE_DBS` or
  `refusalFor` in sapguard.mjs to get round a refusal.
- **A failed login is never retried.** SAP locks the user after three wrong
  passwords, and the user is shared with another PC. Report the error and stop.
- Never print, echo or `cat` `sap.local.json`, and never put a password in a
  command line, a file other than `sap.local.json`, or a chat message.
- Read first. Before anything that writes to SAP (POST, PATCH, DELETE, Close,
  Cancel), say what will change, in which company, and how many records, and
  wait for a yes. Scripts with a dry run run that first.
- Output with business data goes in `localdev/sap/out/` (gitignored), not
  anywhere it could be committed.
```

---

## The rules (what sapguard.mjs enforces, and why)

1. **Test companies only.** A login names one `CompanyDB`, and that one value
   is the difference between test and live. `refusalFor` refuses any company
   not in `test_dbs`, any name ending `_LIVE`, and the five live companies by
   name (`MANNA_RUBBER_LIVE`, `HITECH_PRETREADS_LIVE`, `HITECH_RUBBER_LIVE`,
   `MANNA_TYRE_LIVE`, `MANNA_TREADS_LIVE`), **even if someone lists them**. A
   live name in `test_dbs` stops the program rather than being skipped.
2. **The certificate is pinned.** SAP's certificate is self-signed and expired
   in July 2025, so normal checking fails. The usual workaround (switching
   checking off) would send the password to anything answering on that address.
   The SHA-256 fingerprint is checked on every new connection instead, before
   the password is written. TLS session reuse is off because a resumed session
   carries no certificate to check.
3. **No retry on a failed login.** Three wrong passwords lock the user, for both
   PCs.

---

## Optional: the scripts that need more than SAP

These scripts need only steps 1–4: `probe`, `map`, `discover`,
`orderflow-discover`, `company-info`, `sandered`, `trial`, `stageboms`,
`stockmove`, `semirename`, `fgitems`, `retire_items` and `naming_status.mjs`.
The item-code conversion tools (`apply_semi.mjs` and the `*.py` helpers) need
those steps too, and take the input spreadsheet or text file as an argument.
`naming_status.py` looks in your own `Downloads` when given none.

The rest need more:

| Script | Also needs |
|---|---|
| `run-order-sync.mjs` | A local ERPNext at `127.0.0.1:8000` (the WSL bench, `localdev/README.md` §1–3) and `SALES_DASHBOARD/sap-order-sync` |
| `run-credit-sync.mjs` | A local ERPNext and `SALES_DASHBOARD/sap-credit-sync`; the `SAP Invoice` doctype from `apply-sales-erp.mjs --apply` for the invoice mirror |
| `run-sync.mjs` | A local ERPNext and `Manna_CMMS`, with `server/.env` pointing at `127.0.0.1` |
| `flow.mjs`, `receive.mjs` | A local ERPNext, `Manna_CMMS` (running, for `receive`), and `localdev/TEST_LOGINS.md` |
| `copy-items.mjs`, `items-check.mjs`, `erp-uom-test.mjs`, `retire-copied-requests.mjs` | `Manna_CMMS/server/.env`, for the local ERPNext key |
| `make-test-logins.mjs` (in `localdev/`) | A local ERPNext |
| `setup-b1if-erp.mjs` (in `localdev/`) | A local ERPNext, `Manna_CMMS/server/.env` for its key, `SALES_DASHBOARD` and Python (§8) |

Both sync wrappers refuse to run unless ERPNext is local. **Never point them at
the live ERPNext**: the sync reads its SAP company names from ERPNext, and the
live site's are all `_LIVE`.

---

## 6. Your own local ERPNext (optional, about an hour)

This gives the PC a copy of the live ERPNext running in WSL, with the CMMS
pointed at it, the same as Melvin's PC. `localdev/README.md` is the full
runbook. Its paths say `/mnt/c/Users/Melvin/...`: **replace `Melvin` with this
PC's Windows user name** wherever it appears.

**What this PC needs, beyond step 2's `localdev` folder:**

| What | Where from |
|---|---|
| `MannaHRM` | `git clone https://github.com/Manna-Group-of-Companies/MannaHRM` into `Documents\MANNA\`, then put `localdev` inside it. `setup_bench.sh` links `manna_hr` from this clone. |
| `Manna_CMMS` | Its own repo, cloned beside `MannaHRM`. |
| `SALES_DASHBOARD` | Its own repo, cloned beside them. Needed for the sales order sync and for B1if (§8). **Check out `sap/order-flow-with-approval`, or `live-release`** (§7 says which): `main` has neither `order_flow.mode = manna_first`, which `run-order-sync.mjs` needs, nor `sap-b1if/`. |
| A Frappe Cloud backup | *Sites → mannarubber → Backups → Download*: **database**, **public files** and **private files**. Downloaded by someone with Frappe Cloud access. |
| `C:\Users\<user>\.wslconfig` | Two lines: `[wsl2]` and `networkingMode=mirrored`. Without them PyPI downloads crawl through the office gateway. |

**What this PC makes for itself, never copied:**

| What | How |
|---|---|
| `Manna_CMMS\server\.env` | README §4: `ERPNEXT_URL=http://127.0.0.1:8000`, port 5055, sync **off**, and an API key made on **this PC's local** site. A key from the live site, or from Melvin's local site, must never be used. |
| `Manna_CMMS\client\.env.development.local` | `VITE_API_URL=http://localhost:5055/api` |
| `localdev\TEST_LOGINS.md` | `node localdev/make-test-logins.mjs`, after the restore. |
| The local Administrator password | `new_site.sh` sets a new one and keeps it in `~/.frappe-admin-manna.localhost` inside WSL. |

**The order of work:**

1. WSL: in an administrator PowerShell, `wsl --install -d Ubuntu-24.04`, restart,
   then make the Linux user when Ubuntu first opens. Add `.wslconfig` and run
   `wsl --shutdown`.
2. Bench (about 20 minutes): `bash /mnt/c/Users/<user>/Documents/MANNA/MannaHRM/localdev/setup_bench.sh`
3. Site: `bash .../localdev/new_site.sh <database.sql.gz> <files.tar> <private-files.tar>`.
   This runs `unlive.sh` itself, which turns off mail, the scheduler, the webhooks
   and the GST API, and renames every `_LIVE` SAP company in the copy so none can
   be reached. Then confirm with `bash .../localdev/unlive.sh --check`. It must
   report nothing left live.
4. Start it with `bash .../localdev/start.sh` and leave the window open. Use
   <http://127.0.0.1:8000>, **not** `localhost`.
5. CMMS: the two `.env` files above, then `Manna_CMMS\run-local.bat`.
6. SAP: `node localdev/sap/run-order-sync.mjs` (a dry run) for the sales order
   flow into `TEST_MANNA_TREADS` / `TEST_HITECH_PRETREADS`.

**About the backup:** it is a full copy of production, with **real salaries,
bank details and phone numbers**. It stays on the PC it was restored to, inside
WSL. Port 8000 stays closed to the office network, with one exception: the two
rules in §8, which open it to the SAP server's address and nothing else, for as
long as B1if is posting to this PC. Delete the downloaded backup files once the
restore has worked.

---

## 7. Taking the latest code on a PC that is already set up

Neither branch is `main`, so pull them by name. Run from `Documents\MANNA`:

```powershell
git -C MannaHRM fetch origin
git -C MannaHRM checkout localdev/erpnext-and-sap
git -C MannaHRM pull origin localdev/erpnext-and-sap
git -C SALES_DASHBOARD fetch origin
git -C SALES_DASHBOARD checkout sap/order-flow-with-approval
git -C SALES_DASHBOARD pull origin sap/order-flow-with-approval
```

**Which SALES_DASHBOARD branch (12 Nov 2026):** `sap/order-flow-with-approval`
holds the SAP side: the order sync, `sap-b1if/` and what B1if posts to. Every
commit on it is also in **`live-release`**, the 14 Nov release, which adds the
app's and the dashboard's own work. Take `live-release` to test the whole system
as it will ship, and `sap/order-flow-with-approval` for the SAP side alone; the
commands above work with either name.

The branch's name is older than its rule. Since 9 Nov 2026 **nobody approves a
pick list in ERPNext**: every submitted pick list goes to Hi-Tech's SAP, and the
store confirms it there (the pick list's *Confirmed* field, `OPKL.U_Confirmed`).
The dashboard's Pick List Approval page and `manna_pick_list_approve` still
exist and nothing reads them.

`sap.local.json`, `TEST_LOGINS.md` and the `.env` files are gitignored, so a
pull never touches them. Then, with the local ERPNext started (§6 step 4), from
`MannaHRM`, each a dry run first and then with `--apply`:

1. `node localdev/setup-b1if-erp.mjs`: everything the local site needs from the
   sales repo, in one run. It runs `apply-sales-erp.mjs` (a missing doctype or
   Server Script, a script whose code changed) and `add-sales-fields.mjs` (a
   field an existing doctype lacks), which can still be run on their own, and
   then adds what those two do not cover: the order-seen fields, the WhatsApp
   doctypes and scripts held in test mode, what B1if posts to, the sync user's
   key and the write switch. §8 says what each is for. A doctype or field
   already on the site is never changed.
2. `node localdev/sap/run-credit-sync.mjs`: credit limits, outstanding, payment
   terms and SAP invoices from `TEST_MANNA_TREADS`.
3. `node localdev/sap/run-order-sync.mjs`: the order flow (PASS M, P, H, K).
   `--apply` posts to the TEST companies.

To test a pick list end to end: the order must be manager-approved
(`PO Approved - Ready for SAP`) before a pick list can be made. PASS K sends
every submitted pick list to Hi-Tech's SAP, and B1if invoices it once the store
has set *Confirmed* to Yes on that SAP pick list (Inventory → Pick and Pack →
Pick List, the header field). Until then PASS K logs that it is waiting for the
store, however long that takes. A customer the credit sync has given real SAP
figures may send a new order to Pending Approval first; that is the credit rule
working.

B1if and the TEST companies are on the SAP server and shared by every PC, while
each PC's ERPNext is its own. Two PCs therefore number orders and pick lists the
same (both can make `PICK-00426`), and Hi-Tech's SAP would get two pick lists
with one name; only the first is invoiced. Test the pick-list flow from one PC
at a time.

---

## 8. B1if posting to this PC (the end-to-end test)

B1if on the SAP server sends customers, items, stock, order status, payments,
invoices, credit and prices to **one** ERPNext address. This section moves that
address to this PC. It needs §6 (a local ERPNext restored from a live backup)
and §7 (the latest code) first.

**Only one PC receives at a time.** The moment B1if is pointed here, the PC it
was pointed at stops getting anything. When it is pointed back, that PC gets
what the next runs send and nothing of what it missed.

### On this PC

1. Start ERPNext (`localdev/start.sh`) and make the site the bench's default, or
   a request that names the PC by its IP address is answered "not found":

   ```bash
   cd ~/frappe-bench && bench use manna.localhost
   ```

2. From `MannaHRM`, a dry run and then for real:

   ```powershell
   node localdev/setup-b1if-erp.mjs
   ```

   ```powershell
   node localdev/setup-b1if-erp.mjs --apply
   ```

   What it makes, and what goes wrong without each:

   | Step | Without it |
   |---|---|
   | Sales doctypes, scripts, fields | `SAP Invoice` and `SAP Payment` do not exist, so the invoice and payment posts fail |
   | Order-seen fields | the manager's "seen" tick on an order is refused |
   | WhatsApp doctypes and scripts, **test mode forced on** | no "payment received" message is queued; with test mode off, a copy of live could message real customers |
   | What B1if posts to (`install_local.py`) | every post answers "method not found" |
   | Sync user `sapsync@mannarubber.com` and its key | B1if has nothing to sign in with |
   | Write switch (`custom_b1if_writes = all`) | every post is answered as a dry run and nothing changes |

   The key goes to `SALES_DASHBOARD\sap-b1if\erpnext\.sapsync-local-key.txt`,
   which git ignores. It is this PC's own: **never copy the file from another
   PC, never paste it into chat, never use the live site's key.** The script
   keeps a key that still signs in. Making a new one kills the old one that
   second, so use `--new-key` only when B1if is about to be given the new one.

3. In an **administrator** PowerShell, open port 8000 to the SAP server only.
   The first rule is for WSL's own firewall, the second for Windows':

   ```powershell
   New-NetFirewallHyperVRule -Name "ERPNext-from-SAP" -DisplayName "ERPNext 8000 from SAP server" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 8000 -RemoteAddresses 192.168.100.200 -Action Allow
   ```

   ```powershell
   New-NetFirewallRule -DisplayName "ERPNext 8000 from SAP server" -Direction Inbound -Protocol TCP -LocalPort 8000 -RemoteAddress 192.168.100.200 -Action Allow
   ```

4. Note this PC's office IP address (`ipconfig`, the `192.168.…` one).

### On the SAP server (over RDP)

5. Check the PC answers, in PowerShell there; it must say `pong`:

   ```powershell
   Invoke-RestMethod http://<this PC's IP>:8000/api/method/ping
   ```

6. B1if console (`http://127.0.0.1:8080`) → **SLD** → the system
   **`ERPNEXT_LOCAL`**. Change three things and save: the **host** to this PC's
   IP, the **user** to the key and the **password** to the secret from step 2's
   file (the two halves of `token <key>:<secret>`). Nothing is imported or
   rebuilt: every package names that system by its id.

### Check it

7. Within five minutes the timer syncs have run. On this PC, **SAP Sync
   Control → "B1iF: last answers"** shows each kind with a time of now and
   `age_seconds` near 0. A kind that is missing was refused: B1if's **Monitoring
   → Message Log** has the answer ERPNext gave.
8. Then the order flow, from this PC: an order in the app or dashboard,
   `node localdev/sap/run-order-sync.mjs --apply`, the pick list, *Confirmed* in
   SAP, and the status coming back by itself.

### What to expect

- **A burst at the start.** B1if keeps every post that failed while the address
  did not answer and delivers them all when it does (931 after one night). Stock,
  status, credit, invoices, payments, prices and weights older than ten minutes
  are answered `"stale": true` and ignored; customers and items are applied.
- **Orders are matched by name, and two PCs number them the same.** The TEST
  companies are shared, so SAP holds orders named like `SAL-ORD-2026-00174` that
  came from another PC, and the status sync writes their status onto whichever
  order has that name here. Judge only orders made on this PC after the switch,
  and send orders and pick lists from one PC at a time.
- **A bulk change to items delays purchase orders.** A new order and an item
  change share B1if's event queue, which clears about 155 item events an hour.
  On 11 Nov 2026 a change to 675 items held an order's purchase order back
  3 hours 45 minutes. Do not test orders while somebody is bulk-updating items
  in a TEST company.
- **The two nightly steps** (all customers at 01:10, all items at 01:20) only
  reach a PC that is on at that hour.

### When the test ends

Point `ERPNEXT_LOCAL` back (the host, user and password of the PC that had it),
and close the port on this PC, in an administrator PowerShell:

```powershell
Remove-NetFirewallHyperVRule -Name "ERPNext-from-SAP"
```

```powershell
Remove-NetFirewallRule -DisplayName "ERPNext 8000 from SAP server"
```
