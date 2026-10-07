# Craft Mountain – Member Counter

The same staff app as `bar-app`, in the green "Member Counter" design:

- **Member counter** – find a member by name, phone or mug number, see this month's perks as Available or Used, move the **Mug Order Pipeline** (Ordered by Member → Order Processing by Vendor → Received by Bartender → Delivered to Member, or Cancelled) and read the member's benefit history and reminders.
- **Activity** – the perk log for a date range with filters, totals and CSV export. A name opens that member on the counter.
- **Reminders** – the unused-perk reminders that were sent.

It talks to the same **Bartender Site API** n8n workflow (`6-bartender-api.json`) as `bar-app`, and it imports the API client and date helpers from `../bar-app/src`, so keep that folder in the repo. Nothing in `bar-app` changes.

## Run locally

```sh
npm install
npm run dev
```

Without `VITE_API_URL` the site runs on demo data (PIN `1234`). To use real data, copy `.env.example` to `.env.local` and set the n8n webhook URL (the same value as `bar-app`).

## Deploy on Netlify (a second site)

1. Netlify → **Add new site → Import an existing project** → the same GitHub repo.
2. Set **Base directory** to `counter-app`. The `netlify.toml` in the repo root supplies the build command and publish folder; it has no `base` line, so each site keeps its own Base directory.
3. Add the environment variable `VITE_API_URL` = the Production URL of the **Bar API Webhook** node (ends in `/webhook/bar-api`).
4. Deploy.

The staff PIN is the same one set in the **Config** node of the Bartender Site API workflow.
