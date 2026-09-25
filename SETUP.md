# Setup Guide

Three steps: publish the site, connect Google Sheets, set your team's details.

---

## 1 · Publish to GitHub Pages

Create an empty repository on GitHub, then from this folder:

```bash
git init
git add .
git commit -m "Oakcraft CRR Tracker"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

In the repository: **Settings → Pages → Build and deployment → Source → GitHub Actions**.

Wait for the green tick under the **Actions** tab. Your tracker is live at:

```
https://YOUR-USERNAME.github.io/YOUR-REPO/
```

### Keeping it private
GitHub Pages on a private repository requires GitHub Pro / Team / Enterprise.
On a free plan the repository must be public for Pages to work. If the data must stay
private, either upgrade, or simply open `index.html` from disk — the whole application
runs without a server.

---

## 2 · Connect Google Sheets

### 2.1 Create the sheet
New Google Sheet → name it **Oakcraft CRR Tracker**.

### 2.2 Add the script
**Extensions → Apps Script**. Delete everything in the editor. Paste the entire
contents of `backend/Code.gs`. Click the save icon.

### 2.3 Initialise
In the function dropdown pick **`setup`** → **Run**. Google asks for permission:
**Review permissions → your account → Advanced → Go to (project) → Allow**.

Back in the sheet you now have three tabs:

- **Activity Log** — one row per call, WhatsApp, visit, email or quotation
- **Customer Status** — a rolling per-customer summary, updated on every activity
- **Summary** — headline counters

### 2.4 Deploy as a Web App
**Deploy → New deployment**. Click the gear next to "Select type" → **Web app**.

| Field | Value |
|---|---|
| Description | Oakcraft CRR v1 |
| Execute as | **Me** |
| Who has access | **Anyone** |

**Deploy** → copy the **Web app URL** (ends in `/exec`).

> "Anyone" means anyone who knows the URL can post to it. The `apiKey` is the guard.
> Change `API_KEY` in `Code.gs` and `apiKey` in `js/config.js` to the same new secret
> before going live.

### 2.5 Point the app at it
Open `js/config.js` and set:

```js
apiUrl: 'https://script.google.com/macros/s/AKfycbx.../exec',
apiKey: 'OAKCRAFT-CRR-2026',
```

Commit and push. The dot in the sidebar footer turns **green**.

### 2.6 Optional — live summary
In Apps Script run **`installTriggers`** once. The Summary tab then refreshes
every 15 minutes.

### Re-deploying after an edit
Apps Script serves the *deployed version*, not the saved one. After changing
`Code.gs`: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
The URL stays the same.

---

## 3 · Set your team's details

All in `js/config.js`:

```js
defaultAgent: 'Ankush',        // the name that fills {agent} in WhatsApp messages
countryCode: '91',             // dial code
pageSize: 50,                  // table rows per page
```

Add or edit WhatsApp templates in `waTemplates`. Available placeholders, each filled
from that customer's real record:

`{name}` `{agent}` `{last_order}` `{orders}` `{value}` `{state}` `{business}`

Add call outcomes in `dispositions`, and list the ones that count as wins in
`positiveDispositions`.

---

## 4 · Optional: send the daily report automatically on WhatsApp

Out of the box, **Share Report** opens the phone's share sheet with the PDF attached.
You pick WhatsApp and tick the two contacts. Browsers are not allowed to send a
WhatsApp message on their own, so skipping those taps needs the official
**WhatsApp Business Cloud API**:

1. In Meta Business Manager, set up a WhatsApp Business account and a sending number.
   Create a system user and a **permanent access token** with `whatsapp_business_messaging`.
2. Create a message template (category *Utility*) with a **Document** header, e.g.
   `daily_call_report`, and wait for approval. A template is required because WhatsApp
   only allows free-form messages within 24 h of the recipient last writing to you.
3. In Apps Script: **Project Settings → Script properties** add
   `WA_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_TEMPLATE` (the template name) and, if not
   English, `WA_TEMPLATE_LANG`.
4. Recipients are set in `REPORT_TO` at the top of `Code.gs` (with country code). The
   browser cannot change them, so nobody holding the public key can message other numbers.
5. Deploy a **New version**, then set `report.autoSend: true` in `js/config.js`.

If sending fails (token expired, template not approved), the app says why and falls
back to the share sheet, so the report still goes out.

## Daily use

1. Open **Priority Call Queue** — accounts are already ranked.
2. Press **⚡ CALL NOW only** to see just the urgent ones.
3. Click a customer name for the full record, the pitch angle and the churn reason.
4. **📞** to dial, **💬** to WhatsApp with the message pre-filled, **✎** to log the outcome.
5. Set a follow-up date — it appears on the Call Tracker page when due.
6. For bulk outreach use **WhatsApp Campaigns**.
7. Press **↻ Sync** in the top bar if anything is still pending.

Keyboard: **Ctrl/⌘ + K** for global search, **Esc** to close panels.

---

## Troubleshooting

**Sidebar dot stays amber** — `apiUrl` is blank, or the deployment isn't set to
"Anyone". Everything still works offline; nothing is lost.

**"Sync failed"** — open the `/exec` URL in a browser. You should see JSON. If Google
shows a sign-in page, re-deploy with access set to **Anyone**.

**Rows appear twice in the sheet** — they can't; the backend de-duplicates on activity
`ID`. Safe to press Sync as often as you like.

**Blank page after deploying** — confirm `.nojekyll` is committed. Without it GitHub
ignores files and folders it thinks are Jekyll sources.

**Nothing loads when opening `index.html` from disk** — the `data/` folder must sit
next to `index.html`. The site is designed to work from `file://` too.

**WhatsApp opens the wrong number** — numbers come straight from the workbook's
`Phone No.` column. Fix it at source and re-run `build_data.py`.

**A customer has no phone** — that's real: 348 accounts have no number on file.
Module 12 lists the 105 worth tracing, with GSTIN and address for each.
