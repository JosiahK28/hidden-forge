-- ============================================================
-- The Hidden Forge — private Third Brain map
-- Run once in Supabase -> SQL Editor. Safe to re-run.
-- `third_brain_push.py setup` fills in the two placeholders.
-- Independent of the vault_dashboard table/key in setup.sql —
-- this feature can be set up whether or not that one is.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- One row holds the latest Third Brain map (domains, principles, works,
-- and their typed relations) as exported from the Obsidian vault.
create table if not exists public.third_brain_map (
  id           int primary key default 1 check (id = 1),
  data         jsonb not null,
  generated_at timestamptz not null default now()
);

alter table public.third_brain_map enable row level security;
revoke all on public.third_brain_map from anon, authenticated;
grant select on public.third_brain_map to authenticated;

-- Only the owner's signed-in session can read it. There are no
-- insert/update/delete policies, so nobody can write through the API.
drop policy if exists "owner reads third brain map" on public.third_brain_map;
create policy "owner reads third brain map"
  on public.third_brain_map for select
  to authenticated
  using ( lower(auth.jwt() ->> 'email') = '__OWNER_EMAIL__' );

-- The laptop's push key is stored only as a SHA-256 hash, in a schema
-- the API does not expose. (Separate key from vault_dashboard's, so
-- either feature can be rotated or revoked without touching the other.)
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.third_brain_push_key (
  id   int primary key default 1 check (id = 1),
  hash text not null
);
insert into private.third_brain_push_key (id, hash)
values (1, '__PUSH_KEY_SHA256__')
on conflict (id) do update set hash = excluded.hash;

-- The only way to write: present the push key. Does nothing else.
create or replace function public.push_third_brain_map(push_key text, data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if push_key is null or encode(extensions.digest(push_key, 'sha256'), 'hex')
       is distinct from (select hash from private.third_brain_push_key where id = 1) then
    raise exception 'invalid push key' using errcode = '28000';
  end if;
  if pg_column_size(data) > 1000000 then
    raise exception 'payload too large';
  end if;
  insert into public.third_brain_map (id, data, generated_at)
  values (1, data, now())
  on conflict (id) do update set data = excluded.data, generated_at = now();
end;
$$;

revoke all on function public.push_third_brain_map(text, jsonb) from public;
grant execute on function public.push_third_brain_map(text, jsonb) to anon, authenticated;
