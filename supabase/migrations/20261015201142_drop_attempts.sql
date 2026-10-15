-- Migration 20261015201142_drop_attempts: the fresh start (R2 P7, design §2.7).
-- Since P6 the site writes the event log and nothing writes public.attempts; the only readers left
-- were the two admin stats functions, which now read public.events. This file (1) adds the run-once
-- table private.once and the function private.fresh_start(), (2) calls it once, which empties every
-- reader's synced state and (through the reset_at trigger) starts their event log over, (3) drops
-- public.attempts (its policies and indexes go with it), and (4) rewrites exercise_stats() and
-- chapter_stats() to read public.events with the same output columns. The user_state.attempts
-- COLUMN (bm.attempts.v1) is not touched. Idempotent: the second application finds the marker
-- r2-fresh-start in private.once and does nothing. THE FRESH START CANNOT BE UNDONE (the free plan
-- has no backups): see "The fresh start (P7)" in OPERATIONS.md before applying it.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Run-once markers for one-off data changes (the fresh start below). No role but the owner can use it.
create table if not exists private.once (
  key text primary key,
  at  timestamptz not null default now()
);
revoke all on private.once from public, anon, authenticated;

-- The R2 fresh start (design §2.7): every reader's synced state goes back to empty and their event
-- log starts over (the reset_at trigger deletes the events and moves the epoch), so the old
-- progress, which no event explains, cannot be mixed with the new log. diag is deliberately kept
-- (see the comment on that column). Runs once per key: a second call returns false and changes
-- nothing. A function rather than a bare statement so the test suite can prove the guard.
create or replace function private.fresh_start(key text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from private.once o where o.key = fresh_start.key) then
    return false;
  end if;
  update public.user_state
     set progress = '{}', play = '{}', attempts = '{}', activity = '{}', lesson = '{}', last = null, game = '{}',
         updated_at = now(),
         reset_at = greatest(reset_at + 1, (extract(epoch from clock_timestamp()) * 1000)::bigint);
  insert into private.once (key) values (fresh_start.key);
  return true;
end;
$$;
revoke all on function private.fresh_start(text) from public, anon, authenticated;

select private.fresh_start('r2-fresh-start');

drop table if exists public.attempts;

-- One row per exercise, across all readers, from the event log. Empty for anyone who is not an admin.
-- Only page entries with a ref of the form chapter/exercise count (chapter ids include interlude and
-- pk-*); a learner of an exercise has checked it at least once, and one reader counts for at most
-- 100 exercises in a chapter.
create or replace function public.exercise_stats()
returns table (
  chapter text, ex_key text, section text, inline boolean,
  learners bigint, checks bigint, solved bigint, first_try bigint,
  used_hint bigint, opened_solution bigint, avg_tries numeric
)
language sql stable security definer set search_path = ''
as $$
  with per as (
    select e.user_id, split_part(e.ref, '/', 1) as chapter, split_part(e.ref, '/', 2) as ex_key, e.ref,
           max(e.sec) as section,
           bool_or(e.src = 'in') as inline,
           count(*) filter (where e.k = 'c') as tries,
           bool_or(e.k = 'c' and e.ok = 1) as solved,
           bool_or(e.k = 'c' and e.ok = 1 and e.n = 1 and (e.f & 1) = 0 and e.r < 4) as first_try,
           max(e.r) as hints,
           bool_or(e.k = 'o' or (e.f & 1) = 1) as opened
    from public.events e
    where public.is_admin()
      and e.k not in ('a', 'z')
      and e.ref ~ '^[a-z0-9-]{1,40}/[a-z0-9-]{1,40}$'
    group by e.user_id, e.ref
  ), capped as (
    select p.*, row_number() over (partition by p.user_id, p.chapter order by p.ref) as rn
    from per p
    where p.tries >= 1
  )
  select c.chapter, c.ex_key, max(c.section), bool_or(c.inline),
         count(*), sum(c.tries)::bigint,
         count(*) filter (where c.solved),
         count(*) filter (where c.first_try),
         count(*) filter (where c.hints >= 1),
         count(*) filter (where c.opened),
         round(avg(c.tries), 2)
  from capped c
  where c.rn <= 100
  group by c.chapter, c.ex_key
  order by c.chapter, c.ex_key;
$$;

-- How many readers reached each chapter, and how recently (a check or an open in the last 7 days).
-- Empty for non-admins. The same rows and the same cap as exercise_stats().
create or replace function public.chapter_stats()
returns table (chapter text, learners bigint, checks bigint, active_7d bigint)
language sql stable security definer set search_path = ''
as $$
  with per as (
    select e.user_id, split_part(e.ref, '/', 1) as chapter, e.ref,
           count(*) filter (where e.k = 'c') as tries,
           max(e.t) as last_t
    from public.events e
    where public.is_admin()
      and e.k not in ('a', 'z')
      and e.ref ~ '^[a-z0-9-]{1,40}/[a-z0-9-]{1,40}$'
    group by e.user_id, e.ref
  ), capped as (
    select p.*, row_number() over (partition by p.user_id, p.chapter order by p.ref) as rn
    from per p
    where p.tries >= 1
  )
  select c.chapter,
         count(distinct c.user_id),
         sum(c.tries)::bigint,
         count(distinct c.user_id) filter (where c.last_t > floor(extract(epoch from pg_catalog.now()) / 60)::integer - 7 * 1440)
  from capped c
  where c.rn <= 100
  group by c.chapter
  order by c.chapter;
$$;
