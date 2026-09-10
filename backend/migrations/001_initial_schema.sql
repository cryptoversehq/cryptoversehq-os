-- ============================================================
-- CryptoVerse HQ - Initial Schema (Neon PostgreSQL)
-- ============================================================

-- 1. Users table
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'user' check (role in ('user', 'support_admin', 'subscription_admin', 'developer')),
  plan text not null default 'free' check (plan in ('free', 'pro', 'pro_plus')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);
create index if not exists users_role_idx on public.users (role);

-- 2. Subscriptions table
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('pro', 'pro_plus')),
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled', 'revoked')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  granted_by uuid references public.users(id),
  payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_ends_at_idx on public.subscriptions (ends_at);

-- 3. Subscription Audit Log (append-only)
create table if not exists public.subscription_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.users(id),
  actor_email text,
  actor_role text not null,
  target_user_id uuid not null references public.users(id),
  plan_id text not null,
  action text not null check (action in ('grant', 'revoke', 'expire', 'payment')),
  result text not null default 'success' check (result in ('success', 'failure')),
  note text,
  error text,
  before_state jsonb,
  after_state jsonb,
  ip_address inet,
  user_agent text,
  request_id text,
  idempotency_key text,
  entitlement_id uuid references public.subscriptions(id),
  created_at timestamptz not null default now()
);

create index if not exists audit_actor_idx on public.subscription_audit_log (actor_id, created_at desc);
create index if not exists audit_target_idx on public.subscription_audit_log (target_user_id, created_at desc);
create index if not exists audit_action_idx on public.subscription_audit_log (action, created_at desc);

-- 4. Prevent updates/deletes on audit log (append-only enforcement)
create or replace function public.prevent_audit_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception 'subscription_audit_log is append-only';
end;
$$;

drop trigger if exists audit_log_no_update on public.subscription_audit_log;
create trigger audit_log_no_update
before update or delete on public.subscription_audit_log
for each row execute function public.prevent_audit_modification();

-- 5. Trigger for updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();
