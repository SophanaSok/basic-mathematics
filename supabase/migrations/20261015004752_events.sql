-- Migration 20261015004752_events: the event log (src/sync/events.ts, format 1).
-- Adds the events and event_meta tables (row-level security on; the browser may only read its own
-- events, every write goes through events_put()), the private schema and its helpers
-- (events_valid, events_prune, events_on_reset, events_ceiling; no role but the owner can run them),
-- the functions public.events_put() and public.events_usage() (the second for admins), and the
-- two triggers on user_state that start a reader's log over when they reset. Apply it in the SQL
-- editor on the live project before the pull request that makes the site write events (P6) is
-- merged. It is purely additive and backward compatible: the site now live never names these
-- objects, and nothing existing is changed. exercise_stats() and chapter_stats() are untouched.
-- Kill switch, if events_put() ever has to be stopped without a deploy:
--   revoke execute on function public.events_put(jsonb, integer) from authenticated;

-- ------------------------------------------------------------------ tables --

-- The event log (src/sync/events.ts, format 1; docs: the P-series plan). One row per learner
-- action, written only by events_put() and read back through the "read own events" policy.
-- Every column is bounded to what format 1 allows, so a row that is in the table is a valid
-- entry whoever wrote it. The hash inside an id is not recomputed here (see private.events_valid).
-- `private` holds the helpers the browser must never call: no role but the owner can use it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.events (
  user_id uuid not null references auth.users (id) on delete cascade,
  id   text not null check (id ~ '^[0-9a-z]{8}-[0-9a-z]{8}-[0-9a-z]{7}$'),
  v    smallint not null default 1 check (v between 1 and 99),
  t    integer not null check (t between 27000000 and 60000000),
  d    integer not null check (d between 18000 and 42000 and abs(d - t / 1440) <= 1),
  src  text not null check (src ~ '^[a-z]{1,3}$'),
  sec  text not null check (sec ~ '^[a-z0-9:#/-]{0,90}$'),
  ref  text not null check (ref ~ '^[a-z0-9:#/-]{0,90}$'),
  k    text not null check (k ~ '^[a-z]$'),
  ok   smallint not null check (ok in (0, 1)),
  n    smallint not null check (n between 0 and 999),
  r    smallint not null check (r between 0 and 9),
  f    integer not null check (f between 0 and 65535),
  x    jsonb check (x is null or (jsonb_typeof(x) = 'object' and length(x::text) <= 400)),
  seq  bigint not null,
  rd   integer not null default (current_date - date '1970-01-01'),   -- the UTC day the row arrived; never from the client
  primary key (user_id, id)
);
create unique index if not exists events_seq_idx on public.events (user_id, seq);
create index if not exists events_sec_idx on public.events (user_id, sec, d) where k in ('a', 'z');
create index if not exists events_ref_idx on public.events (ref) where k not in ('a', 'z');

-- One row per reader: the count that orders their events (seq), the number of times their log
-- has been reset (epoch), and the day's quota counters. Only the functions touch it.
create table if not exists public.event_meta (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  seq       bigint  not null default 0,
  epoch     integer not null default 0,
  day       date    not null default current_date,
  day_n     integer not null default 0,
  day_calls integer not null default 0
);

-- ------------------------------------------------------- row-level security --

alter table public.events enable row level security;
alter table public.event_meta enable row level security;   -- no policies: only the event functions touch it
revoke all on table public.events, public.event_meta from anon, authenticated;
grant select on table public.events to authenticated;   -- the browser may read its own rows; every write goes through events_put()

drop policy if exists "read own events" on public.events;
create policy "read own events" on public.events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- --------------------------------------------------------------- functions --

-- The size ceiling of public.events (table, indexes and toast) past which events_put() refuses
-- new rows. A function so a test can lower it.
create or replace function private.events_ceiling()
returns bigint
language sql immutable
as $$ select 314572800::bigint; $$;

-- Is one batch element, { "id": "...", "p": [ ... ] }, a valid entry of format 1? The rules
-- of isValid() in src/sync/events.ts except the hash inside the id, which the browser checks.
-- today is the UTC day number. Every value is checked as text, with a bounded pattern, before
-- it is cast, so no input can raise; anything unexpected is false.
create or replace function private.events_valid(e jsonb, today integer)
returns boolean
language plpgsql immutable security definer set search_path = ''
as $$
declare
  int_re constant text := '^-?[0-9]{1,12}$';
  text_re constant text := '^[a-z0-9:#/-]{0,90}$';
  p jsonb; id text; x jsonb;
  t bigint; d bigint; ok bigint; n bigint; r bigint; f bigint;
  src text; sec text; ref text; k text;
  xb bigint; xl bigint; xs bigint; xn bigint; xo bigint;
  i integer; key text;
