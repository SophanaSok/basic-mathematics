-- Basic Mathematics — accounts, synced progress, and attempt analytics.
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query). Safe to re-run.
--
-- Seven things live here:
--   user_state  one row per reader: the same JSON the site keeps in localStorage
--   attempts    append-only log of answer checks, for the author's "where is the course failing" view
--   profiles    an optional display name, and whether the reader joined the Daily board
--   daily_runs  one Arena Daily result per reader per day, for the opt-in Daily board
--   board_secret  one random key the Daily board's generated names are hashed with
--   events, event_meta  the event log (src/sync/events.ts): one row per learner action, written
--                only by events_put(), and the counters that order and limit them
-- Row-level security makes every row private to its owner. The aggregate functions at
-- the bottom are the only way to read across readers, and only for ids listed in `admins`;
-- the Daily board functions read across the readers who opted in, and return only a
-- generated name, a score and a time (docs/decisions/0006-keyboard-and-speedruns.md).

-- ------------------------------------------------------------------ tables --

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);
-- Added with the Daily board: the reader's opt-in, off by default. Written by the reader
-- through the "own profile" policy; leave_board() turns it off and deletes their runs.
alter table public.profiles add column if not exists board boolean not null default false;

create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,   -- bm.progress.v1
  play jsonb not null default '{}'::jsonb,       -- bm.play.v1
  attempts jsonb not null default '{}'::jsonb,   -- bm.attempts.v1
  activity jsonb not null default '{}'::jsonb,   -- bm.activity.v1
  lesson jsonb not null default '{}'::jsonb,     -- bm.lesson.v1
  last jsonb,                                    -- bm.last
  game jsonb not null default '{}'::jsonb,       -- bm.game.v1: achievements, medals, Arena review boxes
  diag jsonb not null default '{}'::jsonb,       -- bm.diag.v1: placement-check takes; kept through a reset
  reset_at bigint not null default 0,            -- ms timestamp of the last deliberate reset
  updated_at timestamptz not null default now()
);
-- Added with the game layer. A project created before it gets the column here; the site
-- writes it on every sync, so it must exist before the new site is deployed with accounts on.
alter table public.user_state add column if not exists game jsonb not null default '{}'::jsonb;
-- Added with the placement check. A project created before it gets the column here; it must
-- exist on the live project before the site that syncs it (D-5) is deployed. Unlike the other
-- columns, a reset (reset_at) does not clear it: only deleting the account does
-- (docs/decisions/0003-placement-check.md, owner Q1(a)).
alter table public.user_state add column if not exists diag jsonb not null default '{}'::jsonb;

create table if not exists public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapter text not null check (char_length(chapter) <= 40),
  ex_key text not null check (char_length(ex_key) <= 80),
  section text check (char_length(section) <= 80),
  correct boolean not null,
  try_no integer not null default 1,
  hint_level integer not null default 0,
  solution_open boolean not null default false,
  inline boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists attempts_exercise_idx on public.attempts (chapter, ex_key);
create index if not exists attempts_user_idx on public.attempts (user_id);

