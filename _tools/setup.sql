-- ============================================================
-- The Hidden Forge — private vault dashboard
-- Run once in Supabase -> SQL Editor. Safe to re-run.
-- `vault_dashboard.py setup` fills in the two placeholders.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- One row holds the latest stats snapshot.
create table if not exists public.vault_dashboard (
  id           int primary key default 1 check (id = 1),
  data         jsonb not null,
  generated_at timestamptz not null default now()
);

alter table public.vault_dashboard enable row level security;
revoke all on public.vault_dashboard from anon, authenticated;
grant select on public.vault_dashboard to authenticated;

-- Only the owner's signed-in session can read it. There are no
-- insert/update/delete policies, so nobody can write through the API.
drop policy if exists "owner reads vault dashboard" on public.vault_dashboard;
create policy "owner reads vault dashboard"
  on public.vault_dashboard for select
  to authenticated
  using ( lower(auth.jwt() ->> 'email') = '__OWNER_EMAIL__' );

-- The laptop's push key is stored only as a SHA-256 hash, in a schema
-- the API does not expose.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.dashboard_push_key (
  id   int primary key default 1 check (id = 1),
  hash text not null
);
insert into private.dashboard_push_key (id, hash)
values (1, '__PUSH_KEY_SHA256__')
on conflict (id) do update set hash = excluded.hash;

-- The only way to write: present the push key. Does nothing else.
create or replace function public.push_vault_dashboard(push_key text, data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if push_key is null or encode(extensions.digest(push_key, 'sha256'), 'hex')
       is distinct from (select hash from private.dashboard_push_key where id = 1) then
    raise exception 'invalid push key' using errcode = '28000';
  end if;
  if pg_column_size(data) > 1000000 then
    raise exception 'payload too large';
  end if;
  insert into public.vault_dashboard (id, data, generated_at)
  values (1, data, now())
  on conflict (id) do update set data = excluded.data, generated_at = now();
end;
$$;

revoke all on function public.push_vault_dashboard(text, jsonb) from public;
grant execute on function public.push_vault_dashboard(text, jsonb) to anon, authenticated;
