-- Migration learners: parent-managed accounts, part 1, the database (docs/decisions/0010-parent-managed-accounts.md).
-- Adds public.learners (every account's self learner has id = account id, so no row moves), re-points
-- user_state, events and event_meta at it, widens their policies to the caller's learners, gives
-- events_put an optional learner argument (two-argument calls keep working) and adds the learner_*
-- functions plus a step-up check (private.fresh_auth) for delete and export. Idempotent.

-- Managed learners (docs/decisions/0010-parent-managed-accounts.md). A parent account holds
-- learners that have no sign-in of their own. From here on `user_id` in user_state, events and
-- event_meta means "learner id". Every account has a self learner whose id is its account id, so
-- no existing row moves. Written only through the learner_* functions.
create table if not exists public.learners (
  id         uuid primary key default gen_random_uuid(),
  guardian   uuid not null references auth.users (id) on delete cascade,
  self       boolean not null default false,
  name       text check (name is null or char_length(name) between 1 and 40),
  under13    boolean not null default false,
  consent_v  smallint,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  check (self = (id = guardian)),
  check (not self or not under13),
  check (not under13 or consent_v is not null)
);
comment on table public.learners is 'A person who learns: an account''s self learner (id = account id) or a managed learner. user_id in user_state, events and event_meta is a learners.id.';
create index if not exists learners_guardian_idx on public.learners (guardian);
alter table public.learners enable row level security;
revoke all on table public.learners from anon, authenticated;
grant select on table public.learners to authenticated;   -- writes only through the learner_* functions
drop policy if exists "own learners" on public.learners;
create policy "own learners" on public.learners for select to authenticated
  using (guardian = (select auth.uid()));

-- every existing account gets its self learner
insert into public.learners (id, guardian, self) select id, id, true from auth.users on conflict (id) do nothing;

-- and every new account, in the same transaction; it does nothing else, so sign-up cannot fail on it
create schema if not exists private;
create or replace function private.learner_self()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.learners (id, guardian, self) values (new.id, new.id, true) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists learners_self on auth.users;
create trigger learners_self after insert on auth.users
  for each row execute function private.learner_self();

-- the three data tables now hang on learners (cascade: removing a learner removes its data)
alter table public.user_state drop constraint if exists user_state_user_id_fkey;
alter table public.user_state add constraint user_state_user_id_fkey
  foreign key (user_id) references public.learners (id) on delete cascade;
alter table public.events drop constraint if exists events_user_id_fkey;
alter table public.events add constraint events_user_id_fkey
  foreign key (user_id) references public.learners (id) on delete cascade;
alter table public.event_meta drop constraint if exists event_meta_user_id_fkey;
alter table public.event_meta add constraint event_meta_user_id_fkey
  foreign key (user_id) references public.learners (id) on delete cascade;

drop policy if exists "own state" on public.user_state;
create policy "own state" on public.user_state
  for all to authenticated
  using (user_id in (select l.id from public.learners l where l.guardian = (select auth.uid())))
  with check (user_id in (select l.id from public.learners l where l.guardian = (select auth.uid())));

drop policy if exists "read own events" on public.events;
create policy "read own events" on public.events
  for select to authenticated
  using (user_id in (select l.id from public.learners l where l.guardian = (select auth.uid())));

drop function if exists public.events_put(jsonb, integer);   -- replaced by the three-argument form; the default keeps two-argument calls working
create or replace function public.events_put(batch jsonb, epoch integer, learner uuid default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := coalesce(learner, (select auth.uid()));
  meta public.event_meta%rowtype;
  -- the UTC day, never current_date: that follows the session's TimeZone, which a request can set
  today date := (pg_catalog.now() at time zone 'UTC')::date;
  rd integer := ((pg_catalog.now() at time zone 'UTC')::date) - date '1970-01-01';
  now_min bigint := floor(extract(epoch from pg_catalog.now()) / 60);
  cl jsonb;
  refused jsonb;
  n_new integer;
  added integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  if learner is not null and not exists (select 1 from public.learners l where l.id = learner and l.guardian = (select auth.uid())) then
    raise exception 'not your learner';
  end if;
  insert into public.event_meta (user_id) values (uid) on conflict do nothing;
  select * into meta from public.event_meta m where m.user_id = uid for update;   -- one call at a time per reader

  if meta.day < today then
    meta.day := today; meta.day_n := 0; meta.day_calls := 0;
  end if;
  meta.day_calls := meta.day_calls + 1;
  update public.event_meta m set day = meta.day, day_n = meta.day_n, day_calls = meta.day_calls where m.user_id = uid;
  if meta.day_calls > 2000 then
    return jsonb_build_object('hint', 'bm-calls');
  end if;

  -- nested, not one `or`: the length is read only once batch is known to be an array
  if batch is null then
    return jsonb_build_object('hint', 'bm-batch');
  end if;
  if jsonb_typeof(batch) <> 'array' then
    return jsonb_build_object('hint', 'bm-batch');
  end if;
  if jsonb_array_length(batch) > 500 then
    return jsonb_build_object('hint', 'bm-batch');
  end if;
  if pg_catalog.pg_column_size(batch) > 262144 then
    return jsonb_build_object('hint', 'bm-batch');
  end if;
  if jsonb_array_length(batch) = 0 then
    return jsonb_build_object('epoch', meta.epoch, 'seq', meta.seq);
  end if;
  if events_put.epoch is distinct from meta.epoch then
    return jsonb_build_object('hint', 'bm-reset', 'epoch', meta.epoch);
  end if;
  if pg_catalog.pg_total_relation_size('public.events') > private.events_ceiling() then
    return jsonb_build_object('hint', 'bm-full');
  end if;

  begin
    -- Numbers are judged as numbers here, before anything is turned into text: 1e99999 is a
    -- short numeral that prints as 100 KB, and the dedupe sorts and the checks print. An element
    -- holding a number past 1e12 in size, or a nonzero one under 1e-12, is invalid at once and
    -- takes no part in the rest. The others: one element per id (the greater payload wins, by
    -- size then by jsonb order, neither of which prints), each judged: invalid, future, held, new.
    select coalesce(jsonb_agg(jsonb_build_object('c', c.c, 'i', pg_catalog.left(c.id, 64), 'e', case when c.c = 'new' then c.e end) order by c.ord), '[]'::jsonb)
      into cl
    from (
      select s.e, s.id, s.ord,
             case when s.huge then 'invalid'
                  when not private.events_valid(s.e, rd) then 'invalid'
                  when (s.e->'p'->>0)::bigint > now_min + 1440 then 'future'
                  when exists (select 1 from public.events v where v.user_id = uid and v.id = s.id) then 'held'
                  else 'new' end as c
      from (
        (select distinct on (a.id, case when a.id is null then a.ord end) a.e, a.id, a.ord, false as huge
         from (select z.e, z.e->>'id' as id, z.ord from jsonb_array_elements(batch) with ordinality as z(e, ord)
               where not jsonb_path_exists(z.e, 'strict $.** ? (@.type() == "number" && (@ > 1000000000000 || @ < -1000000000000 || (@ != 0 && @ < 0.000000000001 && @ > -0.000000000001)))', '{}'::jsonb, true)) a
         order by a.id, case when a.id is null then a.ord end, pg_catalog.pg_column_size(a.e->'p') desc, (a.e->'p') desc)
        union all
        (select null::jsonb, case when jsonb_typeof(h.e->'id') = 'string' then h.e->>'id' end, h.ord, true
         from jsonb_array_elements(batch) with ordinality as h(e, ord)
         where jsonb_path_exists(h.e, 'strict $.** ? (@.type() == "number" && (@ > 1000000000000 || @ < -1000000000000 || (@ != 0 && @ < 0.000000000001 && @ > -0.000000000001)))', '{}'::jsonb, true))
      ) s
    ) c;
    select coalesce(jsonb_agg(jsonb_build_object('id', j->'i', 'why', case j->>'c' when 'invalid' then 'invalid' else 'future' end) order by ord) filter (where j->>'c' <> 'new'), '[]'::jsonb),
           (count(*) filter (where j->>'c' = 'new'))::integer
      into refused, n_new
    from jsonb_array_elements(cl) with ordinality as a(j, ord)
    where j->>'c' in ('invalid', 'future', 'new');

    if meta.day_n + n_new > 3000 then
      return jsonb_build_object('hint', 'bm-quota', 'refused', refused);
    end if;
    if (select count(*) from public.events v where v.user_id = uid) + n_new > 25000 then
      return jsonb_build_object('hint', 'bm-full');
    end if;

    insert into public.events (user_id, id, v, t, d, src, sec, ref, k, ok, n, r, f, x, seq)
    select uid, j->'e'->>'id',
           case when coalesce(jsonb_typeof(j->'e'->'v'), '') = 'number' and (j->'e'->>'v') ~ '^([1-9]|[1-9][0-9])$'
                then (j->'e'->>'v')::smallint else 1::smallint end,
           (j->'e'->'p'->>0)::integer, (j->'e'->'p'->>1)::integer, j->'e'->'p'->>2, j->'e'->'p'->>3, j->'e'->'p'->>4, j->'e'->'p'->>5,
           (j->'e'->'p'->>6)::smallint, (j->'e'->'p'->>7)::smallint, (j->'e'->'p'->>8)::smallint, (j->'e'->'p'->>9)::integer,
           case when jsonb_array_length(j->'e'->'p') = 11 then j->'e'->'p'->10 end,
           meta.seq + row_number() over (order by (j->'e'->'p'->>0)::integer, (j->'e'->>'id') collate "C")
    from jsonb_array_elements(cl) as a(j)
    where j->>'c' = 'new'
    on conflict do nothing;
    get diagnostics added = row_count;
    if added > 0 then
      perform private.events_prune(uid);
    end if;
    meta.seq := meta.seq + n_new;
    meta.day_n := meta.day_n + added;
    update public.event_meta m set seq = meta.seq, day_n = meta.day_n where m.user_id = uid;
    return jsonb_build_object('added', added, 'refused', refused,
                              'seq', meta.seq, 'epoch', meta.epoch);
  exception when others then
    raise log 'events_put: % (%)', sqlerrm, sqlstate;
    return jsonb_build_object('hint', 'bm-error');
  end;
end;
$$;

revoke all on function public.events_put(jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.events_put(jsonb, integer, uuid) to authenticated;

-- True when the caller's JWT shows a sign-in (an amr entry) within the last 10 minutes. Fails
-- closed: no claim (read from request.jwt.claims, as auth.jwt() does), a claim that is not an array, or entries without a number timestamp -> false.
create or replace function private.fresh_auth()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select max((a.value->>'timestamp')::numeric) >= extract(epoch from pg_catalog.now()) - 600
    from jsonb_array_elements(case when jsonb_typeof(j.amr) = 'array' then j.amr else '[]'::jsonb end) a
    where jsonb_typeof(a.value) = 'object' and jsonb_typeof(a.value->'timestamp') = 'number'
  ), false)
  from (select nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb -> 'amr' as amr) j;
$$;
revoke all on function private.fresh_auth() from public, anon, authenticated;

-- Lets a reader remove their own account; every table above cascades from auth.users (the
-- learners through learners.guardian). Needs a sign-in within the last 10 minutes.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.fresh_auth() then
    raise exception 'stale sign-in';
  end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

-- Managed learners: the only way to read-write public.learners. LEARNERS_MAX and CONSENT_V are
-- constants inside the functions; bump CONSENT_V when the consent wording changes.
create or replace function public.learner_list()
returns table (id uuid, self boolean, name text, under13 boolean, consent_v smallint, created_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  insert into public.learners (id, guardian, self) values (uid, uid, true) on conflict do nothing;
  return query
    select l.id, l.self, l.name, l.under13, l.consent_v, l.created_at
    from public.learners l where l.guardian = uid
    order by l.self desc, l.created_at, l.id;
end;
$$;

create or replace function public.learner_add(name text, under13 boolean, consent_v smallint)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  LEARNERS_MAX constant integer := 8;
  CONSENT_V constant smallint := 1;
  uid uuid := (select auth.uid());
  nm text := btrim(learner_add.name);
  u13 boolean := coalesce(learner_add.under13, false);
  new_id uuid;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if nm is null or char_length(nm) not between 1 and 40 then
    raise exception 'bad name';
  end if;
  if u13 and learner_add.consent_v is distinct from CONSENT_V then
    raise exception 'consent required';
  end if;
  -- one add at a time per guardian: lock the self learner row
  insert into public.learners (id, guardian, self) values (uid, uid, true) on conflict do nothing;
  perform 1 from public.learners l where l.id = uid for update;
  if (select count(*) from public.learners l where l.guardian = uid and not l.self) >= LEARNERS_MAX then
    raise exception 'too many learners';
  end if;
  insert into public.learners (guardian, self, name, under13, consent_v, consent_at)
    values (uid, false, nm, u13, case when u13 then CONSENT_V end, case when u13 then pg_catalog.now() end)
    returning learners.id into new_id;
  return new_id;
end;
$$;

create or replace function public.learner_rename(id uuid, name text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  nm text := btrim(learner_rename.name);
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if nm is null or char_length(nm) not between 1 and 40 then
    raise exception 'bad name';
  end if;
  update public.learners l set name = nm
    where l.id = learner_rename.id and l.guardian = uid and not l.self;
  if not found then
    raise exception 'not your learner';
  end if;
end;
$$;

create or replace function public.learner_mark_under13(id uuid, consent_v smallint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  CONSENT_V constant smallint := 1;
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if learner_mark_under13.consent_v is distinct from CONSENT_V then
    raise exception 'consent required';
  end if;
  update public.learners l set under13 = true, consent_v = learner_mark_under13.consent_v, consent_at = pg_catalog.now()
    where l.id = learner_mark_under13.id and l.guardian = uid and not l.self;
  if not found then
    raise exception 'not your learner';
  end if;
end;
$$;

create or replace function public.learner_delete(id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if not private.fresh_auth() then
    raise exception 'stale sign-in';
  end if;
  delete from public.learners l where l.id = learner_delete.id and l.guardian = uid and not l.self;
  if not found then
    raise exception 'not your learner';
  end if;
end;
$$;

create or replace function public.learner_export(id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  lr public.learners%rowtype;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if not private.fresh_auth() then
    raise exception 'stale sign-in';
  end if;
  select * into lr from public.learners l where l.id = learner_export.id and l.guardian = uid;
  if not found then
    raise exception 'not your learner';
  end if;
  return jsonb_build_object(
    'learner', row_to_json(lr),
    'state', (select to_jsonb(s) from public.user_state s where s.user_id = lr.id),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.seq) from public.events e where e.user_id = lr.id), '[]'::jsonb));
end;
$$;

revoke all on function public.learner_list(), public.learner_add(text, boolean, smallint), public.learner_rename(uuid, text),
  public.learner_mark_under13(uuid, smallint), public.learner_delete(uuid), public.learner_export(uuid) from public, anon;
grant execute on function public.learner_list(), public.learner_add(text, boolean, smallint), public.learner_rename(uuid, text),
  public.learner_mark_under13(uuid, smallint), public.learner_delete(uuid), public.learner_export(uuid) to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
