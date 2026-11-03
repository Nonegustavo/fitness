-- Server side of the app's local-first sync. Every row of every local table is
-- one record here, keyed by (user, collection, id). The client owns the schema;
-- the server orders writes (rev) and keeps the newest version of each record.

create sequence if not exists public.records_rev_seq;

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint not null default nextval('public.records_rev_seq'),
  primary key (user_id, collection, id)
);

create index if not exists records_user_rev_idx on public.records (user_id, rev);

-- Every write gets a new rev, so a client can pull "everything after rev N".
create or replace function public.records_bump_rev()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rev := nextval('public.records_rev_seq');
  return new;
end;
$$;

drop trigger if exists records_bump_rev on public.records;
create trigger records_bump_rev
  before update on public.records
  for each row execute function public.records_bump_rev();

alter table public.records enable row level security;

drop policy if exists "records are private" on public.records;
create policy "records are private" on public.records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.records to authenticated;
grant usage, select on sequence public.records_rev_seq to authenticated;

-- Upsert in which the newest client timestamp wins.
create or replace function public.push_records(items jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.records as r (user_id, collection, id, data, updated_at, deleted)
  select (select auth.uid()), i.collection, i.id, coalesce(i.data, '{}'::jsonb), i.updated_at, coalesce(i.deleted, false)
  from jsonb_to_recordset(items) as i (collection text, id text, data jsonb, updated_at bigint, deleted boolean)
  on conflict (user_id, collection, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted
    where r.updated_at < excluded.updated_at;
$$;

revoke execute on function public.push_records(jsonb) from public, anon;
grant execute on function public.push_records(jsonb) to authenticated;
