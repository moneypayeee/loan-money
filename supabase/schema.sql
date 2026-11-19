-- =====================================================================
-- Money Pay — complete database schema
-- ---------------------------------------------------------------------
-- Safe to run on a NEW Supabase project and safe to RE-RUN on an existing
-- installation (it upgrades earlier versions in place, keeping data).
-- Paste the whole file into Supabase → SQL Editor → Run.
--
-- What it sets up
--   • admin_users            – who can use /admin
--   • site_settings          – lender disclosure, grievance officer, refund policy
--   • payment_settings       – payee name, UPI ID, QR image, application fee (set in admin Settings)
--   • applications           – one row per application, incl. refund tracking
--   • application_kyc        – private KYC details (1:1 with applications)
--   • application_events     – audit timeline shown to applicant and admin
--   • loans                  – loan details the admin records after approval
--   • borrower_accounts/_sessions – borrower login: one password per mobile number, all loans
--   • storage buckets + RLS  – public QR, private payment proofs & KYC docs
--   • RPCs                   – the ONLY way to write data (validated server-side)
--
-- Rules enforced here (not just in the UI)
--   • Applications are refused until a lender name + RBI registration number
--     are published, so every applicant sees who the lender is.
--   • Rejecting an application whose ₹299 payment was received creates a
--     refund obligation; it stays in the admin refund queue until a refund
--     UTR is recorded.
--   • Accepting requires payment received + KYC reviewed.
--   • One pending application per user; a UTR can be used only once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Remove legacy RPCs (earlier versions) so old clients cannot bypass
--    the lender-disclosure and refund rules.
-- ---------------------------------------------------------------------
drop function if exists public.submit_application(text,text,text,integer,text,text,text);
drop function if exists public.review_application(uuid,text,boolean,text);
drop function if exists public.submit_application_kyc(text,text,text,integer,text,text,text,jsonb);
drop function if exists public.review_application_kyc(uuid,text,boolean,boolean,text);

-- ---------------------------------------------------------------------
-- 1. Admins
-- ---------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users add column if not exists created_at timestamptz not null default now();
alter table public.admin_users enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()); $$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
drop policy if exists "Admin can read own membership" on public.admin_users;
create policy "Admin can read own membership" on public.admin_users
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. Site settings: lender disclosure + grievance + refund policy
-- ---------------------------------------------------------------------
create table if not exists public.site_settings (
  id                integer primary key default 1 check (id = 1),
  lender_name       text not null default '',
  lender_type       text not null default 'NBFC'
                    check (lender_type in ('NBFC','Bank','Other RBI-regulated entity')),
  lender_reg_no     text not null default '',
  lender_website    text not null default '',
  company_name      text not null default 'Money Pay',
  company_address   text not null default '',
  support_email     text not null default '',
  support_phone     text not null default '',
  grievance_officer text not null default '',
  grievance_email   text not null default '',
  grievance_phone   text not null default '',
  refund_days       integer not null default 7 check (refund_days between 1 and 30),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null
);
insert into public.site_settings(id) values (1) on conflict (id) do nothing;
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
drop policy if exists "Public site settings" on public.site_settings;
create policy "Public site settings" on public.site_settings for select using (true);

-- ---------------------------------------------------------------------
-- 3. Payment settings (application fee is editable in the admin Settings tab)
-- ---------------------------------------------------------------------
create table if not exists public.payment_settings (
  id         integer primary key check (id = 1),
  qr_path    text,
  payee_name text not null default '',
  upi_id     text not null default '',
  fee        integer not null default 299 check (fee between 1 and 100000),
  updated_at timestamptz not null default now()
);
insert into public.payment_settings(id) values (1) on conflict (id) do nothing;
alter table public.payment_settings enable row level security;
revoke all on public.payment_settings from anon, authenticated;
grant select on public.payment_settings to anon, authenticated;
drop policy if exists "Public payment details" on public.payment_settings;
drop policy if exists "Admin edits payment details" on public.payment_settings; -- writes go through RPC now
create policy "Public payment details" on public.payment_settings for select using (true);

-- Editable fee: replace the old "fee = 299" rules on existing databases with a ₹1 – ₹1,00,000 range.
do $$
declare r record;
begin
  for r in select c.conrelid::regclass as tbl, c.conname from pg_constraint c
            where c.contype = 'c' and c.conrelid in ('public.payment_settings'::regclass)
              and pg_get_constraintdef(c.oid) ~* '\mfee\M' loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table public.payment_settings add constraint payment_settings_fee_check check (fee between 1 and 100000);

