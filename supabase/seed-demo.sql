-- =====================================================================
-- Money Pay — 3 demo customers for the admin panel
-- ---------------------------------------------------------------------
-- Paste into Supabase → SQL Editor → Run. Safe to run again.
--
-- ⚠ Deletes EVERY existing application and borrower login first (with KYC,
--   timeline, loans and EMIs). Use only before going live.
--
--   1. Karthik Nair  – approved, loan ₹1,00,000, 2 EMIs paid, on time
--   2. Lakshmi Iyer  – approved, loan ₹60,000, 2 EMIs paid, 2 overdue
--   3. Asha Rao      – applied a few hours ago, waiting for KYC check
--
-- Borrower login (My loan page) for both approved customers:
--   Karthik  9876543201 / Demo@12345
--   Lakshmi  9876543202 / Demo@12345
--
-- Document images are not real files, so they won't open in the KYC tab.
-- Needs at least one admin in admin_users (actions are credited to them).
-- =====================================================================

begin;

-- 1. Remove all existing applications (cascades to everything linked) and borrower logins
delete from public.applications;
delete from public.borrower_sessions;
delete from public.borrower_accounts;

-- 2. Demo applicant accounts (fixed ids so this script can be re-run)
delete from auth.users where id in (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000003');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'm' || u.phone || '@phone.moneypay.invalid',
       extensions.crypt('Demo@12345', extensions.gen_salt('bf', 10)), now() - u.age,
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('phone', u.phone, 'full_name', u.name) ||
         case when u.email is null then '{}'::jsonb else jsonb_build_object('contact_email', u.email) end,
       now() - u.age, now(), '', '', '', ''
  from (values
    ('d0000000-0000-4000-8000-000000000001', '9876543201', 'Karthik Nair', null,                  interval '75 days'),
    ('d0000000-0000-4000-8000-000000000002', '9876543202', 'Lakshmi Iyer', 'lakshmi@example.com', interval '140 days'),
    ('d0000000-0000-4000-8000-000000000003', '9876543203', 'Asha Rao',     'asha@example.com',    interval '6 hours')
  ) as u(id, phone, name, email, age);

-- 3. Everything else
do $$
declare
  v_admin  uuid := (select user_id from public.admin_users order by created_at limit 1);
  v_site   public.site_settings    := (select s from public.site_settings s where id = 1);
  v_pay    public.payment_settings := (select p from public.payment_settings p where id = 1);
  r        record;
  v_emi    integer;
  v_rate   numeric;
  i        integer;
begin
  if v_admin is null then raise exception 'Add your admin to admin_users first (see the end of schema.sql).'; end if;

  for r in select * from (values
    -- id, user, name, phone, category, amount, utr, applied, approved, email, status
    ('7f3a9c21-4b8e-4d1a-9f2c-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'Karthik Nair', '9876543201', 'Employed',
     100000, '425610038871', now() - interval '75 days', now() - interval '73 days', null::text, 'accepted'),
    ('b48e2d5a-1c7f-4e3b-8a9d-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid, 'Lakshmi Iyer', '9876543202', 'Self-employed',
     60000, '425198220455', now() - interval '140 days', now() - interval '137 days', 'lakshmi@example.com', 'accepted'),
    ('c91d5e07-6a2b-4f8c-b3e1-000000000003'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid, 'Asha Rao', '9876543203', 'Employed',
     75000, '431100274913', now() - interval '6 hours', null::timestamptz, 'asha@example.com', 'pending')
  ) as t(id, uid, name, phone, category, amount, utr, applied, approved, email, status)
  loop
    insert into public.applications (
      id, ref_code, user_id, full_name, phone, category, requested_amount, transaction_id, proof_path,
      fee, payee_name, upi_id, qr_path, status, payment_verified, kyc_verified, admin_note,
      reviewed_by, reviewed_at, created_at, updated_at, refund_upi_id, refund_status,
      lender_name, lender_reg_no, contact_email,
      kyc_status, kyc_reviewed_at, kyc_reviewed_by)
    values (
      r.id, 'MP-' || upper(substr(replace(r.id::text, '-', ''), 1, 8)), r.uid, r.name, r.phone, r.category, r.amount, r.utr,
      r.uid || '/demo-payment.png',
      299, coalesce(nullif(v_pay.payee_name, ''), 'Sample Payee'), coalesce(nullif(v_pay.upi_id, ''), 'sample@upi'),
      coalesce(v_pay.qr_path, 'payment-qr.svg'),
      r.status, r.status = 'accepted', r.status = 'accepted',
      case when r.status = 'accepted' then 'Approved. The lender will contact you with your loan offer.' else '' end,
      case when r.status = 'accepted' then v_admin end, r.approved, r.applied, coalesce(r.approved, r.applied),
      lower(split_part(r.name, ' ', 1)) || '@okaxis', 'not_applicable',
      coalesce(nullif(v_site.lender_name, ''), 'Sample Finance Pvt Ltd'), coalesce(nullif(v_site.lender_reg_no, ''), 'N-00.00000'), r.email,
      case when r.status = 'accepted' then 'verified' else 'pending' end,
      r.approved - interval '2 hours', case when r.status = 'accepted' then v_admin end);

    insert into public.application_kyc (application_id, dob, address, city, state, pincode, identity_type, identity_last4,
                                        identity_path, address_path, consent_at)
    values (r.id,
            case r.phone when '9876543201' then date '1992-03-18' when '9876543202' then date '1988-11-02' else date '1997-07-25' end,
            case r.phone when '9876543201' then '42, 2nd Main, Koramangala 5th Block'
                         when '9876543202' then 'Flat 3B, Lakeview Apartments, Anna Nagar'
                         else '12, 4th Cross, Indiranagar' end,
            case r.phone when '9876543202' then 'Chennai' else 'Bengaluru' end,
            case r.phone when '9876543202' then 'Tamil Nadu' else 'Karnataka' end,
            case r.phone when '9876543201' then '560095' when '9876543202' then '600040' else '560038' end,
            'Voter ID', case r.phone when '9876543201' then 'KN42' when '9876543202' then 'LI88' else 'AR17' end,
            r.uid || '/demo-id.png', r.uid || '/demo-address.png', r.applied);

    insert into public.application_events (application_id, kind, note, actor, created_at)
    values (r.id, 'submitted', 'Application submitted with ₹299 fee (UTR ' || r.utr || ')', r.uid, r.applied);

    continue when r.status <> 'accepted';

    insert into public.application_events (application_id, kind, note, actor, created_at) values
      (r.id, 'kyc_verified', 'KYC documents verified', v_admin, r.approved - interval '2 hours'),
      (r.id, 'accepted', 'Approved. The lender will contact you with your loan offer.', v_admin, r.approved);

    -- Loan: Karthik's next EMI is due tomorrow; Lakshmi's 3rd and 4th EMIs are overdue
    v_rate := case when r.phone = '9876543201' then 16 else 18 end;
    v_emi  := round(r.amount * (v_rate / 1200) * power(1 + v_rate / 1200, 12) / (power(1 + v_rate / 1200, 12) - 1));

    insert into public.loans (application_id, loan_account_no, sanctioned_amount, interest_rate, tenure_months, emi_amount,
                              first_emi_date, disbursed_on, status, note, disbursed_amount, disbursed_to, processing_fee, apr,
                              late_fee, prepayment_terms, repayment_method, repayment_details, repayment_link, updated_at, updated_by)
    values (r.id,
            case when r.phone = '9876543201' then 'SFL/PL/24001' else 'SFL/PL/23811' end,
            r.amount, v_rate, 12, v_emi,
            (current_date - interval '2 months' + interval '1 day' - case when r.phone = '9876543202' then interval '2 months' else interval '0' end)::date,
            (r.approved + interval '2 days')::date, 'active',
            'Your EMI is collected by auto-debit on the due date. Keep enough balance in your account a day before.',
            r.amount - round(r.amount * 0.02), 'HDFC Bank ••' || right(r.phone, 4), round(r.amount * 0.02), v_rate + 2.5,
            '₹500 per missed EMI', 'No charge after 6 EMIs', 'auto_debit',
            'EMIs are auto-debited from your registered bank account on the due date.', '', r.approved + interval '2 days', v_admin);

    insert into public.application_events (application_id, kind, note, actor, created_at) values
      (r.id, 'loan_updated', 'Loan details updated (active)', v_admin, r.approved + interval '2 days'),
      (r.id, 'access_issued', 'Borrower login password issued', v_admin, r.approved + interval '2 days');

    -- One borrower login per mobile number (covers all their loans)
    insert into public.borrower_accounts (phone, password_hash, issued_at, issued_by, last_login_at)
    values (r.phone, extensions.crypt('Demo@12345', extensions.gen_salt('bf', 10)), r.approved + interval '2 days', v_admin,
            now() - case when r.phone = '9876543201' then interval '1 day' else interval '35 days' end)
    on conflict (phone) do nothing;

    -- First 2 EMIs paid, on their due dates
    for i in 1..2 loop
      insert into public.loan_payments (application_id, instalment_no, paid_on, amount, reference, recorded_by, recorded_at)
      select r.id, i, (l.first_emi_date + (i - 1) * interval '1 month')::date, v_emi,
             'NACH' || to_char(l.first_emi_date + (i - 1) * interval '1 month', 'YYYYMMDD') || i, v_admin,
             l.first_emi_date + (i - 1) * interval '1 month' + interval '10 hours'
        from public.loans l where l.application_id = r.id;
      insert into public.application_events (application_id, kind, note, actor, created_at)
      select r.id, 'payment_recorded', 'EMI ' || i || ' marked paid (₹' || v_emi || ')', v_admin,
             l.first_emi_date + (i - 1) * interval '1 month' + interval '10 hours'
        from public.loans l where l.application_id = r.id;
    end loop;
  end loop;
end $$;

commit;
