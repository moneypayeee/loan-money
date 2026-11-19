-- Editable application fee (2026-11-19)
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to run more than once.
-- 1. Lets the fee be any amount from ₹1 to ₹1,00,000 (was locked to ₹299).
-- 2. New applications are saved with the fee that is live when they apply.
begin;

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

-- New applications store the current fee (was hard-coded 299)
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

commit;