-- ---------------------------------------------------------------------
-- 4. Applications
-- ---------------------------------------------------------------------
create table if not exists public.applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  full_name        text not null check (length(trim(full_name)) between 2 and 100),
  phone            text not null check (phone ~ '^[6-9][0-9]{9}$'),
  category         text not null check (category in ('Student','Driver','Employed','Self-employed','Unemployed')),
  requested_amount integer not null check (requested_amount between 1000 and 500000),
  transaction_id   text not null unique check (transaction_id ~ '^[A-Za-z0-9]{6,40}$'),
  proof_path       text not null,
  fee              integer not null default 299 check (fee between 1 and 100000),
  payee_name       text not null,
  upi_id           text not null,
  qr_path          text not null,
  status           text not null default 'pending' check (status in ('pending','accepted','rejected')),
  payment_verified boolean not null default false,
  admin_note       text not null default '',
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);
-- Editable fee: replace the old "fee = 299" rule on existing databases (each application keeps the fee it was charged).
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.contype = 'c' and c.conrelid = 'public.applications'::regclass
              and pg_get_constraintdef(c.oid) ~* '\mfee\M' loop
    execute format('alter table public.applications drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.applications add constraint applications_fee_check check (fee between 1 and 100000);
-- Columns added after v1 (no-ops when already present)
alter table public.applications add column if not exists kyc_verified boolean not null default false;
alter table public.applications add column if not exists ref_code text;
alter table public.applications add column if not exists refund_upi_id text
  check (refund_upi_id is null or refund_upi_id ~ '^[A-Za-z0-9._-]{2,128}@[A-Za-z][A-Za-z0-9.-]{1,63}$');
alter table public.applications add column if not exists refund_status text not null default 'not_applicable'
  check (refund_status in ('not_applicable','pending','refunded'));
alter table public.applications add column if not exists refund_reference text;
alter table public.applications add column if not exists refunded_at timestamptz;
alter table public.applications add column if not exists refunded_by uuid references auth.users(id);
alter table public.applications add column if not exists lender_name text;
alter table public.applications add column if not exists lender_reg_no text;
alter table public.applications add column if not exists updated_at timestamptz not null default now();
-- Optional email the applicant gave at sign-up (login is by mobile number)
alter table public.applications add column if not exists contact_email text
  check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.applications add column if not exists referred_by_code text;
create index if not exists applications_phone_idx on public.applications(phone) where status = 'accepted';
-- KYC is checked on its own (KYC tab) before the approve / decline decision
alter table public.applications add column if not exists kyc_status text not null default 'pending'
  check (kyc_status in ('pending','verified','problem','resubmit'));
alter table public.applications add column if not exists kyc_note text not null default '' check (length(kyc_note) <= 1000);
alter table public.applications add column if not exists kyc_requested_docs text[] not null default '{}';
alter table public.applications add column if not exists kyc_reviewed_at timestamptz;
alter table public.applications add column if not exists kyc_reviewed_by uuid references auth.users(id) on delete set null;
-- Applications reviewed before the KYC tab existed keep their KYC result
update public.applications set kyc_status = 'verified', kyc_reviewed_at = coalesce(kyc_reviewed_at, reviewed_at)
 where kyc_verified and kyc_status = 'pending';
create index if not exists applications_kyc_queue_idx on public.applications(kyc_status, created_at) where status = 'pending';

-- Human-friendly reference, e.g. MP-7F3A9C21 (backfill existing rows)
update public.applications
   set ref_code = 'MP-' || upper(substr(replace(id::text,'-',''),1,8))
 where ref_code is null;
create unique index if not exists applications_ref_code_key on public.applications(ref_code);

create unique index if not exists one_pending_application_per_user
  on public.applications(user_id) where status = 'pending';
create index if not exists applications_status_created_idx on public.applications(status, created_at desc);
create index if not exists applications_user_created_idx   on public.applications(user_id, created_at desc);
create index if not exists applications_refund_idx         on public.applications(refund_status) where refund_status = 'pending';

alter table public.applications enable row level security;
revoke all on public.applications from anon, authenticated;
grant select on public.applications to authenticated;
drop policy if exists "Applicants read own; admins read all" on public.applications;
create policy "Applicants read own; admins read all" on public.applications
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------
-- 5. KYC details (private)
-- ---------------------------------------------------------------------
create table if not exists public.application_kyc (
  application_id     uuid primary key references public.applications(id) on delete cascade,
  dob                date not null,
  address            text not null check (length(trim(address)) between 10 and 500),
  city               text not null check (length(trim(city)) between 2 and 100),
  state              text not null check (length(trim(state)) between 2 and 100),
  pincode            text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  identity_type      text not null check (identity_type in ('Voter ID','Passport','Driving licence')),
  identity_last4     text not null check (identity_last4 ~ '^[A-Za-z0-9]{4}$'),
  institution        text,
  identity_path      text not null,
  identity_back_path text,
  address_path       text not null,
  student_path       text,
  consent_at         timestamptz not null default now()
);
-- Extra documents & contact details collected by the form (were previously not saved)
alter table public.application_kyc add column if not exists aadhaar_back_path text;
alter table public.application_kyc add column if not exists pan_path          text;
alter table public.application_kyc add column if not exists driving_path      text;
alter table public.application_kyc add column if not exists id_card_path      text;
alter table public.application_kyc add column if not exists id_card_back_path text;
alter table public.application_kyc add column if not exists alt_phone         text check (alt_phone is null or alt_phone ~ '^[6-9][0-9]{9}$');
alter table public.application_kyc add column if not exists email             text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.application_kyc enable row level security;
revoke all on public.application_kyc from anon, authenticated;
grant select on public.application_kyc to authenticated;
drop policy if exists "Read own KYC or admin" on public.application_kyc;
create policy "Read own KYC or admin" on public.application_kyc for select to authenticated using (
  public.is_admin() or exists(
    select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
);

-- ---------------------------------------------------------------------
-- 6. Audit timeline
-- ---------------------------------------------------------------------
create table if not exists public.application_events (
  id             bigint generated always as identity primary key,
  application_id uuid not null references public.applications(id) on delete cascade,
  kind           text not null,
  note           text not null default '',
  actor          uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists application_events_app_idx on public.application_events(application_id, created_at);
alter table public.application_events enable row level security;
revoke all on public.application_events from anon, authenticated;
grant select on public.application_events to authenticated;
drop policy if exists "Read own events or admin" on public.application_events;
create policy "Read own events or admin" on public.application_events for select to authenticated using (
  public.is_admin() or exists(
    select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
);

-- Backfill a 'submitted' event for applications created before the timeline existed
insert into public.application_events(application_id, kind, note, actor, created_at)
select a.id, 'submitted', 'Application submitted', a.user_id, a.created_at
  from public.applications a
 where not exists (select 1 from public.application_events e where e.application_id = a.id);

-- ---------------------------------------------------------------------
-- 7. Storage buckets & policies
-- ---------------------------------------------------------------------
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
  ('payment-qr',     'payment-qr',     true,  2097152, array['image/png','image/jpeg','image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png','image/jpeg','image/webp']),
  ('kyc-documents',  'kyc-documents',  false, 5242880, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Read published QR" on storage.objects;
create policy "Read published QR" on storage.objects
  for select using (bucket_id = 'payment-qr');

drop policy if exists "Admin uploads QR" on storage.objects;
create policy "Admin uploads QR" on storage.objects
  for insert to authenticated with check (bucket_id = 'payment-qr' and public.is_admin());

drop policy if exists "Applicants upload own proof" on storage.objects;
create policy "Applicants upload own proof" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Read own proof or admin" on storage.objects;
create policy "Read own proof or admin" on storage.objects
  for select to authenticated using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "Applicants upload own KYC" on storage.objects;
create policy "Applicants upload own KYC" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'kyc-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Read own KYC documents or admin" on storage.objects;
create policy "Read own KYC documents or admin" on storage.objects
  for select to authenticated using (
    bucket_id = 'kyc-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------
-- 7b. Referral & Coin Rewards tables (defined before RPCs that reference them)
-- ---------------------------------------------------------------------
create table if not exists public.referral_config (
  id                    integer primary key default 1 check (id = 1),
  enabled               boolean not null default true,
  coins_per_referral    integer not null default 1000 check (coins_per_referral >= 0),
  rupees_per_1000_coins integer not null default 100 check (rupees_per_1000_coins > 0),
  min_redeem_coins      integer not null default 1000 check (min_redeem_coins >= 100),
  award_trigger         text not null default 'fee_verified' check (award_trigger in ('fee_verified','submitted')),
  updated_at            timestamptz not null default now()
);
insert into public.referral_config(id) values (1) on conflict (id) do nothing;
alter table public.referral_config enable row level security;
revoke all on public.referral_config from anon, authenticated;
grant select on public.referral_config to anon, authenticated;
drop policy if exists "Public referral config" on public.referral_config;
create policy "Public referral config" on public.referral_config for select using (true);

create table if not exists public.user_wallets (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique,
  coins_balance integer not null default 0 check (coins_balance >= 0),
  saved_upi_id  text,
  updated_at    timestamptz not null default now()
);
alter table public.user_wallets enable row level security;
revoke all on public.user_wallets from anon, authenticated;
grant select on public.user_wallets to authenticated;
drop policy if exists "Read own wallet or admin" on public.user_wallets;
create policy "Read own wallet or admin" on public.user_wallets
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create table if not exists public.referrals (
  id                      uuid primary key default gen_random_uuid(),
  referrer_user_id        uuid not null references auth.users(id) on delete cascade,
  referrer_code           text not null,
  referred_user_id        uuid not null unique references auth.users(id) on delete cascade,
  referred_application_id uuid references public.applications(id) on delete set null,
  referred_name           text not null,
  referred_phone          text not null,
  coins_awarded           integer not null default 0 check (coins_awarded >= 0),
  status                  text not null default 'pending' check (status in ('pending','completed')),
  created_at              timestamptz not null default now(),
  completed_at            timestamptz
);
create index if not exists referrals_referrer_idx on public.referrals(referrer_user_id, created_at desc);
alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;
grant select on public.referrals to authenticated;
drop policy if exists "Read own referrals or admin" on public.referrals;
create policy "Read own referrals or admin" on public.referrals
  for select to authenticated using (referrer_user_id = auth.uid() or public.is_admin());

create table if not exists public.payout_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  user_name     text not null,
  user_phone    text not null,
  upi_id        text,
  coins         integer not null check (coins > 0),
  amount_rupees integer not null check (amount_rupees > 0),
  status        text not null default 'pending' check (status in ('pending','paid','declined')),
  payout_utr    text,
  admin_note    text,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  processed_by  uuid references auth.users(id) on delete set null
);
create index if not exists payout_requests_user_idx on public.payout_requests(user_id, created_at desc);
create index if not exists payout_requests_status_idx on public.payout_requests(status, created_at desc);
alter table public.payout_requests enable row level security;
revoke all on public.payout_requests from anon, authenticated;
grant select on public.payout_requests to authenticated;
drop policy if exists "Read own payouts or admin" on public.payout_requests;
create policy "Read own payouts or admin" on public.payout_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Payout method: a UPI ID or a label such as 'Bank Transfer' / 'Bank / UPI transfer'.
-- (An older version only allowed UPI IDs here, which blocked admin bank payouts.)
alter table public.payout_requests drop constraint if exists payout_requests_upi_id_check;
alter table public.payout_requests add constraint payout_requests_upi_id_check
  check (upi_id is null or length(trim(upi_id)) between 2 and 128);

-- Per-referral payout tracking (admin ticks approved referrals and pays them together)
-- and a 'declined' state for referrals whose application was rejected.
alter table public.referrals add column if not exists paid_at timestamptz;
alter table public.referrals add column if not exists payout_id uuid references public.payout_requests(id) on delete set null;
alter table public.referrals drop constraint if exists referrals_status_check;
alter table public.referrals add constraint referrals_status_check check (status in ('pending','completed','declined'));

-- Fast duplicate-applicant checks (same mobile number or email)
create index if not exists applications_phone_any_idx on public.applications(phone);
create index if not exists applications_email_any_idx on public.applications(lower(contact_email));

-- ---------------------------------------------------------------------
-- 8. RPC: applicant submits an application (atomic: application + KYC + event)
-- ---------------------------------------------------------------------
drop function if exists public.submit_loan_application(text,text,text,integer,text,text,text,text,jsonb);
create or replace function public.submit_loan_application(
  p_full_name        text,
  p_phone            text,
  p_category         text,
  p_requested_amount integer,
  p_transaction_id   text,
  p_proof_path       text,
  p_expected_qr      text,
  p_refund_upi_id    text,
  p_kyc              jsonb,
  p_referral_code    text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_site      public.site_settings;
  v_payment   public.payment_settings;
  v_id        uuid;
  v_ref       text;
  v_dob       date;
  v_txn       text := upper(trim(coalesce(p_transaction_id,'')));
  v_refund    text := lower(trim(coalesce(p_refund_upi_id,'')));
  v_doc       text;
  v_ref_input text := upper(trim(coalesce(p_referral_code,'')));
  v_referrer  uuid;
  v_rcfg      public.referral_config;
  v_email     text := lower(trim(coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'contact_email'), ''), p_kyc->>'email', '')));
begin
  if v_uid is null then raise exception 'Please sign in to submit an application.'; end if;

  -- One application per person: the same mobile number or email can't apply twice.
  perform pg_advisory_xact_lock(hashtext('apply-phone:' || trim(coalesce(p_phone,''))));
  if exists(select 1 from public.applications where phone = trim(coalesce(p_phone,''))) then
    raise exception 'An application with this mobile number already exists. Please contact us on WhatsApp for help.';
  end if;
  if v_email <> '' and exists(select 1 from public.applications where lower(contact_email) = v_email) then
    raise exception 'An application with this email ID already exists. Please contact us on WhatsApp for help.';
  end if;

  -- Lender disclosure must be published before anyone can apply.
  select * into v_site from public.site_settings where id = 1;
  if coalesce(trim(v_site.lender_name),'') = '' or coalesce(trim(v_site.lender_reg_no),'') = '' then
    raise exception 'Applications are closed until lender details are published.';
  end if;

  -- One application per hidden account: a second person must never be filed under an
  -- earlier applicant's account (their referral would then look like a self-referral).
  if exists(select 1 from public.applications where user_id = v_uid) then
    raise exception 'This form session was already used for an application. Please reload the page and apply again.';
  end if;
  if v_txn !~ '^[A-Z0-9]{6,40}$' then
    raise exception 'Enter a valid UPI transaction reference (UTR).';
  end if;
  if exists(select 1 from public.applications where transaction_id = v_txn) then
    raise exception 'This UTR has already been used for another application.';
  end if;
  if v_refund !~ '^[a-z0-9._-]{2,128}@[a-z][a-z0-9.-]{1,63}$' then
    raise exception 'Enter a valid UPI ID for refunds (e.g. name@okbank).';
  end if;

  -- KYC
  if p_kyc is null or coalesce(p_kyc->>'consent','') <> 'true' then
    raise exception 'KYC consent is required.';
  end if;
  begin
    v_dob := (p_kyc->>'dob')::date;
  exception when others then
    raise exception 'Enter a valid date of birth.';
  end;
  if v_dob is null or v_dob > (current_date - interval '18 years')::date
     or v_dob < (current_date - interval '120 years')::date then
    raise exception 'Applicant must be between 18 and 120 years old.';
  end if;
  if p_category = 'Driver' and (p_kyc->>'identity_type') is distinct from 'Driving licence' then
    raise exception 'Drivers must upload a driving licence.';
  end if;
  if p_category = 'Student' and (
       length(trim(coalesce(p_kyc->>'institution',''))) not between 2 and 150
       or nullif(p_kyc->>'student_path','') is null) then
    raise exception 'Students must provide their institution and student ID.';
  end if;

  foreach v_doc in array array[p_kyc->>'identity_path', p_kyc->>'address_path'] loop
    if v_doc is null or not exists(
         select 1 from storage.objects
          where bucket_id = 'kyc-documents' and name = v_doc
            and (storage.foldername(name))[1] = v_uid::text) then
      raise exception 'Upload your identity document and address proof.';
    end if;
  end loop;
  foreach v_doc in array array[p_kyc->>'identity_back_path',
                               case when p_category = 'Student' then p_kyc->>'student_path' end] loop
    if nullif(v_doc,'') is not null and not exists(
         select 1 from storage.objects
          where bucket_id = 'kyc-documents' and name = v_doc
            and (storage.foldername(name))[1] = v_uid::text) then
      raise exception 'A supporting document could not be found. Please upload it again.';
    end if;
  end loop;
  -- PAN is mandatory; the other extra documents are optional but must be the applicant's own uploads.
  if nullif(p_kyc->>'pan_path','') is null then
    raise exception 'Upload your PAN card.';
  end if;
  foreach v_doc in array array[p_kyc->>'pan_path', p_kyc->>'aadhaar_back_path', p_kyc->>'driving_path',
                               p_kyc->>'id_card_path', p_kyc->>'id_card_back_path'] loop
    if nullif(v_doc,'') is not null and not exists(
         select 1 from storage.objects
          where bucket_id = 'kyc-documents' and name = v_doc
            and (storage.foldername(name))[1] = v_uid::text) then
      raise exception 'A supporting document could not be found. Please upload it again.';
    end if;
  end loop;

  -- Payment
  select * into v_payment from public.payment_settings where id = 1 for share;
  if v_payment.qr_path is null or v_payment.payee_name = '' or v_payment.upi_id = '' then
    raise exception 'Payments are not configured yet.';
  end if;
  if v_payment.qr_path is distinct from p_expected_qr then
    raise exception 'Payment details changed while you were applying. Reload the page and check the payee before submitting.';
  end if;
  if not exists(
       select 1 from storage.objects
        where bucket_id = 'payment-proofs' and name = p_proof_path
          and (storage.foldername(name))[1] = v_uid::text) then
    raise exception 'Upload your payment screenshot.';
  end if;
  if exists(select 1 from public.applications where proof_path = p_proof_path) then
    raise exception 'This payment screenshot was already submitted.';
  end if;

  v_id  := gen_random_uuid();
  v_ref := 'MP-' || upper(substr(replace(v_id::text,'-',''),1,8));

  insert into public.applications(
    id, ref_code, user_id, full_name, phone, category, requested_amount, transaction_id,
    proof_path, fee, payee_name, upi_id, qr_path, refund_upi_id, lender_name, lender_reg_no, contact_email, referred_by_code)
  values (
    v_id, v_ref, v_uid, trim(p_full_name), trim(p_phone), p_category, p_requested_amount, v_txn,
    p_proof_path, v_payment.fee, v_payment.payee_name, v_payment.upi_id, v_payment.qr_path, v_refund,
    v_site.lender_name, v_site.lender_reg_no,
    -- optional email saved in the account's metadata at sign-up
    (select case when e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(e) end
       from (select nullif(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'contact_email', '')), '') as e) x),
    nullif(v_ref_input, ''));

  insert into public.application_kyc(
    application_id, dob, address, city, state, pincode, identity_type, identity_last4,
    institution, identity_path, identity_back_path, address_path, student_path,
    aadhaar_back_path, pan_path, driving_path, id_card_path, id_card_back_path, alt_phone, email)
  values (
    v_id, v_dob, trim(p_kyc->>'address'), trim(p_kyc->>'city'), trim(p_kyc->>'state'),
    trim(p_kyc->>'pincode'), p_kyc->>'identity_type', upper(trim(p_kyc->>'identity_last4')),
    case when p_category = 'Student' then trim(p_kyc->>'institution') end,
    p_kyc->>'identity_path', nullif(p_kyc->>'identity_back_path',''), p_kyc->>'address_path',
    case when p_category = 'Student' then p_kyc->>'student_path' end,
    nullif(p_kyc->>'aadhaar_back_path',''), nullif(p_kyc->>'pan_path',''), nullif(p_kyc->>'driving_path',''),
    nullif(p_kyc->>'id_card_path',''), nullif(p_kyc->>'id_card_back_path',''),
    case when trim(coalesce(p_kyc->>'alt_phone','')) ~ '^[6-9][0-9]{9}$' then trim(p_kyc->>'alt_phone') end,
    case when lower(trim(coalesce(p_kyc->>'email',''))) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(trim(p_kyc->>'email')) end);

  insert into public.application_events(application_id, kind, note, actor)
  values (v_id, 'submitted', 'Application submitted with ₹' || v_payment.fee || ' fee (UTR ' || v_txn || ')', v_uid);

  if v_ref_input <> '' then
    select * into v_rcfg from public.referral_config where id = 1;
    if v_rcfg.enabled then
      select user_id into v_referrer from public.user_wallets where referral_code = v_ref_input;
      if v_referrer is not null and v_referrer <> v_uid then
        insert into public.referrals(
          referrer_user_id, referrer_code, referred_user_id, referred_application_id,
          referred_name, referred_phone, coins_awarded, status, completed_at)
        values (
          v_referrer, v_ref_input, v_uid, v_id,
          trim(p_full_name), trim(p_phone),
          case when v_rcfg.award_trigger = 'submitted' then v_rcfg.coins_per_referral else 0 end,
          case when v_rcfg.award_trigger = 'submitted' then 'completed' else 'pending' end,
          case when v_rcfg.award_trigger = 'submitted' then now() else null end)
        on conflict (referred_user_id) do nothing;

        if found and v_rcfg.award_trigger = 'submitted' then
          update public.user_wallets
             set coins_balance = coins_balance + v_rcfg.coins_per_referral,
                 updated_at = now()
           where user_id = v_referrer;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'ref_code', v_ref);
