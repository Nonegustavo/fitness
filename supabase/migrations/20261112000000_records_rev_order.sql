-- Revs in commit order. A rev comes from the sequence before its transaction commits, so while one
-- device's push is in flight another push can take a higher rev and commit first. A device pulling
-- "everything after rev N" in between sees the higher rev, moves its cursor past it, and never pulls
-- the lower one that commits a moment later.
--
-- The fix: every write of a user takes that user's transaction-level advisory lock before getting
-- its rev, and keeps it until the commit. One user's writes then queue up, so the revs a pull can see
-- are always a prefix of the ones handed out. Other users never wait (each has their own lock), and
-- pulls never wait (they don't lock). The rev is now set by the trigger on insert too (the column
-- default still exists but the trigger's value replaces it), so it is taken under the lock.

create or replace function public.records_bump_rev()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- One writer at a time per user, from before the first rev of a statement to the commit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  new.rev := nextval('public.records_rev_seq');
  return new;
end;
$$;

drop trigger if exists records_bump_rev on public.records;
create trigger records_bump_rev
  before insert or update on public.records
  for each row execute function public.records_bump_rev();
