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
| `SALES_DASHBOARD` | Its own repo, cloned beside them. Only needed for the sales order sync. **Check out `sap/manna-first-order-flow`** (`git checkout sap/manna-first-order-flow`): until it is merged, `main` has no `order_flow.mode = manna_first`, and `run-order-sync.mjs` needs it. |
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
WSL. Never add a firewall rule for port 8000, and delete the downloaded backup
files once the restore has worked.

---

## 7. Taking the latest code on a PC that is already set up

Neither branch is `main`, so pull them by name. Run from `Documents\MANNA`:

```powershell
git -C MannaHRM fetch origin
git -C MannaHRM checkout localdev/erpnext-and-sap
git -C MannaHRM pull origin localdev/erpnext-and-sap
git -C SALES_DASHBOARD fetch origin
git -C SALES_DASHBOARD checkout sap/manna-first-order-flow
git -C SALES_DASHBOARD pull origin sap/manna-first-order-flow
```

`sap.local.json`, `TEST_LOGINS.md` and the `.env` files are gitignored, so a
pull never touches them. Then, with the local ERPNext started (§6 step 4), from
`MannaHRM`:

1. `node localdev/apply-sales-erp.mjs`, then the same with `--apply`: creates any
   sales doctype or Server Script the local site lacks (the `SAP Invoice`
   doctype came this way on 5 Nov 2026). It never changes an existing doctype.
2. `node localdev/sap/run-credit-sync.mjs`, then `--apply`: credit limits,
   outstanding, payment terms and SAP invoices from `TEST_MANNA_TREADS`.
3. `node localdev/sap/run-order-sync.mjs`: a dry run of the order flow
   (PASS M, P, H, K). `--apply` posts to the TEST companies.

B1if and the TEST companies are on the SAP server and shared by every PC, while
each PC's ERPNext is its own. Two PCs therefore number orders and pick lists the
same (both can make `PICK-00426`), and Hi-Tech's SAP would get two pick lists
with one name; only the first is invoiced. Test the pick-list flow from one PC
at a time.