begin
  if e is null or jsonb_typeof(e) <> 'object' then return false; end if;
  if jsonb_typeof(e->'id') is distinct from 'string' then return false; end if;
  id := e->>'id';
  if id !~ '^[0-9a-z]{8}-[0-9a-z]{8}-[0-9a-z]{7}$' then return false; end if;
  p := e->'p';
  if jsonb_typeof(p) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p) not in (10, 11) then return false; end if;

  foreach i in array array[0, 1, 6, 7, 8, 9] loop
    if jsonb_typeof(p->i) is distinct from 'number' or (p->>i) !~ int_re then return false; end if;
  end loop;
  foreach i in array array[2, 3, 4, 5] loop
    if jsonb_typeof(p->i) is distinct from 'string' then return false; end if;
  end loop;
  t := (p->>0)::bigint; d := (p->>1)::bigint; ok := (p->>6)::bigint;
  n := (p->>7)::bigint; r := (p->>8)::bigint; f := (p->>9)::bigint;
  src := p->>2; sec := p->>3; ref := p->>4; k := p->>5;

  if t < 27000000 or t > 60000000 or d < 18000 or d > 42000 or abs(d - t / 1440) > 1 then return false; end if;
  if ok not in (0, 1) or n < 0 or n > 999 or r < 0 or r > 9 or f < 0 or f > 65535 then return false; end if;
  if src !~ '^[a-z]{1,3}$' or sec !~ text_re or ref !~ text_re or k !~ '^[a-z]$' then return false; end if;
  if (left(id, 8) = '00000000') <> (k = 'z') then return false; end if;

  if jsonb_array_length(p) = 11 then
    x := p->10;
    if jsonb_typeof(x) <> 'object' or length(x::text) > 400 then return false; end if;
    -- the client grammar (xValid): printable ASCII, no backslash (so no escape and no quote
    -- inside a string), integers of at most 1e12 in size, nested no deeper than X_DEPTH_MAX = 4
    -- (x is level 0 here and depth 1 there, so level 4 is depth 5)
    if x::text !~ '^[ -~]*$' or position('\' in x::text) > 0 then return false; end if;
    if jsonb_path_exists(x, '$.** ? (@.type() == "number" && (@ != @.floor() || @ > 1000000000000 || @ < -1000000000000))', '{}'::jsonb, true) then return false; end if;
    if jsonb_path_exists(x, 'strict $.**{4 to last}', '{}'::jsonb, true) then return false; end if;
  end if;

  if k = 'z' then
    if jsonb_array_length(p) <> 11 or src <> 'cp' or sec = '' then return false; end if;
    foreach key in array array['b', 'l', 's', 'n', 'o'] loop
      if jsonb_typeof(x->key) is distinct from 'number' or (x->>key) !~ int_re then return false; end if;
    end loop;
    xb := (x->>'b')::bigint; xl := (x->>'l')::bigint; xs := (x->>'s')::bigint;
    xn := (x->>'n')::bigint; xo := (x->>'o')::bigint;
    if xb < 0 or xb > 4 or xl < 18000 or xl > 42000 or xo < 0 or xo > xn or xn > 1000000 then return false; end if;
    if not (xl < xs) or d <> xs - 1 or xl > d or t <> d * 1440 then return false; end if;
    if xs > coalesce(today, -1000) + 2 then return false; end if;   -- T14: a checkpoint cannot sit in the future
  end if;
  return true;
exception when others then
  return false;
end;
$$;

-- Deletes from one reader's events what prune() in src/sync/events.ts drops: the losing
-- checkpoints of each section, then the Arena answers before the section's winning
-- checkpoint and all but the first two, last two and first wrong one of each day, then every
-- page entry past the first eight of its ref except the first right check and the first
-- solution opened. id is ordered "C" (by bytes), which for [0-9a-z-] is the browser's order.
create or replace function private.events_prune(uid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- z: one winner per section
  delete from public.events e
  using (
    select z.id,
           row_number() over (partition by z.sec order by (z.x->>'s')::int desc, (z.x->>'l')::int desc,
             (z.x->>'b')::int desc, (z.x->>'n')::int desc, (z.x->>'o')::int desc, z.id collate "C" desc) as rn
    from public.events z
    where z.user_id = uid and z.k = 'z'
  ) w
  where e.user_id = uid and e.id = w.id and w.rn > 1;

  -- s: Arena answers before the winner's day, then the head, tail and first wrong one of each day
  delete from public.events e
  using public.events z
  where e.user_id = uid and e.k = 'a' and z.user_id = uid and z.k = 'z' and z.sec = e.sec
    and e.d < (z.x->>'s')::int;

  delete from public.events e
  using (
    select r.id from (
      select a.id, a.rn, a.cnt,
             min(a.rn) filter (where a.ok = 0) over (partition by a.sec, a.d) as first_wrong
      from (
        select s.id, s.sec, s.d, s.ok,
               row_number() over (partition by s.sec, s.d order by s.t, s.id collate "C") as rn,
               count(*) over (partition by s.sec, s.d) as cnt
        from public.events s
        where s.user_id = uid and s.k = 'a'
      ) a
    ) r
    where not (r.rn <= 2 or r.cnt - r.rn < 2 or r.rn is not distinct from r.first_wrong)
  ) w
  where e.user_id = uid and e.id = w.id;

  -- p: everything else, by ref
  delete from public.events e
  using (
    select r.id from (
      select a.id, a.rn,
             min(a.rn) filter (where a.k = 'c' and a.ok = 1) over (partition by a.ref) as first_check,
             min(a.rn) filter (where a.k = 'o') over (partition by a.ref) as first_open
      from (
        select p.id, p.ref, p.k, p.ok,
               row_number() over (partition by p.ref order by p.t, p.id collate "C") as rn
        from public.events p
        where p.user_id = uid and p.k not in ('a', 'z')
      ) a
    ) r
    where not (r.rn <= 8 or r.rn is not distinct from r.first_check or r.rn is not distinct from r.first_open)
  ) w
  where e.user_id = uid and e.id = w.id;
end;
$$;

-- The caller's events_put(batch, epoch). batch is an array of up to 500 elements
-- { "id": "...", "p": [ ... ] }; epoch is the reset count the browser last saw.
-- Never raises except when nobody is signed in: a refusal is a { "hint": ... } result, and
-- the day's counters are written before any refusal, so a refused call still counts.
--   bm-calls   more than 2000 calls today          bm-batch  not an array, over 500 elements or 256 KB
--   bm-reset   epoch is not the current one        bm-full   the table is over its ceiling, or 25000 rows
--   bm-quota   more than 3000 new rows today       bm-error  an unexpected failure (logged)
-- An empty batch is the handshake: it returns the current epoch and seq.
create or replace function public.events_put(batch jsonb, epoch integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  meta public.event_meta%rowtype;
  today date := current_date;
  rd integer := current_date - date '1970-01-01';
  now_min bigint := floor(extract(epoch from pg_catalog.now()) / 60);
  cl jsonb;
  refused jsonb;
  n_new integer;
  added integer;
begin
  if uid is null then
    raise exception 'not signed in';
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

  if batch is null or jsonb_typeof(batch) <> 'array' or jsonb_array_length(batch) > 500 or pg_catalog.pg_column_size(batch) > 262144 then
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
    -- one element per id (the greater payload wins), each judged: invalid, future, already held, new
    select coalesce(jsonb_agg(jsonb_build_object('c', c.c, 'i', pg_catalog.left(c.id, 64), 'e', c.e) order by c.ord), '[]'::jsonb)
      into cl
    from (
      select s.e, s.id, s.ord,
             case when not private.events_valid(s.e, rd) then 'invalid'
                  when (s.e->'p'->>0)::bigint > now_min + 1440 then 'future'
                  when exists (select 1 from public.events v where v.user_id = uid and v.id = s.id) then 'held'
                  else 'new' end as c
      from (
        select distinct on (a.id, case when a.id is null then a.ord end) a.e, a.id, a.ord
        from (select b.e, b.e->>'id' as id, b.ord from jsonb_array_elements(batch) with ordinality as b(e, ord)) a
        order by a.id, case when a.id is null then a.ord end, (a.e->'p')::text desc
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

-- A reset (user_state.reset_at moving forward, or first set) starts the reader's log over:
-- the epoch moves on and their events are deleted, so another device that still holds the old
-- epoch is told (bm-reset) instead of writing into the new log. Two triggers because an
-- insert has no old row to compare with.
create or replace function private.events_on_reset()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.event_meta (user_id) values (new.user_id) on conflict do nothing;
  update public.event_meta m set epoch = m.epoch + 1 where m.user_id = new.user_id;
  delete from public.events e where e.user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists events_on_reset_insert on public.user_state;
create trigger events_on_reset_insert after insert on public.user_state
  for each row when (new.reset_at > 0) execute function private.events_on_reset();
drop trigger if exists events_on_reset_update on public.user_state;
create trigger events_on_reset_update after update of reset_at on public.user_state
  for each row when (new.reset_at > old.reset_at) execute function private.events_on_reset();

-- Size of the log, for the author. One row; empty for anyone who is not an admin.
create or replace function public.events_usage()
returns table (rows bigint, users bigint, p50 numeric, p99 numeric, max bigint, events_bytes bigint, meta_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select u.* from (
    select coalesce(sum(c), 0)::bigint,
           count(*)::bigint,
           (percentile_cont(0.5) within group (order by c))::numeric,
           (percentile_cont(0.99) within group (order by c))::numeric,
           coalesce(max(c), 0)::bigint,
           pg_catalog.pg_total_relation_size('public.events'),
           pg_catalog.pg_total_relation_size('public.event_meta')
    from (select count(*) as c from public.events group by user_id) per
  ) u
  where public.is_admin();
$$;

-- ------------------------------------------------------------------- grants --

revoke all on function public.events_put(jsonb, integer), public.events_usage() from public, anon, authenticated;
grant execute on function public.events_put(jsonb, integer), public.events_usage() to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