end; $$;
revoke all on function public.submit_loan_application(text,text,text,integer,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.submit_loan_application(text,text,text,integer,text,text,text,text,jsonb,text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. RPC: admin decision (creates refund obligation on rejection)
-- ---------------------------------------------------------------------
create or replace function public.admin_review_application(
  p_id               uuid,
  p_decision         text,
  p_payment_received boolean,
  p_kyc_verified     boolean,
  p_note             text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_app     public.applications;
  v_note    text    := trim(coalesce(p_note,''));
  v_paid    boolean := coalesce(p_payment_received,false);
  v_kyc     boolean := coalesce(p_kyc_verified,false);
  v_refund  text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_decision is null or p_decision not in ('accepted','rejected') then raise exception 'Invalid decision.'; end if;
  if length(v_note) > 1000 then raise exception 'Note is too long (max 1000 characters).'; end if;

  select * into v_app from public.applications where id = p_id for update;
  if not found then raise exception 'Application not found.'; end if;
  if v_app.status <> 'pending' then raise exception 'This application has already been reviewed.'; end if;

  if p_decision = 'accepted' then
    if v_app.kyc_status <> 'verified' then
      raise exception 'Verify the KYC documents in the KYC tab before approving.';
    end if;
    if not v_paid then
      raise exception 'Confirm the payment was received before approving.';
    end if;
    if not exists(select 1 from public.application_kyc where application_id = p_id) then
      raise exception 'This application has no KYC documents and cannot be accepted.';
    end if;
  else
    if length(v_note) < 3 then raise exception 'Give the applicant a reason for rejection.'; end if;
  end if;

  v_refund := case when p_decision = 'rejected' and v_paid then 'pending' else 'not_applicable' end;
  v_kyc    := v_app.kyc_status = 'verified';  -- KYC result comes from the KYC review, not this call

  update public.applications
     set status = p_decision, payment_verified = v_paid, kyc_verified = v_kyc,
         admin_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(),
         refund_status = v_refund, updated_at = now()
   where id = p_id;

  insert into public.application_events(application_id, kind, note, actor)
  values (p_id, p_decision, v_note, auth.uid());

  if v_refund = 'pending' then
    insert into public.application_events(application_id, kind, note, actor)
    values (p_id, 'refund_due',
            'Refund of ₹' || v_app.fee || ' due to ' || coalesce(v_app.refund_upi_id, 'the paying UPI account'),
            auth.uid());
  elsif p_decision = 'rejected' then
    insert into public.application_events(application_id, kind, note, actor)
    values (p_id, 'no_refund',
            'No refund issued: the ₹299 payment could not be found in the receiving account. Contact the grievance officer with your UTR if you were charged.',
            auth.uid());
  end if;

  -- Referral reward: the referrer earns coins when the referred application is APPROVED
  -- (payment + KYC verified). A rejected referral is marked 'declined' (no coins).
  declare
    v_rcfg public.referral_config;
    v_ref_row public.referrals;
  begin
    select * into v_rcfg from public.referral_config where id = 1;
    select * into v_ref_row from public.referrals
     where referred_application_id = p_id and status = 'pending' for update;
    if found then
      if p_decision = 'accepted' and v_rcfg.enabled then
        update public.referrals
           set status = 'completed',
               coins_awarded = v_rcfg.coins_per_referral,
               completed_at = now()
         where id = v_ref_row.id;
        update public.user_wallets
           set coins_balance = coins_balance + v_rcfg.coins_per_referral,
               updated_at = now()
         where user_id = v_ref_row.referrer_user_id;
      elsif p_decision = 'rejected' then
        update public.referrals set status = 'declined', completed_at = now() where id = v_ref_row.id;
      end if;
    end if;
  end;

  -- Every approved applicant gets their own referral code to share.
  if p_decision = 'accepted' then
    perform public.ensure_referral_code(v_app.user_id);
  end if;
end; $$;
revoke all on function public.admin_review_application(uuid,text,boolean,boolean,text) from public, anon, authenticated;
grant execute on function public.admin_review_application(uuid,text,boolean,boolean,text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. RPC: admin records a completed refund
-- ---------------------------------------------------------------------
create or replace function public.admin_mark_refunded(p_id uuid, p_reference text) returns void
language plpgsql security definer set search_path = public
as $$
declare v_ref text := upper(trim(coalesce(p_reference,'')));
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_ref !~ '^[A-Z0-9]{6,40}$' then raise exception 'Enter the refund UTR (6–40 letters/numbers).'; end if;

  update public.applications
     set refund_status = 'refunded', refund_reference = v_ref,
         refunded_at = now(), refunded_by = auth.uid(), updated_at = now()
   where id = p_id and refund_status = 'pending';
  if not found then raise exception 'No pending refund for this application.'; end if;

  insert into public.application_events(application_id, kind, note, actor)
  values (p_id, 'refunded', 'Refund sent (UTR ' || v_ref || ')', auth.uid());
end; $$;
revoke all on function public.admin_mark_refunded(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_mark_refunded(uuid,text) to authenticated;

-- ---------------------------------------------------------------------
-- 11. RPC: admin updates payment settings
-- ---------------------------------------------------------------------
create or replace function public.admin_update_payment_settings(
  p_payee_name text, p_upi_id text, p_qr_path text
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_payee text := trim(coalesce(p_payee_name,'')); v_upi text := lower(trim(coalesce(p_upi_id,'')));
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if length(v_payee) not between 2 and 100 then raise exception 'Payee name must be 2–100 characters.'; end if;
  if v_upi !~ '^[a-z0-9._-]{2,128}@[a-z][a-z0-9.-]{1,63}$' then raise exception 'Enter a valid UPI ID.'; end if;
  if p_qr_path is null or not exists(select 1 from storage.objects where bucket_id = 'payment-qr' and name = p_qr_path) then
    raise exception 'Upload the payment QR image.';
  end if;
  update public.payment_settings
     set payee_name = v_payee, upi_id = v_upi, qr_path = p_qr_path, updated_at = now()
   where id = 1;
end; $$;
revoke all on function public.admin_update_payment_settings(text,text,text) from public, anon, authenticated;
grant execute on function public.admin_update_payment_settings(text,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- 12. RPC: admin updates lender disclosure / grievance / refund policy
-- ---------------------------------------------------------------------
create or replace function public.admin_update_site_settings(p jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  email_re constant text := '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  phone_re constant text := '^[0-9+() -]{8,20}$';
  v_name  text := trim(coalesce(p->>'lender_name',''));
  v_type  text := coalesce(p->>'lender_type','NBFC');
  v_reg   text := upper(trim(coalesce(p->>'lender_reg_no','')));
  v_web   text := trim(coalesce(p->>'lender_website',''));
  v_days  integer;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if length(v_name) not between 2 and 150 then raise exception 'Lender name must be 2–150 characters.'; end if;
  if v_type not in ('NBFC','Bank','Other RBI-regulated entity') then raise exception 'Choose a lender type.'; end if;
  if v_reg !~ '^[A-Z0-9./ -]{5,40}$' then raise exception 'Enter the lender''s RBI registration number.'; end if;
  if v_web <> '' and v_web !~ '^https?://' then raise exception 'Lender website must start with https://'; end if;
  if length(trim(coalesce(p->>'grievance_officer',''))) not between 2 and 100 then
    raise exception 'Grievance officer name is required.';
  end if;
  if trim(coalesce(p->>'grievance_email','')) !~ email_re then raise exception 'Enter a valid grievance email.'; end if;
  if trim(coalesce(p->>'grievance_phone','')) <> '' and trim(p->>'grievance_phone') !~ phone_re then
    raise exception 'Enter a valid grievance phone number.';
  end if;
  if trim(coalesce(p->>'support_email','')) <> '' and trim(p->>'support_email') !~ email_re then
    raise exception 'Enter a valid support email.';
  end if;
  if trim(coalesce(p->>'support_phone','')) <> '' and trim(p->>'support_phone') !~ phone_re then
    raise exception 'Enter a valid support phone number.';
  end if;
  begin
    v_days := coalesce((p->>'refund_days')::integer, 7);
  exception when others then
    raise exception 'Refund window must be a number of days.';
  end;
  if v_days not between 1 and 30 then raise exception 'Refund window must be 1–30 days.'; end if;

  update public.site_settings set
    lender_name       = v_name,
    lender_type       = v_type,
    lender_reg_no     = v_reg,
    lender_website    = v_web,
    company_name      = coalesce(nullif(trim(p->>'company_name'),''), 'Money Pay'),
    company_address   = left(trim(coalesce(p->>'company_address','')), 300),
    support_email     = trim(coalesce(p->>'support_email','')),
    support_phone     = trim(coalesce(p->>'support_phone','')),
    grievance_officer = trim(p->>'grievance_officer'),
    grievance_email   = trim(p->>'grievance_email'),
    grievance_phone   = trim(coalesce(p->>'grievance_phone','')),
    refund_days       = v_days,
    updated_at        = now(),
    updated_by        = auth.uid()
  where id = 1;
end; $$;
revoke all on function public.admin_update_site_settings(jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_site_settings(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 13. RPC: admin dashboard numbers (all times in IST)
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;

  select jsonb_build_object(
    'total',                  count(*),
    'pending',                count(*) filter (where status = 'pending'),
    'accepted',               count(*) filter (where status = 'accepted'),
    'rejected',               count(*) filter (where status = 'rejected'),
    'overdue',                count(*) filter (where status = 'pending' and created_at < now() - interval '48 hours'),
    'refunds_pending',        count(*) filter (where refund_status = 'pending'),
    'refunds_pending_amount', coalesce(sum(fee) filter (where refund_status = 'pending'), 0),
    'refunded_amount',        coalesce(sum(fee) filter (where refund_status = 'refunded'), 0),
    'fees_retained',          coalesce(sum(fee) filter (where status = 'accepted'), 0),
    'accepted_volume',        coalesce(sum(requested_amount) filter (where status = 'accepted'), 0),
    'avg_review_hours',       round((extract(epoch from avg(reviewed_at - created_at)) / 3600)::numeric, 1)
  ) into v_result
  from public.applications;

  v_result := v_result || jsonb_build_object('daily', (
    select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
      from (select (v_today - g)::date as day from generate_series(0, 13) g) d
      left join (
        select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n
          from public.applications
         where created_at >= (v_today - 13)::timestamp at time zone 'Asia/Kolkata'
         group by 1
      ) c on c.day = d.day
  ));
  return v_result;
end; $$;
revoke all on function public.admin_dashboard_stats() from public, anon, authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------
-- 14. Upgrade existing data (no-ops on a fresh project)
-- ---------------------------------------------------------------------
-- Older installs used a different default company name
alter table public.site_settings alter column company_name set default 'Money Pay';
update public.site_settings set company_name = 'Money Pay' where company_name = 'Rakvih';

-- Applications rejected under the old non-refundable policy, where payment was
-- confirmed, are moved into the refund queue so they are refunded too.
with moved as (
  update public.applications
     set refund_status = 'pending', updated_at = now()
   where status = 'rejected' and payment_verified and refund_status = 'not_applicable'
     and refunded_at is null
     and not exists (select 1 from public.application_events e
                      where e.application_id = applications.id and e.kind in ('refund_due','refunded'))
  returning id, fee
)
insert into public.application_events(application_id, kind, note)
select id, 'refund_due', 'Refund of ₹' || fee || ' due under the updated refund policy' from moved;

-- ---------------------------------------------------------------------
-- 15. Borrower portal — approved applications only
--     Admin enters the loan details and generates a one-time-shown password.
--     The borrower logs in with Loan ID (the application reference, e.g.
--     MP-7F3A9C21) + that password and sees their loan dashboard.
--     Passwords are bcrypt-hashed; sessions are random tokens stored as
--     SHA-256 hashes and expire after 12 hours; 5 failed attempts lock the
--     login for 15 minutes.
-- ---------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Event kinds (re-declared so upgrades pick up the new ones)
alter table public.application_events drop constraint if exists application_events_kind_check;
alter table public.application_events add constraint application_events_kind_check
  check (kind in ('submitted','accepted','rejected','refund_due','no_refund','refunded','loan_updated','access_issued','payment_recorded','document_added',
                  'payment_removed','document_removed',
                  'kyc_verified','kyc_problem','kyc_resubmit','kyc_resubmitted'));

create table if not exists public.loans (
  application_id    uuid primary key references public.applications(id) on delete cascade,
  loan_account_no   text not null default '' check (length(loan_account_no) <= 40),
  sanctioned_amount integer check (sanctioned_amount is null or sanctioned_amount between 1000 and 10000000),
  interest_rate     numeric(5,2) check (interest_rate is null or interest_rate between 0 and 60),
  tenure_months     integer check (tenure_months is null or tenure_months between 1 and 120),
  emi_amount        integer check (emi_amount is null or emi_amount >= 0),
  first_emi_date    date,
  disbursed_on      date,
  status            text not null default 'sanctioned' check (status in ('sanctioned','disbursed','active','closed')),
  note              text not null default '' check (length(note) <= 1000),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null
);
-- Disbursement, charges and how-to-pay (added after v1 of the loan table)
alter table public.loans add column if not exists disbursed_amount integer check (disbursed_amount is null or disbursed_amount >= 0);
alter table public.loans add column if not exists disbursed_to text not null default '' check (length(disbursed_to) <= 60);
alter table public.loans add column if not exists processing_fee integer check (processing_fee is null or processing_fee >= 0);
alter table public.loans add column if not exists apr numeric(5,2) check (apr is null or apr between 0 and 100);
alter table public.loans add column if not exists late_fee text not null default '' check (length(late_fee) <= 300);
alter table public.loans add column if not exists prepayment_terms text not null default '' check (length(prepayment_terms) <= 500);
alter table public.loans add column if not exists repayment_method text not null default '' check (repayment_method in ('','auto_debit','lender_link','bank_transfer','other'));
alter table public.loans add column if not exists repayment_details text not null default '' check (length(repayment_details) <= 1000);
alter table public.loans add column if not exists repayment_link text not null default '' check (repayment_link = '' or repayment_link ~ '^https://');
alter table public.loans enable row level security;
revoke all on public.loans from anon, authenticated;
grant select on public.loans to authenticated;
drop policy if exists "Read own loan or admin" on public.loans;
create policy "Read own loan or admin" on public.loans for select to authenticated using (
  public.is_admin() or exists(select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
);

-- Borrower login: ONE account per mobile number. It covers every approved loan
-- on that number, so a repeat customer keeps one password and sees all loans.
create table if not exists public.borrower_accounts (
  phone           text primary key check (phone ~ '^[6-9][0-9]{9}$'),
  password_hash   text not null,
  issued_at       timestamptz not null default now(),
  issued_by       uuid references auth.users(id) on delete set null,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz
);
alter table public.borrower_accounts enable row level security;
revoke all on public.borrower_accounts from anon, authenticated;
grant select (phone, issued_at, last_login_at, locked_until) on public.borrower_accounts to authenticated;
drop policy if exists "Admins read borrower accounts" on public.borrower_accounts;
create policy "Admins read borrower accounts" on public.borrower_accounts for select to authenticated using (public.is_admin());

-- Upgrade from one-password-per-loan: the newest password on each number is kept,
-- so existing borrowers log in exactly as before. Old per-loan sessions end.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'borrower_access') then
    insert into public.borrower_accounts(phone, password_hash, issued_at, issued_by, last_login_at)
    select distinct on (a.phone) a.phone, b.password_hash, b.issued_at, b.issued_by, b.last_login_at
      from public.borrower_access b join public.applications a on a.id = b.application_id
     order by a.phone, b.issued_at desc
    on conflict (phone) do nothing;
    drop table public.borrower_access cascade;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'borrower_sessions' and column_name = 'application_id') then
    drop table public.borrower_sessions;
  end if;
end $$;

-- Login status per approved loan, as the admin console reads it (no password hashes)
create or replace view public.borrower_access with (security_invoker = true) as
  select a.id as application_id, b.issued_at, b.last_login_at, b.locked_until
    from public.applications a
    join public.borrower_accounts b on b.phone = a.phone
   where a.status = 'accepted';
revoke all on public.borrower_access from anon, authenticated;
grant select on public.borrower_access to authenticated;

create table if not exists public.borrower_sessions (
  token_hash text primary key,
  phone      text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists borrower_sessions_phone_idx on public.borrower_sessions(phone);
alter table public.borrower_sessions enable row level security;
revoke all on public.borrower_sessions from anon, authenticated;

-- Admin: save loan details for an approved application
create or replace function public.admin_save_loan(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_amount integer; v_rate numeric; v_tenure integer; v_emi integer; v_first date; v_disb date;
  v_disb_amt integer; v_fee integer; v_apr numeric;
  v_status text := coalesce(nullif(p->>'status',''), 'sanctioned');
  v_method text := coalesce(p->>'repayment_method','');
  v_link   text := trim(coalesce(p->>'repayment_link',''));
  v_r numeric;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists(select 1 from public.applications where id = p_id and status = 'accepted') then
    raise exception 'Loan details can only be added to approved applications.';
  end if;
  begin
    v_amount   := nullif(p->>'sanctioned_amount','')::integer;
    v_rate     := nullif(p->>'interest_rate','')::numeric;
    v_tenure   := nullif(p->>'tenure_months','')::integer;
    v_first    := nullif(p->>'first_emi_date','')::date;
    v_disb     := nullif(p->>'disbursed_on','')::date;
    v_disb_amt := nullif(p->>'disbursed_amount','')::integer;
    v_fee      := nullif(p->>'processing_fee','')::integer;
    v_apr      := nullif(p->>'apr','')::numeric;
  exception when others then
    raise exception 'Check the amounts, rates and dates.';
  end;
  if v_amount is not null and v_amount not between 1000 and 10000000 then raise exception 'Sanctioned amount must be between ₹1,000 and ₹1,00,00,000.'; end if;
  if v_rate is not null and v_rate not between 0 and 60 then raise exception 'Interest rate must be between 0 and 60%% a year.'; end if;
  if v_tenure is not null and v_tenure not between 1 and 120 then raise exception 'Tenure must be 1–120 months.'; end if;
  if v_apr is not null and v_apr not between 0 and 100 then raise exception 'APR must be between 0 and 100%%.'; end if;
  if v_disb_amt is not null and v_amount is not null and v_disb_amt > v_amount then raise exception 'Amount credited can''t be more than the sanctioned amount.'; end if;
  if v_fee is not null and v_fee < 0 then raise exception 'Processing fee can''t be negative.'; end if;
  if v_status not in ('sanctioned','disbursed','active','closed') then raise exception 'Choose a loan status.'; end if;
  if v_method not in ('','auto_debit','lender_link','bank_transfer','other') then raise exception 'Choose how the borrower pays.'; end if;
  if v_link <> '' and v_link !~ '^https://' then raise exception 'The payment link must start with https://'; end if;
  if length(coalesce(p->>'loan_account_no','')) > 40 then raise exception 'Loan account number is too long.'; end if;
  if length(coalesce(p->>'disbursed_to','')) > 60 then raise exception '"Credited to" is too long.'; end if;
  if length(coalesce(p->>'note','')) > 1000 or length(coalesce(p->>'repayment_details','')) > 1000 then raise exception 'Text is too long (max 1000 characters).'; end if;
  if length(coalesce(p->>'late_fee','')) > 300 or length(coalesce(p->>'prepayment_terms','')) > 500 then raise exception 'Charges text is too long.'; end if;

  -- EMI is always calculated here so admin and borrower see the same figure
  if v_amount is not null and v_rate is not null and v_tenure is not null then
    v_r := v_rate / 1200;
    if v_r = 0 then
      v_emi := round(v_amount::numeric / v_tenure);
    else
      v_emi := round(v_amount * v_r * power(1 + v_r, v_tenure) / (power(1 + v_r, v_tenure) - 1));
    end if;
  end if;

  insert into public.loans(application_id, loan_account_no, sanctioned_amount, interest_rate, tenure_months, emi_amount,
                           first_emi_date, disbursed_on, status, note,
                           disbursed_amount, disbursed_to, processing_fee, apr, late_fee, prepayment_terms,
                           repayment_method, repayment_details, repayment_link, updated_at, updated_by)
  values (p_id, trim(coalesce(p->>'loan_account_no','')), v_amount, v_rate, v_tenure, v_emi,
          v_first, v_disb, v_status, trim(coalesce(p->>'note','')),
          v_disb_amt, trim(coalesce(p->>'disbursed_to','')), v_fee, v_apr, trim(coalesce(p->>'late_fee','')), trim(coalesce(p->>'prepayment_terms','')),
          v_method, trim(coalesce(p->>'repayment_details','')), v_link, now(), auth.uid())
  on conflict (application_id) do update set
    loan_account_no = excluded.loan_account_no, sanctioned_amount = excluded.sanctioned_amount,
    interest_rate = excluded.interest_rate, tenure_months = excluded.tenure_months, emi_amount = excluded.emi_amount,
    first_emi_date = excluded.first_emi_date, disbursed_on = excluded.disbursed_on, status = excluded.status,
    note = excluded.note, disbursed_amount = excluded.disbursed_amount, disbursed_to = excluded.disbursed_to,
    processing_fee = excluded.processing_fee, apr = excluded.apr, late_fee = excluded.late_fee,
    prepayment_terms = excluded.prepayment_terms, repayment_method = excluded.repayment_method,
    repayment_details = excluded.repayment_details, repayment_link = excluded.repayment_link,
    updated_at = now(), updated_by = auth.uid();

  insert into public.application_events(application_id, kind, note, actor)
  values (p_id, 'loan_updated', 'Loan details updated (' || v_status || ')', auth.uid());
end; $$;
revoke all on function public.admin_save_loan(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_loan(uuid,jsonb) to authenticated;

-- Admin: generate (or regenerate) the borrower password for this loan's mobile number.
-- One password covers all approved loans on the number. Returned once; only the hash is stored.
create or replace function public.admin_issue_borrower_password(p_id uuid) returns text
language plpgsql security definer set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea := extensions.gen_random_bytes(12);
  v_pw    text := '';
  v_phone text;
  i int;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select phone into v_phone from public.applications where id = p_id and status = 'accepted';
  if v_phone is null then raise exception 'Only approved applications can get a borrower login.'; end if;
  for i in 0..11 loop
    v_pw := v_pw || substr(alphabet, (get_byte(v_bytes, i) % length(alphabet)) + 1, 1);
    if i in (3, 7) then v_pw := v_pw || '-'; end if;
  end loop;

  insert into public.borrower_accounts(phone, password_hash, issued_at, issued_by, failed_attempts, locked_until)
  values (v_phone, extensions.crypt(v_pw, extensions.gen_salt('bf', 10)), now(), auth.uid(), 0, null)
  on conflict (phone) do update set
    password_hash = excluded.password_hash, issued_at = now(), issued_by = auth.uid(), failed_attempts = 0, locked_until = null;

  delete from public.borrower_sessions where phone = v_phone;  -- the old password's sessions end now

  insert into public.application_events(application_id, kind, note, actor)
  values (p_id, 'access_issued', 'Borrower login password issued (works for every loan on this mobile number)', auth.uid());
  return v_pw;
end; $$;
revoke all on function public.admin_issue_borrower_password(uuid) from public, anon, authenticated;
grant execute on function public.admin_issue_borrower_password(uuid) to authenticated;

-- Borrower: log in with mobile number + password. Returns {token, expires_at} or {error}.
-- Errors are returned (not raised) so the failed-attempt counter is saved.
drop function if exists public.borrower_login(text,text);
create or replace function public.borrower_login(p_phone text, p_password text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_phone text := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 10);
  v_acc   public.borrower_accounts;
  v_token text; v_exp timestamptz;
  generic constant text := 'Incorrect mobile number or password.';
begin
  if v_phone !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('error', 'Enter your 10-digit mobile number.'); end if;
  select * into v_acc from public.borrower_accounts where phone = v_phone for update;
  if not found or not exists(select 1 from public.applications where phone = v_phone and status = 'accepted') then
    return jsonb_build_object('error', generic);
  end if;
  if v_acc.locked_until > now() then return jsonb_build_object('error', 'Too many attempts. Try again in 15 minutes.'); end if;

  if extensions.crypt(coalesce(p_password,''), v_acc.password_hash) <> v_acc.password_hash then
    update public.borrower_accounts
       set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
           locked_until    = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
     where phone = v_phone;
    return jsonb_build_object('error', generic);
  end if;

  update public.borrower_accounts set failed_attempts = 0, locked_until = null, last_login_at = now() where phone = v_phone;
  delete from public.borrower_sessions where expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + interval '12 hours';
  insert into public.borrower_sessions(token_hash, phone, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_phone, v_exp);
  return jsonb_build_object('token', v_token, 'expires_at', v_exp);
end; $$;
revoke all on function public.borrower_login(text,text) from public, anon, authenticated;
grant execute on function public.borrower_login(text,text) to anon, authenticated;

-- EMI payments recorded by the admin (one row per paid instalment)
create table if not exists public.loan_payments (
  application_id uuid not null references public.applications(id) on delete cascade,
  instalment_no  integer not null check (instalment_no between 1 and 120),
  paid_on        date not null,
  amount         integer not null check (amount > 0),
  reference      text not null default '' check (length(reference) <= 60),
  recorded_by    uuid references auth.users(id) on delete set null,
  recorded_at    timestamptz not null default now(),
  primary key (application_id, instalment_no)
);
alter table public.loan_payments enable row level security;
revoke all on public.loan_payments from anon, authenticated;
grant select on public.loan_payments to authenticated;
drop policy if exists "Read own payments or admin" on public.loan_payments;
create policy "Read own payments or admin" on public.loan_payments for select to authenticated using (
  public.is_admin() or exists(select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
);

-- Loan documents (KFS, sanction letter, agreement, NOC) in a private bucket
create table if not exists public.loan_documents (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  kind           text not null check (kind in ('kfs','sanction_letter','agreement','noc','other')),
  title          text not null check (length(trim(title)) between 2 and 120),
  path           text not null unique,
  uploaded_at    timestamptz not null default now(),
  uploaded_by    uuid references auth.users(id) on delete set null
);
create index if not exists loan_documents_app_idx on public.loan_documents(application_id);
alter table public.loan_documents enable row level security;
revoke all on public.loan_documents from anon, authenticated;
grant select on public.loan_documents to authenticated;
drop policy if exists "Read own loan documents or admin" on public.loan_documents;
create policy "Read own loan documents or admin" on public.loan_documents for select to authenticated using (
  public.is_admin() or exists(select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('loan-documents', 'loan-documents', false, 10485760, array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Admin uploads loan documents" on storage.objects;
create policy "Admin uploads loan documents" on storage.objects
  for insert to authenticated with check (bucket_id = 'loan-documents' and public.is_admin());
drop policy if exists "Admin deletes loan documents" on storage.objects;
create policy "Admin deletes loan documents" on storage.objects
  for delete to authenticated using (bucket_id = 'loan-documents' and public.is_admin());
drop policy if exists "Read own loan documents files or admin" on storage.objects;
create policy "Read own loan documents files or admin" on storage.objects
  for select to authenticated using (
    bucket_id = 'loan-documents' and (public.is_admin() or exists(
      select 1 from public.applications a where a.id::text = (storage.foldername(name))[1] and a.user_id = auth.uid())));

-- Admin: mark an EMI as paid (or update it)
create or replace function public.admin_record_payment(p_id uuid, p_instalment integer, p_paid_on date, p_amount integer, p_reference text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_tenure integer;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select tenure_months into v_tenure from public.loans where application_id = p_id;
  if v_tenure is null then raise exception 'Save the loan amount, rate and tenure first.'; end if;
  if p_instalment is null or p_instalment not between 1 and v_tenure then raise exception 'Instalment must be between 1 and %.', v_tenure; end if;
  if p_paid_on is null or p_paid_on > current_date + 1 then raise exception 'Enter the date the EMI was paid.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount paid.'; end if;
  if length(coalesce(p_reference,'')) > 60 then raise exception 'Reference is too long.'; end if;
  insert into public.loan_payments(application_id, instalment_no, paid_on, amount, reference, recorded_by, recorded_at)
  values (p_id, p_instalment, p_paid_on, p_amount, trim(coalesce(p_reference,'')), auth.uid(), now())
  on conflict (application_id, instalment_no) do update set
    paid_on = excluded.paid_on, amount = excluded.amount, reference = excluded.reference, recorded_by = auth.uid(), recorded_at = now();
  insert into public.application_events(application_id, kind, note, actor)
  values (p_id, 'payment_recorded', 'EMI ' || p_instalment || ' marked paid (₹' || p_amount || ')', auth.uid());
end; $$;
revoke all on function public.admin_record_payment(uuid,integer,date,integer,text) from public, anon, authenticated;
grant execute on function public.admin_record_payment(uuid,integer,date,integer,text) to authenticated;

create or replace function public.admin_remove_payment(p_id uuid, p_instalment integer) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  delete from public.loan_payments where application_id = p_id and instalment_no = p_instalment;
  if found then
    insert into public.application_events(application_id, kind, note, actor)
    values (p_id, 'payment_removed', 'EMI ' || p_instalment || ' payment removed', auth.uid());
  end if;
end; $$;
revoke all on function public.admin_remove_payment(uuid,integer) from public, anon, authenticated;
grant execute on function public.admin_remove_payment(uuid,integer) to authenticated;

-- Admin: register an uploaded document (file must already be in loan-documents/<application id>/...)
create or replace function public.admin_add_loan_document(p_id uuid, p_kind text, p_title text, p_path text) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists(select 1 from public.applications where id = p_id and status = 'accepted') then
    raise exception 'Documents can only be added to approved applications.';
  end if;
  if p_kind not in ('kfs','sanction_letter','agreement','noc','other') then raise exception 'Choose the document type.'; end if;
  if length(trim(coalesce(p_title,''))) not between 2 and 120 then raise exception 'Give the document a name.'; end if;
  if (storage.foldername(p_path))[1] is distinct from p_id::text
     or not exists(select 1 from storage.objects where bucket_id = 'loan-documents' and name = p_path) then
    raise exception 'Upload the file first.';
  end if;
  insert into public.loan_documents(application_id, kind, title, path, uploaded_by)
  values (p_id, p_kind, trim(p_title), p_path, auth.uid()) returning id into v_id;
  insert into public.application_events(application_id, kind, note, actor)
  values (p_id, 'document_added', trim(p_title) || ' added', auth.uid());
  return v_id;
end; $$;
revoke all on function public.admin_add_loan_document(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_add_loan_document(uuid,text,text,text) to authenticated;

-- Admin: remove a document; returns its storage path so the file can be deleted too
create or replace function public.admin_remove_loan_document(p_doc uuid) returns text
language plpgsql security definer set search_path = public
as $$
declare v_path text; v_app uuid; v_title text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  delete from public.loan_documents where id = p_doc returning path, application_id, title into v_path, v_app, v_title;
  if v_path is null then raise exception 'Document not found.'; end if;
  insert into public.application_events(application_id, kind, note, actor)
  values (v_app, 'document_removed', v_title || ' removed', auth.uid());
  return v_path;
end; $$;
revoke all on function public.admin_remove_loan_document(uuid) from public, anon, authenticated;
grant execute on function public.admin_remove_loan_document(uuid) to authenticated;

-- Internal: session token → mobile number (not callable by clients)
drop function if exists public.borrower_session_app(text);
create or replace function public.borrower_session_phone(p_token text) returns text
language sql stable security definer set search_path = public
as $$ select phone from public.borrower_sessions
       where token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') and expires_at > now() $$;
revoke all on function public.borrower_session_phone(text) from public, anon, authenticated;

-- Borrower: the list of all their loans, plus full details of one (p_app; newest when null)
drop function if exists public.borrower_portal(text);
create or replace function public.borrower_portal(p_token text, p_app uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_phone text := public.borrower_session_phone(p_token);
  v_app   uuid;
begin
  if v_phone is null then return jsonb_build_object('error', 'Your session has ended. Please log in again.'); end if;
  select id into v_app from public.applications
   where phone = v_phone and status = 'accepted' and (p_app is null or id = p_app)
   order by reviewed_at desc nulls last, created_at desc limit 1;
  if v_app is null then
    return jsonb_build_object('error', case when p_app is null then 'There is no approved loan on this number.' else 'Loan not found.' end);
  end if;

  return jsonb_build_object(
    'selected', v_app,
    'loans', (select jsonb_agg(jsonb_build_object(
        'application_id', a.id, 'ref_code', a.ref_code, 'requested_amount', a.requested_amount,
        'reviewed_at', a.reviewed_at, 'lender_name', a.lender_name,
        'loan', (select jsonb_build_object('loan_account_no', l.loan_account_no, 'sanctioned_amount', l.sanctioned_amount,
                    'interest_rate', l.interest_rate, 'tenure_months', l.tenure_months, 'emi_amount', l.emi_amount,
                    'first_emi_date', l.first_emi_date, 'status', l.status)
                   from public.loans l where l.application_id = a.id),
        'payments', coalesce((select jsonb_agg(jsonb_build_object('instalment_no', p.instalment_no, 'paid_on', p.paid_on, 'amount', p.amount, 'reference', p.reference) order by p.instalment_no)
                   from public.loan_payments p where p.application_id = a.id), '[]'::jsonb))
        order by a.reviewed_at desc nulls last, a.created_at desc)
      from public.applications a where a.phone = v_phone and a.status = 'accepted'),
    'application', (select jsonb_build_object(
        'ref_code', a.ref_code, 'full_name', a.full_name, 'phone', a.phone, 'category', a.category,
        'requested_amount', a.requested_amount, 'created_at', a.created_at, 'reviewed_at', a.reviewed_at,
        'lender_name', a.lender_name, 'lender_reg_no', a.lender_reg_no, 'admin_note', a.admin_note,
        'contact_email', a.contact_email)
      from public.applications a where a.id = v_app),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('instalment_no', p.instalment_no, 'paid_on', p.paid_on, 'amount', p.amount, 'reference', p.reference) order by p.instalment_no)
      from public.loan_payments p where p.application_id = v_app), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'title', d.title, 'uploaded_at', d.uploaded_at) order by d.uploaded_at desc)
      from public.loan_documents d where d.application_id = v_app), '[]'::jsonb),
    'loan', (select to_jsonb(l) - 'updated_by' from public.loans l where l.application_id = v_app),
    'site', (select jsonb_build_object(
        'lender_name', s.lender_name, 'lender_type', s.lender_type, 'lender_reg_no', s.lender_reg_no, 'lender_website', s.lender_website,
        'support_email', s.support_email, 'support_phone', s.support_phone,
        'grievance_officer', s.grievance_officer, 'grievance_email', s.grievance_email, 'grievance_phone', s.grievance_phone)
      from public.site_settings s where s.id = 1),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.note, 'created_at', e.created_at) order by e.created_at)
      from public.application_events e where e.application_id = v_app and e.kind in ('submitted','accepted','loan_updated')), '[]'::jsonb)
  );
end; $$;
revoke all on function public.borrower_portal(text,uuid) from public, anon, authenticated;
grant execute on function public.borrower_portal(text,uuid) to anon, authenticated;

create or replace function public.borrower_logout(p_token text) returns void
language sql security definer set search_path = public
as $$ delete from public.borrower_sessions where token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex'); $$;
revoke all on function public.borrower_logout(text) from public, anon, authenticated;
grant execute on function public.borrower_logout(text) to anon, authenticated;

-- Borrower: storage path of a document on one of THEIR loans (the server route turns it into a 2-minute link)
create or replace function public.borrower_document_path(p_token text, p_doc uuid) returns text
language sql stable security definer set search_path = public
as $$ select d.path from public.loan_documents d join public.applications a on a.id = d.application_id
       where d.id = p_doc and a.status = 'accepted' and a.phone = public.borrower_session_phone(p_token) $$;
revoke all on function public.borrower_document_path(text,uuid) from public, anon, authenticated;
grant execute on function public.borrower_document_path(text,uuid) to anon, authenticated;

-- Borrower: change the password (for all their loans). Other sessions are signed out.
create or replace function public.borrower_change_password(p_token text, p_current text, p_new text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_phone text := public.borrower_session_phone(p_token); v_hash text;
begin
  if v_phone is null then return jsonb_build_object('error', 'Your session has ended. Please log in again.'); end if;
  select password_hash into v_hash from public.borrower_accounts where phone = v_phone for update;
  if v_hash is null or extensions.crypt(coalesce(p_current,''), v_hash) <> v_hash then
    return jsonb_build_object('error', 'Your current password is incorrect.');
  end if;
  if length(coalesce(p_new,'')) < 8 then return jsonb_build_object('error', 'New password must be at least 8 characters.'); end if;
  if p_new = p_current then return jsonb_build_object('error', 'Choose a different password.'); end if;
  update public.borrower_accounts set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where phone = v_phone;
  delete from public.borrower_sessions
   where phone = v_phone and token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.borrower_change_password(text,text,text) from public, anon, authenticated;
grant execute on function public.borrower_change_password(text,text,text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 16. Admin console: activity log and admin list
-- ---------------------------------------------------------------------
create index if not exists application_events_created_idx on public.application_events(created_at desc);

-- Activity across all applications, newest first, with who did it.
-- Page with p_before = created_at of the last row already shown.
create or replace function public.admin_activity(p_limit integer default 200, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc, x.id desc) from (
      select e.id, e.application_id, e.kind, e.note, e.created_at,
             a.full_name, a.ref_code,
             case when e.actor is null then 'system'
                  when e.actor = a.user_id then 'applicant'
                  else 'admin' end as actor,
             case when e.actor is null then 'System'
                  when e.actor = a.user_id then 'Applicant'
                  else coalesce(u.email, 'Former admin') end as actor_label
        from public.application_events e
        join public.applications a on a.id = e.application_id
        left join auth.users u on u.id = e.actor
       where p_before is null or e.created_at < p_before
       order by e.created_at desc, e.id desc
       limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    ) x), '[]'::jsonb);
end; $$;
revoke all on function public.admin_activity(integer,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_activity(integer,timestamptz) to authenticated;

create or replace function public.admin_list_admins() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', m.user_id, 'email', u.email, 'created_at', m.created_at,
             'last_sign_in_at', u.last_sign_in_at, 'is_me', m.user_id = auth.uid())
           order by m.created_at)
      from public.admin_users m join auth.users u on u.id = m.user_id), '[]'::jsonb);
end; $$;
revoke all on function public.admin_list_admins() from public, anon, authenticated;
grant execute on function public.admin_list_admins() to authenticated;

-- ---------------------------------------------------------------------
-- 17. KYC review (KYC tab) and applicant document re-upload
--     kyc_status: pending → verified | problem | resubmit
--                 resubmit → pending again once the applicant uploads
--     Only applications still under review can change KYC status.
-- ---------------------------------------------------------------------
create or replace function public.admin_review_kyc(p_id uuid, p_decision text, p_note text, p_docs text[] default '{}')
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_app  public.applications;
  v_note text := trim(coalesce(p_note,''));
  v_docs text[] := coalesce(p_docs, '{}');
  v_kyc  public.application_kyc;
  d      text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_decision is null or p_decision not in ('verified','problem','resubmit') then raise exception 'Invalid KYC result.'; end if;
  if length(v_note) > 1000 then raise exception 'Note is too long (max 1000 characters).'; end if;

  select * into v_app from public.applications where id = p_id for update;
  if not found then raise exception 'Application not found.'; end if;
  if v_app.status <> 'pending' then raise exception 'This application has already been decided.'; end if;
  select * into v_kyc from public.application_kyc where application_id = p_id;
  if not found then raise exception 'This application has no KYC documents.'; end if;

  if p_decision = 'verified' then
    v_docs := '{}';
  elsif p_decision = 'problem' then
    if length(v_note) < 3 then raise exception 'Describe the problem you found.'; end if;
    v_docs := '{}';
  else
    if length(v_note) < 3 then raise exception 'Tell the applicant what is wrong with the document.'; end if;
    if cardinality(v_docs) = 0 then raise exception 'Choose which document to upload again.'; end if;
    foreach d in array v_docs loop
      if d not in ('identity','identity_back','address','student') then raise exception 'Unknown document.'; end if;
      if d = 'student' and v_app.category <> 'Student' then raise exception 'Only students have a student ID.'; end if;
    end loop;
    select array_agg(distinct x order by x) into v_docs from unnest(v_docs) x;
  end if;

  update public.applications
     set kyc_status = p_decision, kyc_verified = (p_decision = 'verified'), kyc_note = v_note,
         kyc_requested_docs = v_docs, kyc_reviewed_at = now(), kyc_reviewed_by = auth.uid(), updated_at = now()
   where id = p_id;

  insert into public.application_events(application_id, kind, note, actor)
  values (p_id, 'kyc_' || p_decision,
          case p_decision when 'verified' then coalesce(nullif(v_note,''), 'KYC documents verified')
                          else v_note end,
          auth.uid());
end; $$;
revoke all on function public.admin_review_kyc(uuid,text,text,text[]) from public, anon, authenticated;
grant execute on function public.admin_review_kyc(uuid,text,text,text[]) to authenticated;

-- Applicant: upload the document(s) the reviewer asked for. p_docs = {"address": "<path>", ...}
-- Files must already be uploaded to kyc-documents/<their user id>/...
create or replace function public.applicant_resubmit_kyc(p_id uuid, p_docs jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.applications;
  d     text;
  v_path text;
begin
  if v_uid is null then raise exception 'Please sign in again.'; end if;
  select * into v_app from public.applications where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'Application not found.'; end if;
  if v_app.status <> 'pending' or v_app.kyc_status <> 'resubmit' then
    raise exception 'No new documents are needed for this application.';
  end if;

  foreach d in array v_app.kyc_requested_docs loop
    v_path := p_docs->>d;
    if v_path is null or not exists(
         select 1 from storage.objects
          where bucket_id = 'kyc-documents' and name = v_path
            and (storage.foldername(name))[1] = v_uid::text) then
      raise exception 'Upload every requested document.';
    end if;
    if exists(select 1 from public.application_kyc
               where application_id = p_id
                 and v_path in (identity_path, coalesce(identity_back_path,''), address_path, coalesce(student_path,''))) then
      raise exception 'Upload a new file, not the one you sent before.';
    end if;
    update public.application_kyc set
      identity_path      = case when d = 'identity'      then v_path else identity_path end,
      identity_back_path = case when d = 'identity_back' then v_path else identity_back_path end,
      address_path       = case when d = 'address'       then v_path else address_path end,
      student_path       = case when d = 'student'       then v_path else student_path end
     where application_id = p_id;
  end loop;

  update public.applications
     set kyc_status = 'pending', kyc_requested_docs = '{}', updated_at = now()
   where id = p_id;

  insert into public.application_events(application_id, kind, note, actor)
  values (p_id, 'kyc_resubmitted', 'New document uploaded: ' || array_to_string(v_app.kyc_requested_docs, ', '), v_uid);
end; $$;
revoke all on function public.applicant_resubmit_kyc(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.applicant_resubmit_kyc(uuid,jsonb) to authenticated;

-- Admins are added and removed in Supabase (see the end of this file), not from the console
drop function if exists public.admin_add_admin(text);
drop function if exists public.admin_remove_admin(uuid);

-- ---------------------------------------------------------------------
-- 18. Referral & Coin Rewards RPCs (tables defined in Section 7b)
-- ---------------------------------------------------------------------
-- User: fetch (and initialize if needed) wallet, referral code, config, referrals, and payout requests
create or replace function public.get_my_referral_portal() returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_wallet public.user_wallets;
  v_cfg    public.referral_config;
  v_phone  text;
  v_code   text;
begin
  if v_uid is null then raise exception 'Please sign in to view your referral wallet.'; end if;
  select * into v_cfg from public.referral_config where id = 1;
  select * into v_wallet from public.user_wallets where user_id = v_uid;
  if not found then
    select coalesce(raw_user_meta_data->>'phone', '') into v_phone from auth.users where id = v_uid;
    v_code := 'MP-REF-' || coalesce(nullif(right(regexp_replace(v_phone, '\D', '', 'g'), 4), ''), upper(substr(replace(v_uid::text, '-', ''), 1, 4)));
    if exists(select 1 from public.user_wallets where referral_code = v_code) then
      v_code := 'MP-REF-' || upper(substr(replace(v_uid::text, '-', ''), 1, 6));
    end if;
    insert into public.user_wallets(user_id, referral_code) values (v_uid, v_code)
    on conflict (user_id) do nothing;
    select * into v_wallet from public.user_wallets where user_id = v_uid;
  end if;

  return jsonb_build_object(
    'config', to_jsonb(v_cfg),
    'wallet', to_jsonb(v_wallet),
    'referrals', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.referrals r where r.referrer_user_id = v_uid), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.payout_requests p where p.user_id = v_uid), '[]'::jsonb)
  );
end; $$;
revoke all on function public.get_my_referral_portal() from public, anon, authenticated;
grant execute on function public.get_my_referral_portal() to authenticated;

-- User: request cash payout from earned coins
create or replace function public.request_referral_payout(p_coins integer, p_upi_id text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_cfg    public.referral_config;
  v_wallet public.user_wallets;
  v_upi    text := lower(trim(coalesce(p_upi_id, '')));
  v_rupees integer;
  v_name   text;
  v_phone  text;
  v_payout public.payout_requests;
begin
  if v_uid is null then raise exception 'Please sign in to request a payout.'; end if;
  select * into v_cfg from public.referral_config where id = 1;
  if not v_cfg.enabled then raise exception 'The referral program is currently paused.'; end if;
  if v_upi !~ '^[a-z0-9._-]{2,128}@[a-z][a-z0-9.-]{1,63}$' then
    raise exception 'Enter a valid personal UPI ID (e.g. name@okaxis).';
  end if;
  if p_coins is null or p_coins < v_cfg.min_redeem_coins then
    raise exception 'Minimum withdrawal is % coins.', v_cfg.min_redeem_coins;
  end if;

  select * into v_wallet from public.user_wallets where user_id = v_uid for update;
  if not found or v_wallet.coins_balance < p_coins then
    raise exception 'Insufficient coins in your wallet.';
  end if;

  v_rupees := floor((p_coins::numeric / 1000.0) * v_cfg.rupees_per_1000_coins)::integer;
  if v_rupees <= 0 then raise exception 'Payout amount must be at least ₹1.'; end if;

  select coalesce(a.full_name, u.raw_user_meta_data->>'full_name', 'Applicant'),
         coalesce(a.phone, u.raw_user_meta_data->>'phone', '')
    into v_name, v_phone
    from auth.users u
    left join public.applications a on a.user_id = u.id
   where u.id = v_uid
   order by a.created_at desc nulls last
   limit 1;

  update public.user_wallets
     set coins_balance = coins_balance - p_coins,
         saved_upi_id = v_upi,
         updated_at = now()
   where user_id = v_uid;

  insert into public.payout_requests(user_id, user_name, user_phone, upi_id, coins, amount_rupees)
  values (v_uid, coalesce(nullif(trim(v_name), ''), 'Applicant'), coalesce(v_phone, ''), v_upi, p_coins, v_rupees)
  returning * into v_payout;

  return jsonb_build_object(
    'payout', to_jsonb(v_payout),
    'coins_balance', v_wallet.coins_balance - p_coins
  );
end; $$;
revoke all on function public.request_referral_payout(integer,text) from public, anon, authenticated;
grant execute on function public.request_referral_payout(integer,text) to authenticated;

-- Admin: load referral config, payouts, and referrals ledger
create or replace function public.admin_get_referrals_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  return jsonb_build_object(
    'config', (select to_jsonb(c) from public.referral_config c where id = 1),
    'payouts', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.payout_requests p), '[]'::jsonb),
    -- One row per member who has a referral code, with referral counts and paid / unpaid totals
    'wallets', coalesce((
      select jsonb_agg(x order by (x->>'referral_count')::int desc, x->>'name')
      from (
        select jsonb_build_object(
          'user_id', w.user_id,
          'referral_code', w.referral_code,
          'coins_balance', w.coins_balance,
          'name', coalesce(la.full_name, u.raw_user_meta_data->>'full_name', 'Applicant'),
          'phone', coalesce(la.phone, u.raw_user_meta_data->>'phone', ''),
          'email', la.contact_email,
          'referral_count', coalesce(s.total, 0),
          'verified_count', coalesce(s.approved, 0),
          'pending_count', coalesce(s.pending, 0),
          'declined_count', coalesce(s.declined, 0),
          'paid_count', coalesce(s.paid, 0),
          'unpaid_count', coalesce(s.unpaid, 0),
          'paid_coins', coalesce(s.paid_coins, 0),
          'unpaid_coins', coalesce(s.unpaid_coins, 0)
        ) as x
        from public.user_wallets w
        left join auth.users u on u.id = w.user_id
        left join lateral (
          select a.full_name, a.phone, a.contact_email from public.applications a
           where a.user_id = w.user_id order by a.created_at desc limit 1
        ) la on true
        left join lateral (
          select count(*)                                                            as total,
                 count(*) filter (where r.status = 'completed')                       as approved,
                 count(*) filter (where r.status = 'pending')                         as pending,
                 count(*) filter (where r.status = 'declined')                        as declined,
                 count(*) filter (where r.status = 'completed' and r.paid_at is not null) as paid,
                 count(*) filter (where r.status = 'completed' and r.paid_at is null)     as unpaid,
                 coalesce(sum(r.coins_awarded) filter (where r.status = 'completed' and r.paid_at is not null), 0) as paid_coins,
                 coalesce(sum(r.coins_awarded) filter (where r.status = 'completed' and r.paid_at is null), 0)     as unpaid_coins
            from public.referrals r where r.referrer_user_id = w.user_id
        ) s on true
      ) t
    ), '[]'::jsonb),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'referrer_user_id', r.referrer_user_id,
        'referrer_code', r.referrer_code,
        'referrer_name', coalesce((select a.full_name from public.applications a where a.user_id = r.referrer_user_id order by a.created_at desc limit 1),
                                  u.raw_user_meta_data->>'full_name', 'Applicant'),
        'referrer_phone', coalesce((select a.phone from public.applications a where a.user_id = r.referrer_user_id order by a.created_at desc limit 1),
                                   u.raw_user_meta_data->>'phone', ''),
        'referred_name', r.referred_name,
        'referred_phone', r.referred_phone,
        'referred_application_id', r.referred_application_id,
        'application_ref', ra.ref_code,
        'application_status', ra.status,
        'requested_amount', ra.requested_amount,
        'coins_awarded', r.coins_awarded,
        'status', r.status,
        'created_at', r.created_at,
        'completed_at', r.completed_at,
        'paid_at', r.paid_at,
        'payout_utr', pr.payout_utr
      ) order by r.created_at desc)
      from public.referrals r
      left join auth.users u on u.id = r.referrer_user_id
      left join public.applications ra on ra.id = r.referred_application_id
      left join public.payout_requests pr on pr.id = r.payout_id
    ), '[]'::jsonb)
  );
