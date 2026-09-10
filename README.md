# Sleepy Owl — RTD Inventory Dashboard

A management dashboard for monitoring **RTD Cans & RTD Bottles**: current inventory, shelf-life
buckets, vendor stock, MTD sales, demand plan, DRR/DOH, and a FEFO-based **70%+ stock coverage**
calculation.

This README is written for a beginner. Follow it top-to-bottom the first time.

---

## 1. What this app does

It reads your two Google Sheets, cleans and combines the data, runs the business calculations, and
shows them on a clean web dashboard:

- **Inventory overview** — total JWL stock split into shelf-life buckets (>70% / 50–70% / <50%) and vendor stock.
- **70%+ stock coverage (FEFO)** — how many days your above-70% stock will last, *correctly* accounting for batches that drop below 70% before they can be sold. Computed on a **Sales** basis and a **Demand-plan** basis, with per-SKU and per-batch detail.
- **SKU table** — per-SKU inventory, sales, demand, DRR and DOH.
- **Batch table** — every batch × location with its shelf-life % and the date it drops to 70%.
- **Data quality** — warns about missing dates, unmapped SKUs, etc. instead of silently miscalculating.

## 2. How the architecture works

```
Google Sheets  ──►  /api/sync  ──►  Supabase (Postgres)  ──►  Next.js dashboard ──► Vercel
(source of truth)   (read+clean)     (stored snapshot)         (reads + calculates)
```

- **Google Sheets** stay the source of truth. You keep editing them as normal.
- **Sync** reads the sheets, cleans them, and stores a snapshot in Supabase.
- **The dashboard** reads that snapshot and computes every metric fresh on each page load.
- If Supabase isn't configured, the dashboard falls back to reading the sheets live.

## 3. How Google Sheets connect

The app reads specific tabs via Google's public CSV export (the sheets are shared as "Anyone with
the link"). The sheet IDs and tab names live in [`src/lib/constants.ts`](src/lib/constants.ts):

- **Inventory & Sales** workbook: `JWL Racks Stock Count`, `Low Shelf Life`, `RTD at Lotus` (vendor), `MTD Sales`.
- **Demand Plan** workbook: the monthly RTD demand tab (e.g. `Sep'26 RTD DP`).

> The demand tab is named per-month. Each month, update `SHEETS.demand.tab` in `constants.ts`
> (or set the `DEMAND_TAB` environment variable) to the new tab name.

## 4. How Supabase is used

Supabase is the database. Tables (see [`supabase/schema.sql`](supabase/schema.sql)):
`sku_master`, `inventory_batches`, `sales_mtd`, `demand_plan`, `sync_log`. Only the **server**
touches Supabase, using the secret service-role key; Row Level Security blocks everyone else.

## 5. Run the project locally

```bash
npm install
npm run dev
```

Then open **http://localhost:3000**.

Run the tests (the business calculations):

```bash
npm test
```

## 6. Refresh / sync data

Click **“Refresh data”** in the dashboard header. It calls `POST /api/sync`, which re-reads the
sheets and rewrites the Supabase snapshot, then reloads the page. (With no Supabase configured, it
simply re-reads the live sheets.)

## 7. Deploy to Vercel

See the step-by-step in section 10 of the chat, or in short:
1. Push this folder to a **GitHub** repository.
2. Import the repo at **vercel.com** → New Project.
3. Add the environment variables (below) in Vercel’s **Settings → Environment Variables**.
4. Deploy. Vercel auto-detects Next.js — no extra config needed.

## 8. Environment variables

Set these in `.env.local` for local dev, and in Vercel for production. Never commit real values.

| Variable | What it is | Where to find it |
| --- | --- | --- |
| `SUPABASE_URL` | Your Supabase project URL | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret server key | Supabase → Settings → API → `service_role` |
| `DEMAND_TAB` *(optional)* | Override the demand tab name | — |
| `DASHBOARD_TODAY` *(optional)* | Force "today" (YYYY-MM-DD) for testing | — |

A template is in [`.env.example`](.env.example).

## 9. How to add a new SKU

1. Open [`src/lib/constants.ts`](src/lib/constants.ts).
2. Add an entry to `SKU_MASTER` with its `root`, canonical `sku` (`-C24`/`-C12`), `name`,
   `category` (`"RTD Cans"` or `"RTD Bottles"`), and `unitsPerCase`.
3. Make sure the SKU appears in your sheets (inventory / sales / demand).
4. Click **Refresh data**. That's it — everything recomputes automatically.

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Couldn't load the dashboard data" | A sheet isn't shared "Anyone with the link", a tab was renamed, or no internet. |
| Numbers look stale | Click **Refresh data** to re-sync. |
| A SKU is missing | Check the SKU code's root matches `SKU_MASTER`; check the Data Quality panel. |
| Demand shows as missing | The demand tab name changed for the new month — update `DEMAND_TAB` / `constants.ts`. |
| "Could not read Supabase" | Check `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, then restart `npm run dev`. |

## 11. How to extend later

The code is structured so you can add:

- **More categories / warehouses / vendors** — extend `SKU_MASTER`, the parsers in
  `src/lib/sheets/parse.ts`, and the `location_type` handling.
- **Alerts** (low stock, high DOH, batch expiry) — read from the same computed `DashboardData`.
- **History / trends** — the `sync_log` table already timestamps every refresh; add a snapshot table.

Key folders:

```
src/lib/calc/       business calculations (fefo, shelf-life, drr) + tests
src/lib/sheets/     read & parse the Google Sheets
src/lib/supabase/   database client + read/write
src/lib/data/       load data (DB or live) + sync
src/components/     dashboard UI
src/app/            Next.js pages & API route
supabase/schema.sql database schema
```

---

Built with Next.js + TypeScript + Tailwind + Supabase.
