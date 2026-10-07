# Craft Mountain – Toast → n8n → GHL Member Benefits

## What's in this package
| File | Purpose |
|---|---|
| `1-toast-ghl-member-benefits.json` | Main workflow: Toast webhook → detect perk → find member by mug # → update GHL / alert |
| `2-monthly-perk-reset.json` | Runs 00:05 on the 1st (Denver time): sets every "Redeemed" status back to "Available" |
| `3-helper-list-ghl-field-ids.json` | Run once to get the GHL custom field IDs for the Config node |
| `test-payload-free-pour.json` | Fake Toast order (mug 037 + Free Monthly Pour) for testing |
| `counter-app/` | A second staff site (green "Member Counter" design) with the same features as `bar-app`; see its README |

## How it works
Bartender rings up a benefit item and types the mug number (e.g. `037`) as the tab name → Toast sends `order_updated` → n8n:
1. Ignores normal orders, open checks, other restaurants (and test-mode orders if enabled)
2. Finds benefit items/discounts by GUID and reads the mug number from `tabName` (`037`, `37`, `#037`, `Mug 37` all work)
3. Searches GHL for the contact whose **Mug Number** field matches
4. Decides:
   - **update** – marks the perk used (Period, Status, Date, Toast Order ID) + adds a note
   - **ignore** – Toast re-sent the same order (duplicate webhook)
   - **alert** – no mug number, unknown mug number, two members with the same mug, or perk already used this month
   - **void** – if the benefit item is voided in Toast, the perk goes back to Available
5. Month comes from Toast's `businessDate`, so a late-night Sept 30 pour counts as September

## Setup

### 1. GHL (Archimedes sub-account)
Create these contact custom fields (folder "Member Benefits"):

| Field | Type |
|---|---|
| Mug Number | Single line (unique per member, e.g. `037`) |
| Free Pour Period | Single line |
| Free Pour Status | Dropdown: `Available`, `Redeemed` |
| Free Pour Redeemed Date | Date |
| Free Pour Toast Order ID | Single line |
| 4-Pack Period / Status / Redeemed Date / Toast Order ID | Same as above |
| Initial Pour Date / Initial Pour Toast Order ID | Date / Single line |

Fill in **Mug Number** for every member and set both statuses to **Available**.

Create a **Private Integration token** (Settings → Private Integrations) with scopes: `contacts.readonly`, `contacts.write`, `locations/customFields.readonly`.

### 2. n8n credential
Credentials → New → **Header Auth**
- Name: `Authorization`
- Value: `Bearer <your GHL private integration token>`

After importing, open every GHL HTTP node (Find Member, Update Member Fields, Add Note, Find Redeemed Members, Set Status, Get Custom Fields) and select this credential. The **Send Alert** node needs no credential.

### 3. Import and configure
1. Import all 3 workflows (Workflows → Import from file).
2. In the helper workflow, replace `REPLACE_WITH_GHL_LOCATION_ID` in the URL and run it. It lists every custom field with its ID.
3. Open **Config** in the main workflow and fill in:
   - `LOCATION_ID`
   - `FIELD_IDS.mugNumber`
   - `BENEFIT_FIELDS` (the Period / Status / Date / Order ID field IDs)
   - `BENEFITS`: replace `REPLACE_WITH_FREE_MONTHLY_POUR_GUID` with the real GUID (menu lookup), add mug/merch GUIDs if they exist
   - `ALERT_WEBHOOK_URL`: a Slack incoming webhook, or a GHL Inbound Webhook workflow that sends an internal notification
4. Open **Build Reset Requests** in the reset workflow and fill in `LOCATION_ID` and the two Status field IDs.

### 4. Test (no POS needed)
1. Create a test contact in GHL with Mug Number `037`, Free Pour Status `Available`.
2. Put the real Free Monthly Pour GUID into `test-payload-free-pour.json`.
3. In the main workflow click **Test workflow**, then send the payload to the **test URL**:
```powershell
Invoke-RestMethod -Method Post -Uri "https://YOUR-N8N/webhook-test/toast-benefits" -ContentType "application/json" -InFile "test-payload-free-pour.json"
```
4. Check the contact: Free Pour Period = `2026-09`, Status = Redeemed, note added.
5. Send the same file again → nothing changes (duplicate).
6. Change `"guid": "test-order-0001"` to `test-order-0002` and send → double-redemption alert.
7. Change `tabName` to `999` → "no member found" alert. Remove it → "no mug number" alert.
8. Change `paymentStatus` to `OPEN` → ignored.
9. Run the reset workflow manually → status back to Available.

