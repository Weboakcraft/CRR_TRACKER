# Oakcraft CRR Tracker

**Customer Revival & Calling Intelligence** — an advanced, zero-dependency analytics
tracker built directly on Oakcraft's real CRM calling data.

Frontend runs as a static site on **GitHub Pages**. Backend is **Google Sheets**
via a **Google Apps Script** Web App. Data is built from the source Excel workbook
with **Python**.

---

## What's inside

| | |
|---|---|
| **760** unique real customer accounts | **₹11.50 Cr** total book value |
| **1,737** real orders | **₹4.64 Cr** identified 12-month upside |
| **13** modules — one per Excel sheet | **1,454** source rows, all preserved |
| **30** states covered | **30 months** of real order history |

> Every number in the application is computed from the source workbook.
> There is **no demo, sample, placeholder or synthetic data anywhere in this repository.**

---

## Modules — one section per Excel sheet

| # | Module | Rows | What it is |
|---|--------|-----:|------------|
| 02 | Top 100 Call List | 100 | The 100 highest-opportunity accounts, ranked. Start here. |
| 03 | Lapsed Big Accounts | 144 | Billed ₹1 L+ and silent for 120+ days. Senior calls only. |
| 04 | Dealer & Channel Targets | 54 | In the furniture/seating trade — should be on dealer terms. |
| 05 | Architects & Interiors | 38 | Spec-in accounts that specify into every project. |
| 06 | Other Resellers | 261 | Adjacent-goods traders who can carry Oakcraft seating. |
| 07 | Institutions, Govt & PSU | 19 | GeM tender-watch list (MSE purchase preference). |
| 08 | Corporates | 126 | Pvt Ltd / Ltd — target the approved-vendor list. |
| 09 | Active Repeat — Protect | 70 | Champions. Defensive module. |
| 10 | One-Time Buyers | 396 | Ordered once, never returned. Sorted by value. |
| 11 | Near Factory — Visit | 70 | Bawana / Poothkhurd / Narela / Rithala belt. |
| 12 | No Phone On File | 105 | Real money with no number — trace via GSTIN. |
| 13 | Duplicates & Shared Phones | 42 | Merge groups. **Read the Group column first.** |
| 14 | Data To Clean | 29 | Not real customers. Remove from the CRM. |

---

## Features

**Executive Dashboard** — 8 live KPIs, 30-month order-recency timeline, churn-health
mix, recency buckets, state revenue, lifecycle segments, action priorities, and three
leaderboards (value, upside, revenue at risk).

**Advanced Analytics** — Pareto/ABC concentration with the 80% line, ABC value split,
a 5×5 RFM matrix (click any cell to drill into that group), value-vs-recency bubble
chart on a log scale, state performance matrix, business-type ranking, research
confidence, trade-evidence mix, a **revival simulator** with live sliders, and
concentration-risk analysis.

**Priority Call Queue** — every account ranked by a composite score: upside (55%) +
book value (25%) + upside × churn-risk, multiplied by phone reachability, the
recommended action, and research confidence.

**Call Tracker** — log calls, WhatsApp, visits, emails and quotations with
disposition, expected value, follow-up date and notes. Daily activity chart, outcome
mix, overdue and upcoming follow-ups, full searchable log, CSV export. Saves instantly
in the browser and pushes to Google Sheets.

**WhatsApp** — a WhatsApp button on every row, in every module and in the customer
drawer. Six message templates with placeholders filled from each customer's real data
(`{name} {agent} {last_order} {orders} {value} {state} {business}`). Seven ready-made
campaign lists built from the workbook's own segmentation, a guided send sequence that
logs every message, and CSV export of `wa.me` links for a BSP or bulk tool.

**Customer 360 drawer** — every field from every sheet the account appears in,
pitch angle, churn reason, GSTIN, address, source link, and full activity history.

**Everywhere** — global search (Ctrl+K) across names, phones, GSTINs and states;
sortable, filterable, paginated grids with column toggles; CSV export on every table;
dark and light themes; responsive to phone width; print/PDF friendly.

---

## Deploy the frontend to GitHub Pages

```bash
git init
git add .
git commit -m "Oakcraft CRR Tracker"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Source → GitHub Actions**.

The included workflow (`.github/workflows/deploy.yml`) publishes on every push.
Your site goes live at `https://<your-username>.github.io/<your-repo>/`.

> Prefer no Actions? **Settings → Pages → Source → Deploy from a branch → main → / (root)**.
> The `.nojekyll` file is already present so the `data/` and `js/` folders are served as-is.

The site is fully static — it also runs by simply opening `index.html` from disk,
with no server needed.

---

## Connect the Google Sheets backend

1. Create a Google Sheet, e.g. **Oakcraft CRR Tracker**.
2. **Extensions → Apps Script**, delete the sample code.
3. Paste all of [`backend/Code.gs`](backend/Code.gs) and save.
4. Run the `setup` function once and grant permissions. It creates three tabs:
   **Activity Log**, **Customer Status**, **Summary**.
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the `/exec` URL.
7. In [`js/config.js`](js/config.js) set:

```js
apiUrl: 'https://script.google.com/macros/s/AKfycb.../exec',
apiKey: 'OAKCRAFT-CRR-2026'   // must match API_KEY in Code.gs
```

Commit and push. The sidebar indicator turns green and every logged activity writes
straight into your sheet. Optionally run `installTriggers()` in Apps Script to refresh
the Summary tab every 15 minutes.

Leave `apiUrl` empty and everything still works — activity is stored in the browser
and can be exported to CSV at any time.

---

## Rebuilding the data

The JSON in `data/` is generated from the source workbook:

```bash
pip install openpyxl
SRC_XLSX=/path/to/CRR_Calling_Data_Reprot.xlsx python3 build_data.py
```

This writes `meta`, `analytics`, `customers` and one `module-*` file per sheet, as
both `.json` (for any consumer) and `.js` (so the site also runs from `file://`).
Row counts and value totals are asserted against the workbook on every build.

---

## Project structure

```
index.html                  entry point
build_data.py               Excel → JSON/JS pipeline
css/styles.css              design system, dark + light
js/config.js                ← your settings live here
js/core.js                  formatting, storage, WhatsApp, CSV
js/charts.js                SVG chart engine (no libraries)
js/data.js                  data loader
js/grid.js                  sortable/filterable data grid
js/tracker.js               call tracker, Sheets sync, WhatsApp
js/views.js                 dashboard, analytics, queue, tracker, campaigns, modules
js/app.js                   shell, routing, drawer, modals
data/                       generated real data
backend/Code.gs             Google Apps Script backend
.github/workflows/deploy.yml
```

No build step, no npm, no CDN, no external requests. Everything is vendored.

---

## Configuration reference — `js/config.js`

| Key | Purpose |
|---|---|
| `apiUrl` | Apps Script `/exec` URL. Blank = offline mode. |
| `apiKey` | Shared secret; must match `API_KEY` in `Code.gs`. |
| `countryCode` | Dial code prefixed to 10-digit numbers. Default `91`. |
| `waTemplates` | WhatsApp message templates with placeholders. |
| `defaultAgent` | Name substituted for `{agent}`. |
| `dispositions` | Call outcome options. |
| `positiveDispositions` | Which outcomes count as positive in KPIs. |
| `pageSize` | Table rows per page. Default 50. |