-- The Daily board: one row per reader per Arena Daily (the reader's local day, 5 questions).
-- Scores are reported by the page and only bounds-checked here; nothing in the course hangs
-- on them. No policies: only submit_daily(), daily_board() and leave_board() touch it.
create table if not exists public.daily_runs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  score integer not null check (score between 0 and 1000),
  n integer not null check (n between 1 and 5),
  firsts integer not null check (firsts between 0 and n),
  -- assets/arena.js points(): right first time pays 100 plus 20 per answer of streak (so f
  -- of them pay at most 100f + 10f(f - 1), 700 for the Daily's 5), a retry after a miss 30
  check (score <= 100 * firsts + 10 * firsts * (firsts - 1) + 30 * (n - firsts)),
  ms integer check (ms is null or ms between n * 250 and n * 600000),  -- only for a clean run; a quick answer can take under a second
  submitted_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists daily_runs_day_idx on public.daily_runs (day, score desc, ms asc, submitted_at asc);

-- The key the board's generated names are hashed with, made once per project: without it a
-- user id cannot be turned into the names it had. One row; only daily_board() reads it.
create table if not exists public.board_secret (
  id boolean primary key default true check (id),
  secret text not null
);
-- 64 hex digits from two random UUIDs (gen_random_uuid() is in core Postgres and draws on the
-- same strong random source as pgcrypto); the where clause keeps a re-run from replacing it.
insert into public.board_secret (secret)
select pg_catalog.replace(pg_catalog.gen_random_uuid()::text || pg_catalog.gen_random_uuid()::text, '-', '')
where not exists (select 1 from public.board_secret);

-- Who may see the aggregates. Add yourself after signing up:
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

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
  rd   integer not null default (((pg_catalog.now() at time zone 'UTC')::date) - date '1970-01-01'),   -- the UTC day the row arrived; never from the client
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
  day       date    not null default ((pg_catalog.now() at time zone 'UTC')::date),
  day_n     integer not null default 0,
  day_calls integer not null default 0
);

-- ------------------------------------------------------- row-level security --

alter table public.profiles enable row level security;
alter table public.user_state enable row level security;
alter table public.attempts enable row level security;
alter table public.admins enable row level security;   -- no policies: not readable from the browser at all
alter table public.daily_runs enable row level security;   -- no policies: only the board functions touch it
revoke all on table public.daily_runs from anon, authenticated;
alter table public.board_secret enable row level security;   -- no policies: only daily_board() reads it
revoke all on table public.board_secret from anon, authenticated;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "own state" on public.user_state;
create policy "own state" on public.user_state
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "read own attempts" on public.attempts;
create policy "read own attempts" on public.attempts
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "log own attempts" on public.attempts;
create policy "log own attempts" on public.attempts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

alter table public.events enable row level security;
alter table public.event_meta enable row level security;   -- no policies: only the event functions touch it
revoke all on table public.events, public.event_meta from anon, authenticated;
grant select on table public.events to authenticated;   -- the browser may read its own rows; every write goes through events_put()

drop policy if exists "read own events" on public.events;
create policy "read own events" on public.events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- --------------------------------------------------------------- functions --

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- One row per exercise, across all readers. Empty for anyone who is not an admin.
create or replace function public.exercise_stats()
returns table (
  chapter text, ex_key text, section text, inline boolean,
  learners bigint, checks bigint, solved bigint, first_try bigint,
  used_hint bigint, opened_solution bigint, avg_tries numeric
)
language sql stable security definer set search_path = ''
as $$
  with per as (
    select a.user_id, a.chapter, a.ex_key,
           max(a.section) as section,
           bool_or(a.inline) as inline,
           count(*) as tries,
           bool_or(a.correct) as solved,
           bool_or(a.correct and a.try_no = 1 and not a.solution_open) as first_try,
           max(a.hint_level) as hints,
           bool_or(a.solution_open) as opened
    from public.attempts a
    where public.is_admin()
    group by a.user_id, a.chapter, a.ex_key
  )
  select per.chapter, per.ex_key, max(per.section), bool_or(per.inline),
         count(*), sum(per.tries)::bigint,
         count(*) filter (where per.solved),
         count(*) filter (where per.first_try),
         count(*) filter (where per.hints >= 1),
         count(*) filter (where per.opened),
         round(avg(per.tries), 2)
  from per
  group by per.chapter, per.ex_key
  order by per.chapter, per.ex_key;
$$;

-- How many readers reached each chapter, and how recently. Empty for non-admins.
create or replace function public.chapter_stats()
returns table (chapter text, learners bigint, checks bigint, active_7d bigint)
language sql stable security definer set search_path = ''
as $$
  select a.chapter,
         count(distinct a.user_id),
         count(*),
         count(distinct a.user_id) filter (where a.created_at > now() - interval '7 days')
  from public.attempts a
  where public.is_admin()
  group by a.chapter
  order by a.chapter;
$$;

-- Lets a reader remove their own account; every table above cascades from auth.users.
create or replace function public.delete_my_account()
returns void
language sql security definer set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

-- The Daily board (docs/decisions/0006-keyboard-and-speedruns.md). The ordering everywhere:
-- score desc, ms asc nulls last, submitted_at asc. Only readers whose profiles.board is true
-- count or show, so turning the switch off takes a reader off the board at once, even before
-- leave_board() deletes their rows. A day's board is hidden (null rank, no rows) until three
-- such readers have played it.

-- Records the caller's Daily for p_day and returns their rank that day (1-based), or null while
-- fewer than three have played. First submission wins: a replay changes nothing. The check
-- constraints bound every number; a violation raises, which the site treats as "not recorded".
create or replace function public.submit_daily(p_day text, p_score integer, p_n integer, p_firsts integer, p_ms integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (pg_catalog.now() at time zone 'utc')::date;
  total integer;
  r integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  -- for share: a concurrent leave_board() either waits for this insert and deletes it, or has
  -- already committed and this sees board = false
  if not coalesce((select p.board from public.profiles p where p.id = uid for share), false) then
    raise exception 'not on the board';
  end if;
  if p_day is null or p_day !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'bad day';
  end if;
  -- Local days differ by time zone, so the day may be one either side of today in UTC.
  if abs(p_day::date - today) > 1 then
    raise exception 'day out of range';
  end if;

  insert into public.daily_runs (user_id, day, score, n, firsts, ms)
  values (uid, p_day, p_score, p_n, p_firsts, case when p_firsts = p_n then p_ms end)
  on conflict (user_id, day) do nothing;

  select count(*)::integer into total
  from public.daily_runs d join public.profiles p on p.id = d.user_id
  where d.day = p_day and p.board;
  if total < 3 then
    return null;
  end if;
  select x.rk into r
  from (
    select d.user_id,
           (row_number() over (order by d.score desc, d.ms asc nulls last, d.submitted_at asc, d.user_id))::integer as rk
    from public.daily_runs d join public.profiles p on p.id = d.user_id
    where d.day = p_day and p.board
  ) x
  where x.user_id = uid;
  return r;
end;
$$;

-- One day's board: the top 20 and the caller's own row if it is lower, each with its rank and
-- a name ("Quick Prism 07") made from a one-way hash, keyed with board_secret, of the reader and
-- the day: stable for the day, different the next, never anything a person typed, and not
-- computable from a user id alone. No rows while fewer than three have played. Never
-- returns a user id, an email or a display name.
create or replace function public.daily_board(p_day text)
returns table (rank integer, handle text, score integer, ms integer, mine boolean, entries integer)
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  total integer;
  board_key text;
  adj constant text[] := array[
    'quick', 'bright', 'calm', 'steady', 'brisk', 'keen', 'merry', 'sunny',
    'bold', 'clever', 'gentle', 'nimble', 'swift', 'eager', 'jolly', 'lively',
    'plucky', 'witty', 'cheerful', 'curious', 'daring', 'hardy', 'lucky', 'mellow',
    'noble', 'rapid', 'tidy', 'upbeat', 'zesty', 'breezy', 'cozy', 'golden'];
  noun constant text[] := array[
    'prism', 'radius', 'vector', 'lemma', 'tangent', 'vertex', 'matrix', 'scalar',
    'cosine', 'octave', 'parabola', 'helix', 'torus', 'axiom', 'chord', 'cube',
    'digit', 'ellipse', 'factor', 'fractal', 'graph', 'integer', 'median', 'modulus',
    'polygon', 'quotient', 'ratio', 'sector', 'sphere', 'theorem', 'cone', 'spiral'];
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select count(*)::integer into total
  from public.daily_runs d join public.profiles p on p.id = d.user_id
  where d.day = p_day and p.board;
  if total < 3 then
    return;
  end if;
  select b.secret into board_key from public.board_secret b where b.id;
  if board_key is null then
    raise exception 'board secret missing';
  end if;
  return query
    with ranked as (
      select d.user_id, d.score, d.ms,
             (row_number() over (order by d.score desc, d.ms asc nulls last, d.submitted_at asc, d.user_id))::integer as rk,
             pg_catalog.decode(pg_catalog.md5(board_key || d.user_id::text || p_day), 'hex') as h
      from public.daily_runs d join public.profiles p on p.id = d.user_id
      where d.day = p_day and p.board
    )
    select r.rk,
           pg_catalog.initcap(adj[1 + pg_catalog.get_byte(r.h, 0) % 32] || ' ' || noun[1 + pg_catalog.get_byte(r.h, 1) % 32])
             || ' ' || pg_catalog.lpad((pg_catalog.get_byte(r.h, 2) % 100)::text, 2, '0'),
           r.score, r.ms, r.user_id = uid, total
    from ranked r
    where r.rk <= 20 or r.user_id = uid
    order by r.rk;
end;
$$;

-- Leaves the board: the opt-in off and every Daily the caller recorded deleted.
create or replace function public.leave_board()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  update public.profiles set board = false where id = uid;
  delete from public.daily_runs where user_id = uid;
end;
$$;

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
  -- the UTC day, never current_date: that follows the session's TimeZone, which a request can set
  today date := (pg_catalog.now() at time zone 'UTC')::date;
  rd integer := ((pg_catalog.now() at time zone 'UTC')::date) - date '1970-01-01';
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

-- A reset (user_state.reset_at moving forward, or first set) starts the reader's log over:
-- the epoch moves on and their events are deleted, so another device that still holds the old
-- epoch is told (bm-reset) instead of writing into the new log. Two triggers because an
-- insert has no old row to compare with.
create or replace function private.events_on_reset()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- no event_meta row means events_put() never ran for this reader, so there is no server log to
  -- start over (a first sync from a device that reset before the log existed is not a reset of it)
  update public.event_meta m set epoch = m.epoch + 1 where m.user_id = new.user_id;
  if found then
    delete from public.events e where e.user_id = new.user_id;
  end if;
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

revoke all on function public.is_admin() from public, anon;
revoke all on function public.exercise_stats() from public, anon;
revoke all on function public.chapter_stats() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.exercise_stats() to authenticated;
grant execute on function public.chapter_stats() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
revoke execute on function public.submit_daily(text, integer, integer, integer, integer) from public, anon;
revoke execute on function public.daily_board(text) from public, anon;
revoke execute on function public.leave_board() from public, anon;
grant execute on function public.submit_daily(text, integer, integer, integer, integer) to authenticated;
grant execute on function public.daily_board(text) to authenticated;
grant execute on function public.leave_board() to authenticated;
revoke all on function public.events_put(jsonb, integer), public.events_usage() from public, anon, authenticated;
grant execute on function public.events_put(jsonb, integer), public.events_usage() to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