### 5. Go live
1. Activate both workflows.
2. Toast Web → Integrations → Toast API access → Webhooks: edit the subscription (or create a new one) with the **production URL**: `https://YOUR-N8N/webhook/toast-benefits`.
3. One test at the bar with Test Mode on: ring **Free Monthly Pour**, tab name `037`, close the check.
4. After go-live, set `IGNORE_TEST_MODE: true` in Config.

### Optional: verify Toast's signature
Copy the subscription **Secret** from Toast into `TOAST_WEBHOOK_SECRET` and set `VERIFY_SIGNATURE: true`. Self-hosted n8n needs `NODE_FUNCTION_ALLOW_BUILTIN=crypto`. Test once with a real Toast order after enabling it. If it rejects valid orders, set it back to `false` and tell me.

## Notes
- Every Toast order reaches n8n, but only benefit orders call GHL, so GHL usage stays low.
- Double redemptions are **flagged after the fact**; Toast can't block them at the register.
- Unlimited perks (mug pricing, merch) only get a note, once per item.
- Insider / VIP tiers: add their items to `BENEFITS`, `BENEFIT_KINDS` and `BENEFIT_FIELDS` when they launch.

## Mug orders (workflow 4 + bar site)
A new member gets a mug **number** from workflow 4, but no mug is ordered automatically. When a member wants one, staff open the member in the bar site and press the first step of the **Mug Order Pipeline** ("Ordered by Member"). That sets Mug Status = `Requested` and the tag `ordered by member`, which starts the vendor flow (see **Vendor mug orders**, workflow 9).

A Toast sale of the **Member Mug** item also starts the order (workflow 1), but only when the member has no mug status yet.

Staff then move the pipeline on to `Received` and `Delivered` (or `Cancelled`) from the bar site; the vendor's confirm link moves it to `Ordered` ("Order Processing by Vendor").

Setup: create the **Mug Status** dropdown field in GHL (`Requested`, `Ordered`, `Received`, `Delivered`, `Cancelled`), then paste its ID into `MUG_STATUS_FIELD` in the Config node of workflow 6.

## Partner invite (workflow 8)
The signup form has an optional "Add a spouse or partner" checkbox plus four Partner fields. When it is ticked:
1. A GHL workflow (trigger: this form submitted, Add Partner = Yes) posts the member's contact id to the `partner-invite` webhook of workflow 8.
2. Workflow 8 creates (or updates) the partner contact: tag `partner-invited`, Partner Status = Invited. The partner's own Partner fields hold the **member's** name, email and phone, so the invite email can say "join Essential Members with <member>".
3. A GHL workflow on the tag `partner-invited` runs for the partner: moves a card into the Partner Conversion pipeline (stage Invited) and sends the invite email.

A partner who already has the `mug-club-member` tag is left alone. The invite is email-only: the partner has not given SMS consent.

## Vendor mug orders (workflow 9)
When a member's mug is ordered (status **Requested**, shown as "Ordered by Member"), the order goes to the vendor without the bartender. Every email and notification is sent by GHL:
1. The vendor (Arcane Engraving) is a GHL **user** with a restricted role. The GHL workflow on the tag `ordered by member` posts the member's contact id to the `mug-order` webhook of workflow 9.
2. Workflow 9 creates a signed **Start processing** link and saves it in the member's custom field **Vendor Order Link**.
3. The GHL workflow waits a minute, then sends an **Internal Notification email** to the vendor user with the mug number, the member name and that link.
4. The vendor opens the link and presses the confirm button. Workflow 9 sets the status to **Ordered** ("Order Processing by Vendor"), adds a note and the tag `order processing by vendor`, so the member message goes out from GHL.
5. The bartender only marks **Received** and **Delivered** in the bar site.
6. Follow-ups are plain GHL steps: wait 1 day and, if the status is still Requested, send "Reminder 1" to the vendor user (same link); wait again for "Reminder 2" and a notification to staff. Once the status changes, the If/Else stops them.

Setup: create the member custom field **Vendor Order Link**, set its id, `SECRET` (30+ random characters) and the web address in the `CFG` and `CFG Confirm 2` nodes of workflow 9, and activate it.
