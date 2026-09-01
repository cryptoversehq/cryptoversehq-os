create table if not exists public.payment_settings (
  id uuid primary key default gen_random_uuid(),
  product_type varchar(20) not null check (product_type in ('subscription', 'cp_purchase')),
  product_id varchar(64) not null,
  name varchar(120),
  description varchar(240),
  amount numeric(12, 2) not null check (amount > 0),
  currency varchar(10) not null default 'USD',
  cp_amount integer check (cp_amount is null or cp_amount > 0),
  active boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint payment_settings_product_unique unique (product_type, product_id),
  constraint payment_settings_cp_amount_check check (
    (product_type = 'cp_purchase' and cp_amount is not null)
    or (product_type = 'subscription' and cp_amount is null)
  )
);

create table if not exists public.payment_settings_history (
  id uuid primary key default gen_random_uuid(),
  payment_setting_id uuid not null references public.payment_settings(id) on delete cascade,
  product_type varchar(20) not null,
  product_id varchar(64) not null,
  name varchar(120),
  description varchar(240),
  amount numeric(12, 2) not null,
  currency varchar(10) not null,
  cp_amount integer,
  active boolean not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

alter table public.payments add column if not exists product_type varchar(20) not null default 'subscription';
alter table public.payments add column if not exists cp_amount integer;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_product_type_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments add constraint payments_product_type_check
      check (product_type in ('subscription', 'cp_purchase'));
  end if;
end $$;
create index if not exists payments_product_type_idx on public.payments (product_type, plan_id);

create table if not exists public.subscription_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id varchar(64) not null,
  payment_id uuid not null references public.payments(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status varchar(20) not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (payment_id),
  unique (user_id, plan_id, starts_at)
);

create table if not exists public.cp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_id uuid not null references public.payments(id),
  amount integer not null check (amount > 0),
  entry_type varchar(32) not null default 'purchase',
  reference_key varchar(128) not null,
  created_at timestamptz not null default now(),
  unique (payment_id),
  unique (reference_key)
);

create index if not exists payment_settings_active_idx
  on public.payment_settings (product_type, product_id) where active = true;

create index if not exists subscription_entitlements_user_status_idx
  on public.subscription_entitlements (user_id, status, ends_at desc);

create index if not exists cp_ledger_user_created_idx
  on public.cp_ledger (user_id, created_at desc);

alter table public.payment_settings enable row level security;
alter table public.payment_settings_history enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.cp_ledger enable row level security;

revoke all on public.payment_settings from anon;
revoke all on public.payment_settings_history from anon;
revoke all on public.subscription_entitlements from anon;
revoke all on public.cp_ledger from anon;

grant select on public.payment_settings to authenticated;
grant select on public.subscription_entitlements to authenticated;
grant select on public.cp_ledger to authenticated;

drop policy if exists payment_settings_select_active on public.payment_settings;
create policy payment_settings_select_active
on public.payment_settings for select to authenticated
using (active = true);

drop policy if exists subscription_entitlements_select_own on public.subscription_entitlements;
create policy subscription_entitlements_select_own
on public.subscription_entitlements for select to authenticated
using (auth.uid() = user_id);

drop policy if exists cp_ledger_select_own on public.cp_ledger;
create policy cp_ledger_select_own
on public.cp_ledger for select to authenticated
using (auth.uid() = user_id);

create or replace function public.record_payment_setting_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.payment_settings_history (
    payment_setting_id, product_type, product_id, name, description,
    amount, currency, cp_amount, active, changed_by
  ) values (
    old.id, old.product_type, old.product_id, old.name, old.description,
    old.amount, old.currency, old.cp_amount, old.active, coalesce(new.updated_by, old.updated_by)
  );
  return new;
end;
$$;

drop trigger if exists payment_settings_history_trigger on public.payment_settings;
create trigger payment_settings_history_trigger
after update on public.payment_settings
for each row execute function public.record_payment_setting_history();

insert into public.payment_settings (product_type, product_id, name, description, amount, currency, cp_amount)
values
  ('subscription', 'pro', 'Pro Plan', 'اشتراک ماهانه · CryptoVerse HQ', 20.00, 'USD', null),
  ('subscription', 'pro_plus', 'Pro+ Plan', 'اشتراک ماهانه · CryptoVerse HQ', 40.00, 'USD', null),
  ('cp_purchase', 'starter', 'Starter', 'خرید اعتبار CryptoVerse HQ', 50.00, 'USD', 5000),
  ('cp_purchase', 'trader', 'Trader', 'خرید اعتبار CryptoVerse HQ', 100.00, 'USD', 12000),
  ('cp_purchase', 'whale', 'Whale', 'خرید اعتبار CryptoVerse HQ', 400.00, 'USD', 50000),
  ('cp_purchase', 'institution', 'Institution', 'خرید اعتبار CryptoVerse HQ', 1500.00, 'USD', 200000)
on conflict (product_type, product_id) do nothing;
