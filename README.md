# Money Pay

Loan application platform built with Next.js (App Router) + TypeScript + Tailwind CSS v4 + Supabase.
Applicants apply, upload KYC documents and pay a ₹299 application fee by UPI. Reviewers approve or decline
from an admin console. Approved applications go to the disclosed lending partner. Declined applications
with a confirmed payment are refunded.

## Rules enforced in the database (not just the UI)
- **Lender disclosure first.** Applications are refused until a lender name and RBI registration number are
  set in `src/config/site.ts`. The disclosure appears on every page and is saved with each application.
- **Refund on decline.** Declining an application whose ₹299 payment was confirmed puts it in the refund queue.
  It stays there, with a due date, until a refund UTR is recorded. If the payment can't be found, the applicant
  is told why and pointed to the grievance officer.
- Approval requires KYC verified (KYC tab) and payment confirmed. Declining requires a note to the applicant.
- KYC has its own status: to verify → verified, problem found, or new document requested. A requested document is re-uploaded by the applicant on their application page, which puts it back in the KYC queue.
- One application under review per user. A UTR or payment screenshot can be used only once.
- All writes go through validated `security definer` RPCs. Applicants can read only their own rows, KYC and documents.
- Every step is written to `application_events` and shown as a timeline to the applicant and the admin.

## Setup
Requires Node.js 20.9+.

```bash
npm install
cp .env.example .env.local   # URL + publishable key; service role key is server-only
npm run dev
```

1. Create a Supabase project and run **`supabase/schema.sql`** in the SQL Editor.
   The file is idempotent: run it on a new project, or re-run it to upgrade an existing installation (data is kept).
2. **Authentication → Sign In / Providers → Email → turn OFF "Confirm email".**
   Accounts log in with **mobile number + password**. Internally each account uses a hidden
   address like `m9876543210@phone.moneypay.invalid` (never emailed), so no SMS provider is needed.
   The user's real email is optional and saved separately.
3. Auth → URL Configuration: set Site URL (e.g. `http://localhost:3000`).
4. Create your admin account (email + password): Supabase → **Authentication → Users → Add user → Create new user**,
   enter the email and password, tick **Auto Confirm User**. Then promote it in the SQL Editor:
   ```sql
   insert into public.admin_users(user_id)
   select id from auth.users where email = 'admin@yourcompany.com'
   on conflict do nothing;
   ```
5. Fill in **`src/config/site.ts`** (there is no Settings page; these values are fixed in code):
   - Lender legal name, type, RBI registration number, grievance officer name + email, refund window.
   - Payee name and UPI ID, and put the payment QR image in `public/` and set `qr_path` to its file name.
6. Run **`npm run sync-settings`** to copy them into the database (it checks them when accepting applications).
   Re-run it after every edit of `src/config/site.ts`. It tells you what is still missing; once complete, applications are open.

### Upgrading from the previous version
Re-run `supabase/schema.sql`. It drops the old `submit_application*` / `review_application*` RPCs, adds the refund,
timeline and settings tables, backfills reference codes and timeline events, and moves previously declined applications
with a confirmed payment into the refund queue. Applications submitted before this version have no refund UPI ID; refund
them to the account that paid (the UTR is shown).

## Pages
| Route | What it is |
|---|---|
| `/` | Landing page |
| `/login` | Login hub, all by **mobile number + password**: **My loan** (approved borrowers, admin-generated password) and **Track application** (applicants) |
| `/borrower` | Borrower dashboard. **One login per mobile number**: with several loans the borrower first sees a "My loans" list, then each loan's amount, EMI, schedule (CSV), documents and history |
| `/apply` | Sign up / sign in, 4-step application wizard, application timeline & refund status |
| `/admin/login` | Admin sign-in (admins only; no sign-up). `/admin` redirects here when signed out |
| `/admin` | Admin console (see below) |
| `/how-it-works`, `/questions`, `/terms`, `/privacy` | Content and legal pages (read lender and refund details from `src/config/site.ts`) |
| `/account/reset` | Password reset landing page |

