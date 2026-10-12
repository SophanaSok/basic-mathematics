-- Basic Mathematics — accounts, synced progress, and attempt analytics.
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query). Safe to re-run.
--
-- Five things live here:
--   user_state  one row per reader: the same JSON the site keeps in localStorage
--   attempts    append-only log of answer checks, for the author's "where is the course failing" view
--   profiles    an optional display name, and whether the reader joined the Daily board
--   daily_runs  one Arena Daily result per reader per day, for the opt-in Daily board
--   board_secret  one random key the Daily board's generated names are hashed with
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
  -- assets/arena.js points(): right first time pays 100 plus 20 per answer of streak, so the
  -- most n questions can pay is 100n + 10n(n - 1) (700 for the Daily's 5)
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
