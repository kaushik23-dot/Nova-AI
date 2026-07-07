# Nova booking system — runbook

Plain-language guide to switching the booking system on, and running it afterwards.
The moving parts: **book.html** (the page) → **Google Apps Script** (the brain) →
**Google Sheets** (your CRM) + **Google Calendar** (your schedule) + **Resend** (emails).

---

## One-time setup (~20 minutes)

### 1. Resend (email) — free

1. Sign up at [resend.com](https://resend.com) (free plan: 3,000 emails/month).
2. Dashboard → **API Keys** → **Create API Key** → copy it (starts `re_`).
3. ⚠️ **Until you verify a domain**, Resend only delivers to *your own* email
   (Kaushikstunz2309@gmail.com). Perfect for testing. The day you own a domain:
   Resend → **Domains** → **Add Domain** → add the DNS records it shows you →
   then do step "Switching to your own domain" below.

### 2. Google Sheet + Apps Script (the backend)

1. Go to [sheets.new](https://sheets.new) → name the spreadsheet **Nova CRM**.
2. Menu: **Extensions → Apps Script**.
3. In the editor, click **Project Settings** (gear icon) → tick
   **"Show 'appsscript.json' manifest file in editor"**. Also check
   **Time zone** says *(GMT+12:00) Auckland* — the manifest sets it, but verify.
4. Back in the **Editor** tab:
   - Open `appsscript.json` → replace its contents with the file
     `apps-script/appsscript.json` from the site repo → Save.
   - Open `Code.gs` → replace its contents with `apps-script/Code.gs`
     from the repo → Save.
5. **Project Settings → Script Properties → Add script property**:
   - `RESEND_API_KEY` = your key from step 1. *(This is the only place the
     key ever lives — never in code, never in the repo.)*
6. Editor → select the function **`setup`** in the toolbar dropdown → **Run**.
   Google will ask you to authorise (Sheets, Calendar, external requests) —
   approve it. This builds the **Bookings** + **Dashboard** tabs, the stage
   dropdown & colours, and installs the every-5-minutes reminder trigger.
7. **Deploy → New deployment → Web app**:
   - Description: `nova booking`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** → copy the **Web app URL** (ends in `/exec`).

### 3. Wire the website to the backend

1. Open `js/booking.js` in the site repo.
2. Paste the Web app URL into the `API_URL` constant at the top.
3. Commit and push — Cloudflare redeploys the site automatically (~1 min).

*(Ask Claude to do step 3 — paste the URL into the chat.)*

### 4. Prove it works (end-to-end test)

1. Open the live booking page → book a real slot **using your own email**.
2. Check, in order: the success screen → the **Bookings** row in the Sheet →
   the event in Google Calendar (online bookings include a Meet link) →
   the confirmation email in your inbox.
3. Delete the test row from the Sheet and the test event from Calendar.

---

## Day-to-day

- **Your CRM is the Sheet.** Every booking appears as a row, already staged
  **New**. Work the pipeline by changing the **Stage** dropdown
  (New → Confirmed → Met → Proposal Sent → Won → Lost — colour-coded),
  jotting **Notes**, and setting **Next follow-up** dates.
  The **Dashboard** tab shows this week's count, totals per stage, and the
  next 10 meetings — it updates itself.
- **Reminders are automatic**: 24 hours and ~30 minutes before each meeting.
  The `Reminder24hSent` / `Reminder30mSent` columns tick themselves — never
  edit those by hand unless you *want* a reminder to send again.
- **Cancelling a booking**: delete (or strike out) the row in the Sheet and
  delete the Calendar event, then email the client — v1 has no cancel button.

---

## Changing things later

| You want to… | Do this |
|---|---|
| Change hours / days / slot length / notice / address / services | Edit the `CONFIG` block at the top of `Code.gs` → Save → **Deploy → Manage deployments → ✏️ Edit → Version: New → Deploy**. (Same URL keeps working.) |
| Switch to your own domain for email | Verify the domain in Resend, then Script Properties → add `RESEND_FROM` = `kaushik@yourdomain.co.nz`. No redeploy needed. |
| Change email wording | Edit the three `*Email_` template functions in `Code.gs` → new deployment version (same as changing hours). |
| Change the booking page look/copy | It's just `book.html` + the `11m. BOOKING PAGE` section of `css/style.css` — edit, push, done. |

## Where things live

| Thing | Where |
|---|---|
| Resend API key | Apps Script → Project Settings → Script Properties (`RESEND_API_KEY`) |
| Backend code | `apps-script/Code.gs` in the repo (paste into Apps Script when it changes) |
| Booking page | `book.html`, `js/booking.js`, `css/style.css` §11m |
| CRM | The **Nova CRM** Google Sheet (Bookings + Dashboard tabs) |
| Reminder engine | Apps Script trigger → runs `scanReminders` every 5 min |
