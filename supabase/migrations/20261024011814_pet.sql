-- Migration 20261024011814_pet: adds user_state.pet, where Mochi's pool syncs (bm.pet.v1: facets earned
-- and spent, the pet's needs, care days and outfit), and makes the fresh start clear it. Apply it
-- in the SQL editor on the live project before or after the site that syncs the key (X-2b) is
-- deployed. It is backward compatible: the site now live never names the column, so it keeps
-- working with the column there, and X-2b leaves the column out (`lacks`) until it exists. A
-- reset clears it (the client does); nothing is dropped (docs/decisions/0015-mochi-pool.md).

alter table public.user_state add column if not exists pet jsonb not null default '{}'::jsonb;

-- Same body as schema.sql, with pet = '{}' added to the update.
create or replace function private.fresh_start(key text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from private.once o where o.key = fresh_start.key) then
    return false;
  end if;
  -- the reset trigger fires only for a user_state row whose reset_at grows: start the others over
  -- here, those with no row and those a hostile client parked at the bigint maximum (it cannot grow)
  update public.event_meta m set epoch = m.epoch + 1
   where not exists (select 1 from public.user_state s where s.user_id = m.user_id and s.reset_at < 9223372036854775807);
  delete from public.events e
   where not exists (select 1 from public.user_state s where s.user_id = e.user_id and s.reset_at < 9223372036854775807);
  update public.user_state
     set progress = '{}', play = '{}', attempts = '{}', activity = '{}', lesson = '{}', last = null, game = '{}', pet = '{}',
         updated_at = now(),
         reset_at = greatest(least(reset_at, 9223372036854775806) + 1, (extract(epoch from clock_timestamp()) * 1000)::bigint);   -- least(): a reset_at at the bigint maximum must not overflow
  insert into private.once (key) values (fresh_start.key);
  return true;
end;
$$;
revoke all on function private.fresh_start(text) from public, anon, authenticated;