end; $$;
revoke all on function public.admin_get_referrals_dashboard() from public, anon, authenticated;
grant execute on function public.admin_get_referrals_dashboard() to authenticated;

-- Admin: issue a bank account payout directly to a referrer
create or replace function public.admin_issue_bank_payout(p_user_id uuid, p_coins integer, p_utr text, p_note text default null) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg    public.referral_config;
  v_wallet public.user_wallets;
  v_utr    text := upper(trim(coalesce(p_utr, '')));
  v_rupees integer;
  v_name   text;
  v_phone  text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if length(v_utr) < 4 then raise exception 'Enter the bank transfer UTR or reference number.'; end if;
  select * into v_cfg from public.referral_config where id = 1;
  select * into v_wallet from public.user_wallets where user_id = p_user_id for update;
  if not found or p_coins is null or p_coins <= 0 or v_wallet.coins_balance < p_coins then
    raise exception 'Insufficient coins in referrer wallet.';
  end if;

  v_rupees := floor((p_coins::numeric / 1000.0) * v_cfg.rupees_per_1000_coins)::integer;
  if v_rupees <= 0 then raise exception 'Payout amount must be at least ₹1.'; end if;

  select coalesce(a.full_name, u.raw_user_meta_data->>'full_name', 'Applicant'),
         coalesce(a.phone, u.raw_user_meta_data->>'phone', '')
    into v_name, v_phone
    from auth.users u
    left join public.applications a on a.user_id = u.id
   where u.id = p_user_id
   order by a.created_at desc nulls last
   limit 1;

  update public.user_wallets
     set coins_balance = coins_balance - p_coins, updated_at = now()
   where user_id = p_user_id;

  insert into public.payout_requests(user_id, user_name, user_phone, upi_id, coins, amount_rupees, status, payout_utr, admin_note, paid_at, processed_by)
  values (p_user_id, coalesce(nullif(trim(v_name), ''), 'Applicant'), coalesce(v_phone, ''), 'Bank Transfer', p_coins, v_rupees, 'paid', v_utr, nullif(trim(coalesce(p_note,'')), ''), now(), auth.uid());