## Admin console tabs
| Tab | What it's for |
|---|---|
| **Overview** | Review queue, refunds due, loan book at a glance, KYC pending, 14-day chart, what needs attention |
| **Customers** | Everyone who has applied (one row per account). Profile: contact (call / WhatsApp / email), all applications, loans with repayment progress and borrower-login status, fee payments |
| **KYC verification** | Queue of applications whose documents need checking, oldest first. Each one shows the applicant's details, document previews and a checklist. Result: **Verified**, **Ask for new document** (choose which; the applicant re-uploads it) or **Problem found** |
| **Applications** | Payment check and approve / decline (opens the review drawer; approval needs KYC verified first); CSV export |
| **Loans** | Every loan: EMIs paid, outstanding principal, next due, days past due; filters for overdue, needs setup, no borrower login; CSV export |
| **Collections** | EMIs overdue / due today / next 7 and 30 days, overdue ageing (1–30, 31–60, 61–90, 90+ days). Mark an EMI paid in place; WhatsApp reminder with a ready message |
| **Fee payments** | Every ₹299 UTR with its status (to check, received, not found, refund due, refunded) by month, for matching against the bank statement |
| **Refunds** | Refunds to send and recently refunded |
| **Reports** | Any period (this month, last month, 3 months, financial year, custom): applications, approval rate, fees kept, disbursed, EMIs collected, month-by-month table, by-category approval rate, CSV downloads |
| **Activity** | Audit log of every action across all applications, with the admin who did it |
| **Admins** | Who can sign in to the console, and when each last signed in (read-only) |

To add an admin, create the user in Supabase → Authentication and promote them with the SQL in Setup step 4.
To remove one: `delete from public.admin_users where user_id = (select id from auth.users where email = '...');`

WhatsApp buttons open `wa.me` with a pre-filled message; nothing is sent until you tap Send in WhatsApp.

## Code map
- `supabase/schema.sql` — tables, RLS, storage buckets/policies, RPCs
- `src/lib/settings-context.tsx` — exposes the fixed lender + payment details from `src/config/site.ts` to every page
- `src/lib/application-validation.ts` — client validation mirroring the `submit_loan_application` RPC
- `src/components/apply/*` — wizard, application card + timeline, portal
- `src/components/admin/*` — console shell and one file per tab; `portfolio.ts` derives loan rows (EMI status, days past due) and customers from the loaded data; `kit.tsx` holds shared tiles, filters and buttons
- `src/lib/csv.ts` — Excel-safe CSV export used by every tab
- `src/app/globals.css` — design tokens (`@theme`) and component classes

## Checks
```bash
npm run typecheck
npm test          # validation unit tests (Node 22.6+ / 24)
npm run build
```

## Environment variables
| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Public key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Signs 2-minute download links for borrower documents (`/api/borrower/document`). Never prefix with `NEXT_PUBLIC_`. On Vercel, add it as a normal (non-public) env var. |

## Borrower login (approved loans)
1. Admin → Applications → open an **approved** application → **Loan & borrower login**.
2. Enter the loan details from the lender (account no., amount, rate, tenure, dates, status). The EMI is calculated automatically.
3. Click **Generate password**. Share the password with the borrower; they log in with the **mobile number on their application**.
   The password is shown only once; only a bcrypt hash is stored. **Regenerate** creates a new one and signs out old sessions.
4. The borrower logs in at `/login` → **My loan** (mobile number + password).

The borrower portal (`/borrower`) has five tabs: **Overview** (next EMI, progress, outstanding),
**Repayments** (how to pay + schedule with Paid / Overdue / Due / Upcoming), **Documents** (KFS, sanction letter,
agreement, NOC), **Loan details** (disbursement, charges, lender) and **Account** (profile, change password, help).

Admin keeps it up to date from the same review panel, which has four tabs:
- **Loan**: amount, rate, tenure, dates, disbursement, charges, and *how to pay* (lender's method / https link / instructions).
- **EMIs**: mark each instalment paid (date, amount, reference) once the lender confirms it; undo if needed.
- **Documents**: upload PDFs/images (≤10 MB) to the private `loan-documents` bucket; upload the KFS first.
- **Login**: generate / regenerate the borrower password. Sessions last 12 hours; 5 wrong attempts lock the login for 15 minutes.

## Reset an applicant's password
Mobile-number accounts can't receive reset emails. Reset one in Supabase → SQL Editor:
```sql
update auth.users
   set encrypted_password = extensions.crypt('NewPassword123', extensions.gen_salt('bf'))
 where raw_user_meta_data->>'phone' = '9876543210';
```
Then tell the applicant the new password and ask them to keep it private.

## Operational notes
- This is manual UPI verification, not a payment gateway. A screenshot or UTR alone doesn't prove payment.
  Always check the receiving account before choosing "payment found".
- Refunds are sent manually from your UPI/bank app; record the refund UTR in Admin → Refunds.
- Collect fees into a business account in the company's name, and make sure the published lender details are
  accurate and that your arrangement with the lender permits this fee. These are your responsibility as operator.
- KYC review here is manual document checking. It isn't government verification.
- Files from abandoned submissions can stay in storage. Clean them up periodically according to your retention policy.
