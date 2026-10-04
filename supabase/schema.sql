-- Basic Mathematics — accounts, synced progress, and attempt analytics.
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query). Safe to re-run.
--
-- Three things live here:
--   user_state  one row per reader: the same JSON the site keeps in localStorage
--   attempts    append-only log of answer checks, for the author's "where is the course failing" view
--   profiles    an optional display name
-- Row-level security makes every row private to its owner. The aggregate functions at
-- the bottom are the only way to read across readers, and only for ids listed in `admins`.

-- ------------------------------------------------------------------ tables --

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,   -- bm.progress.v1
  play jsonb not null default '{}'::jsonb,       -- bm.play.v1
  attempts jsonb not null default '{}'::jsonb,   -- bm.attempts.v1
  activity jsonb not null default '{}'::jsonb,   -- bm.activity.v1
  lesson jsonb not null default '{}'::jsonb,     -- bm.lesson.v1
  last jsonb,                                    -- bm.last
  game jsonb not null default '{}'::jsonb,       -- bm.game.v1: achievements, medals, Arena review boxes
  reset_at bigint not null default 0,            -- ms timestamp of the last deliberate reset
  updated_at timestamptz not null default now()
);
-- Added with the game layer. A project created before it gets the column here; the site
-- writes it on every sync, so it must exist before the new site is deployed with accounts on.
alter table public.user_state add column if not exists game jsonb not null default '{}'::jsonb;

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

revoke all on function public.is_admin() from public, anon;
revoke all on function public.exercise_stats() from public, anon;
revoke all on function public.chapter_stats() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.exercise_stats() to authenticated;
grant execute on function public.chapter_stats() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
