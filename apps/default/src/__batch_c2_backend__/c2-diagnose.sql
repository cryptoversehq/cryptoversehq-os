-- ============================================================
-- CryptoVerse HQ · Batch C2 diagnostic — run this in the Neon SQL editor.
-- 30 seconds, no deploy, and it settles "why is the roster empty".
-- ============================================================

-- (1) Which columns C2 needs are MISSING from public.users?
--     EXPECT 0 ROWS. Any row printed here is the bug: the C2 roster SELECT
--     named that column, Postgres answered 42703 `column "x" does not exist`,
--     the route returned 500, and the panel rendered an empty users list.
select needed.name as missing_column
  from (values ('id'), ('email'), ('role'), ('plan'), ('balance'),
               ('display_name'), ('language'), ('status'),
               ('created_at'), ('updated_at'),
               ('last_seen_at'), ('last_seen_ip'))
       as needed(name)
 where not exists (
   select 1
     from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'users'
      and column_name  = needed.name
 );

-- (2) Full column list, for the record.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'users'
 order by ordinal_position;

-- (3) Row count — 0 here would mean an empty table, not a broken query.
select count(*)::int as users from public.users;

-- ============================================================
-- THE FIX (idempotent, safe to re-run) — only if (1) printed anything.
-- This is BATCH3_DDL.sql STEP 1; the session half of that file was clearly
-- applied (single-session worked in Batch 3), so run this half now.
-- ============================================================
alter table public.users add column if not exists display_name text;
alter table public.users add column if not exists language     text not null default 'en';
alter table public.users add column if not exists status       text not null default 'active';

create index if not exists idx_users_status on public.users (status);

-- Re-run query (1) — it must now print nothing.
