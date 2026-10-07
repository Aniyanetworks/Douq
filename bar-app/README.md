# Mug Club – bartender site

A small React site for bar staff:

- **Members** – search a mug number or name and see this month's perks (Free Monthly Pour, 50% off 4-Pack, Merchandise 10%, Special Mug Pricing (24oz beer at the 16oz price)) as *Available* or *Used*, plus whether the Initial Member Pour was given. Refreshes every minute.
- **Log** – redemptions, voids and alerts for a date range, with filters, totals and CSV export.

The site never talks to GHL directly. It calls the **Bartender Site API** n8n workflow (`6-bartender-api.json`), which checks the staff PIN and reads GHL with the n8n credential, so no GHL token reaches the browser.

## Run locally

```sh
npm install
npm run dev
```

Without `VITE_API_URL` the site runs on demo data (PIN `1234`). To use real data, copy `.env.example` to `.env.local` and set the n8n webhook URL.

## Deploy on Netlify

1. Netlify → **Add new site → Import an existing project** → pick the GitHub repo. Set the site's **Base directory** to `bar-app` (Site settings → Build & deploy). The `netlify.toml` in the repo root supplies the build command and publish folder.
2. **Site settings → Environment variables** → add `VITE_API_URL` = the Production URL of the **Bar API Webhook** node (ends in `/webhook/bar-api`).
3. Deploy. Every push to `main` redeploys.

## Staff PIN

Set `STAFF_PIN` in the **Config** node of the Bartender Site API workflow. The API refuses every request while it is still `CHANGE-ME`. Change it when staff leave; everyone is logged out on their next refresh.
