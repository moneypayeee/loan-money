alter table public.payment_settings
  add column if not exists emi_annual_rate numeric(4,2) not null default 18
  check (emi_annual_rate between 0 and 60);
