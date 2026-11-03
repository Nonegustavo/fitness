-- The Garmin access token (valid 24 h), kept between calls of the garmin function: the function
-- starts cold on most calls and would otherwise ask Garmin for a new token every time. The
-- function reads and writes it as the signed-in user; each user only sees their own row.

create table if not exists public.garmin_token (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token text not null,
  expires_at timestamptz not null
);

alter table public.garmin_token enable row level security;

drop policy if exists "garmin token is private" on public.garmin_token;
create policy "garmin token is private" on public.garmin_token
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.garmin_token to authenticated;