end; $$;
revoke all on function public.admin_issue_bank_payout(uuid,integer,text,text) from public, anon, authenticated;
grant execute on function public.admin_issue_bank_payout(uuid,integer,text,text) to authenticated;

-- Admin: update referral program config
create or replace function public.admin_update_referral_config(p jsonb) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  update public.referral_config set
    enabled               = coalesce((p->>'enabled')::boolean, enabled),
    coins_per_referral    = greatest(0, coalesce((p->>'coins_per_referral')::integer, coins_per_referral)),
    rupees_per_1000_coins = greatest(1, coalesce((p->>'rupees_per_1000_coins')::integer, rupees_per_1000_coins)),
    min_redeem_coins      = greatest(100, coalesce((p->>'min_redeem_coins')::integer, min_redeem_coins)),
    award_trigger         = case when (p->>'award_trigger') in ('fee_verified','submitted') then p->>'award_trigger' else award_trigger end,
    updated_at            = now()
  where id = 1;
end; $$;
revoke all on function public.admin_update_referral_config(jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_referral_config(jsonb) to authenticated;

-- Admin: mark payout paid or declined (refunding coins on decline)
create or replace function public.admin_process_payout(p_id uuid, p_action text, p_utr text default null, p_note text default null) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_req public.payout_requests;
  v_utr text := upper(trim(coalesce(p_utr, '')));
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_action not in ('paid', 'declined') then raise exception 'Invalid action.'; end if;
  select * into v_req from public.payout_requests where id = p_id for update;
  if not found then raise exception 'Payout request not found.'; end if;
  if v_req.status <> 'pending' then raise exception 'This payout has already been processed.'; end if;

  if p_action = 'paid' then
    if length(v_utr) < 4 then raise exception 'Enter the UPI or Bank transfer UTR reference.'; end if;
    update public.payout_requests
       set status = 'paid', payout_utr = v_utr, admin_note = nullif(trim(coalesce(p_note,'')), ''),
           paid_at = now(), processed_by = auth.uid()
     where id = p_id;
  else
    update public.payout_requests
       set status = 'declined', admin_note = nullif(trim(coalesce(p_note,'')), ''), processed_by = auth.uid()
     where id = p_id;
    update public.user_wallets
       set coins_balance = coins_balance + v_req.coins, updated_at = now()
     where user_id = v_req.user_id;
  end if;
end; $$;
revoke all on function public.admin_process_payout(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_process_payout(uuid,text,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- 19. Broker referral flow: approval message with referral link,
--     referral-code check on the apply page, duplicate applicant check,
--     and paying ticked referrals together.
-- ---------------------------------------------------------------------

-- Internal: return the member's referral code, creating a unique one (e.g. MP7K2Q9X) if needed.
create or replace function public.ensure_referral_code(p_uid uuid) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_code  text;
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I to avoid typos
  i       integer;
begin
  if p_uid is null then return null; end if;
  select referral_code into v_code from public.user_wallets where user_id = p_uid;
  if found then return v_code; end if;
  loop
    v_code := 'MP';
    for i in 1..6 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::integer, 1);
    end loop;
    exit when not exists(select 1 from public.user_wallets where referral_code = v_code);
  end loop;
  insert into public.user_wallets(user_id, referral_code) values (p_uid, v_code)
  on conflict (user_id) do nothing;
  select referral_code into v_code from public.user_wallets where user_id = p_uid;
  return v_code;
end; $$;
revoke all on function public.ensure_referral_code(uuid) from public, anon, authenticated;

-- Admin: referral code for an approved application (used in the WhatsApp / mail approval message).
create or replace function public.admin_referral_share(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_app public.applications;
  v_cfg public.referral_config;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_app from public.applications where id = p_id;
  if not found then raise exception 'Application not found.'; end if;
  if v_app.status <> 'accepted' then raise exception 'Approve the application before sharing the referral link.'; end if;
  select * into v_cfg from public.referral_config where id = 1;
  return jsonb_build_object(
    'code', public.ensure_referral_code(v_app.user_id),
    'coins_per_referral', coalesce(v_cfg.coins_per_referral, 1000),
    'enabled', coalesce(v_cfg.enabled, true));
end; $$;
revoke all on function public.admin_referral_share(uuid) from public, anon, authenticated;
grant execute on function public.admin_referral_share(uuid) to authenticated;

-- Public: is this referral code real? (apply page shows a tick next to the code)
create or replace function public.referral_code_valid(p_code text) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.user_wallets w, public.referral_config c
     where c.id = 1 and c.enabled and w.referral_code = upper(trim(coalesce(p_code, ''))));
$$;
revoke all on function public.referral_code_valid(text) from public, anon, authenticated;
grant execute on function public.referral_code_valid(text) to anon, authenticated;

-- Public: has this mobile number / email already applied? Returns 'phone', 'email' or null.
-- Lets the form stop a repeat applicant on the first step, before they pay.
create or replace function public.check_applicant_exists(p_phone text, p_email text default null) returns text
language sql stable security definer set search_path = public
as $$
  select case
    when exists(select 1 from public.applications where phone = trim(coalesce(p_phone, ''))) then 'phone'
    when nullif(lower(trim(coalesce(p_email, ''))), '') is not null
         and exists(select 1 from public.applications where lower(contact_email) = lower(trim(p_email))) then 'email'
  end;
$$;
revoke all on function public.check_applicant_exists(text,text) from public, anon, authenticated;
grant execute on function public.check_applicant_exists(text,text) to anon, authenticated;

-- Admin: pay several approved referrals of ONE member together (records one bank/UPI payout).
create or replace function public.admin_pay_referrals(p_ids uuid[], p_utr text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg      public.referral_config;
  v_utr      text := upper(trim(coalesce(p_utr, '')));
  v_ids      uuid[];
  v_count    integer;
  v_members  integer;
  v_coins    integer;
  v_referrer uuid;
  v_rupees   integer;
  v_name     text;
  v_phone    text;
  v_payout   uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if length(v_utr) < 4 then raise exception 'Enter the bank / UPI transfer UTR or reference number.'; end if;
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_ids, '{}'::uuid[])) x;
  if v_ids is null or cardinality(v_ids) = 0 then raise exception 'Tick at least one referral to pay.'; end if;

  perform 1 from public.referrals where id = any(v_ids) for update;
  select count(*), count(distinct referrer_user_id), coalesce(sum(coins_awarded), 0), min(referrer_user_id::text)::uuid
    into v_count, v_members, v_coins, v_referrer
    from public.referrals
   where id = any(v_ids) and status = 'completed' and paid_at is null;
  if v_count <> cardinality(v_ids) then
    raise exception 'Some ticked referrals are not approved yet or were already paid. Refresh and try again.';
  end if;
  if v_members <> 1 then raise exception 'Pay one member''s referrals at a time.'; end if;

  select * into v_cfg from public.referral_config where id = 1;
  v_rupees := floor((v_coins::numeric / 1000.0) * v_cfg.rupees_per_1000_coins)::integer;
  if v_rupees <= 0 then raise exception 'Payout amount must be at least ₹1.'; end if;

  select coalesce(a.full_name, u.raw_user_meta_data->>'full_name', 'Applicant'),
         coalesce(a.phone, u.raw_user_meta_data->>'phone', '')
    into v_name, v_phone
    from auth.users u
    left join public.applications a on a.user_id = u.id
   where u.id = v_referrer
   order by a.created_at desc nulls last
   limit 1;

  insert into public.payout_requests(user_id, user_name, user_phone, upi_id, coins, amount_rupees, status, payout_utr, admin_note, paid_at, processed_by)
  values (v_referrer, coalesce(nullif(trim(v_name), ''), 'Applicant'), coalesce(v_phone, ''), 'Bank / UPI transfer',
          v_coins, v_rupees, 'paid', v_utr,
          coalesce(nullif(trim(coalesce(p_note, '')), ''), v_count || ' referral(s) paid'), now(), auth.uid())
  returning id into v_payout;

  update public.referrals set paid_at = now(), payout_id = v_payout where id = any(v_ids);
  update public.user_wallets
     set coins_balance = greatest(0, coins_balance - v_coins), updated_at = now()
   where user_id = v_referrer;

  return jsonb_build_object('payout_id', v_payout, 'count', v_count, 'coins', v_coins, 'amount_rupees', v_rupees);
end; $$;
revoke all on function public.admin_pay_referrals(uuid[],text,text) from public, anon, authenticated;
grant execute on function public.admin_pay_referrals(uuid[],text,text) to authenticated;

-- ---------------------------------------------------------------------
-- Razorpay payments confirmed by the server (/api/razorpay/verify).
-- Written only with the service role key after the signature AND the
-- payment status/amount are checked with Razorpay. Admins use it to tell a
-- genuine online payment apart from a typed-in payment ID.
create table if not exists public.razorpay_payments (
  payment_id   text primary key,                -- e.g. pay_ABC123
  utr          text not null unique,            -- payment_id as stored in applications.transaction_id (PAYABC123)
  order_id     text not null,
  amount_paise integer not null check (amount_paise > 0),
  status       text not null,
  verified_at  timestamptz not null default now()
);
alter table public.razorpay_payments enable row level security;
revoke all on public.razorpay_payments from anon, authenticated;
grant select on public.razorpay_payments to authenticated;
drop policy if exists "Admins read Razorpay payments" on public.razorpay_payments;
create policy "Admins read Razorpay payments" on public.razorpay_payments
  for select to authenticated using (public.is_admin());

commit;

-- =====================================================================
-- After running: create the admin in Authentication → Users (email + password), then promote it:
--
--   insert into public.admin_users(user_id)
--   select id from auth.users where email = 'admin@yourcompany.com'
--   on conflict do nothing;
-- =====================================================================
