-- CN-3 (docs/decisions/0016-mochi-in-your-ai.md): the connector's read function and the daily meter.
-- Adds public.connect_meter, private.connect_meter_tick and public.mcp_context, and replaces connect_redeem
-- and connect_refresh (the handler answers {"hint": "retry"}; a rotation is metered). Safe to run twice.
-- The kill switch: revoke execute on function public.mcp_context(text, boolean) from anon;

-- One row per account: the UTC day and how many tool calls and key rotations its connections have made
-- that day. Written only by private.connect_meter_tick; no policies.
create table if not exists public.connect_meter (
  user_id uuid primary key references auth.users (id) on delete cascade,
  day date not null default ((pg_catalog.now() at time zone 'UTC')::date),
  calls integer not null default 0,        -- tool calls
  refreshes integer not null default 0     -- key rotations
);
alter table public.connect_meter enable row level security;
revoke all on table public.connect_meter from anon, authenticated;

-- Counts one use against an account's daily cap. Adds the account's row if it has none, locks it, starts
-- the day over when the row is from an earlier UTC day, and then either refuses (at or over the cap:
-- false, nothing written) or adds one and answers true. p_which is 'calls' or 'refreshes'; anything else
-- is refused. Lock order: a caller that holds a grant row takes it before this row.
create or replace function private.connect_meter_tick(p_user uuid, p_which text, p_cap integer)
returns boolean
language plpgsql set search_path = ''
as $$
declare
  today date := (pg_catalog.now() at time zone 'UTC')::date;
  m public.connect_meter;
begin
  if p_user is null or p_cap is null or p_which is null or p_which not in ('calls', 'refreshes') then
    return false;
  end if;
  insert into public.connect_meter (user_id) values (p_user) on conflict do nothing;
  select * into m from public.connect_meter x where x.user_id = p_user for update;
  if m.day < today then
    m.day := today;
    m.calls := 0;
    m.refreshes := 0;
  end if;
  if p_which = 'calls' then
    if m.calls >= p_cap then
      return false;
    end if;
    m.calls := m.calls + 1;
  else
    if m.refreshes >= p_cap then
      return false;
    end if;
    m.refreshes := m.refreshes + 1;
  end if;
  update public.connect_meter x set day = m.day, calls = m.calls, refreshes = m.refreshes where x.user_id = p_user;
  return true;
end;
$$;

-- The worker's: exchange a code and its PKCE verifier for keys. Never raises. A code is consumed by its
-- first presentation whatever the outcome; presenting a used code again with its verifier, within 24
-- hours of its approval, ends the grant it made (the code alone, as a browser's history holds it, ends
-- nothing). The worker must never retry this call: a retry is a replay.
create or replace function public.connect_redeem(p_code text, p_verifier text, p_client_id text, p_redirect_uri text)
returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '2s'
as $$
declare
  refused constant jsonb := '{"hint": "refused"}'::jsonb;
  h text;
  uid uuid;
  tag text;
  c public.connect_codes;
  access_key text;
  refresh_key text;
  gid uuid;
begin
  if p_code is null or p_verifier is null or p_client_id is null or p_redirect_uri is null
     or pg_catalog.char_length(p_code) <> 64 or pg_catalog.char_length(p_verifier) not between 43 and 128
     or pg_catalog.char_length(p_client_id) not between 8 and 64 or pg_catalog.char_length(p_redirect_uri) > 200
     or p_code !~ '^[0-9a-f]{64}$' or p_verifier !~ '^[A-Za-z0-9._~-]{43,128}$' or p_client_id !~ '^[A-Za-z0-9_-]{8,64}$' then
    return refused;
  end if;
  h := private.connect_hash(p_code);
  select k.user_id into uid from public.connect_codes k where k.code_hash = h;
  if not found then
    return refused;
  end if;
  -- the user lock first, then the row: approve's housekeeping takes them in this order
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('connect:' || uid::text, 0));
  select * into c from public.connect_codes k where k.code_hash = h for update;
  if not found then
    return refused;
  end if;
  if c.used_at is not null then
    if c.grant_id is not null and c.created_at > pg_catalog.now() - interval '24 hours'
       and private.connect_s256(p_verifier) = c.challenge then
      update public.connect_grants g set revoked_at = pg_catalog.now() where g.id = c.grant_id and g.revoked_at is null;
    end if;
    return refused;
  end if;
  update public.connect_codes k set used_at = pg_catalog.now() where k.code_hash = h;
  if c.expires_at <= pg_catalog.now()
     or c.client_id <> p_client_id
     or c.redirect_uri <> p_redirect_uri
     or private.connect_s256(p_verifier) <> c.challenge
     or (select count(*) from public.connect_grants g where g.user_id = c.user_id and private.connect_live(g.revoked_at, g.last_used)) >= 5 then
    return refused;
  end if;
  access_key := private.connect_key();
  tag := pg_catalog.left(private.connect_key(), 32);
  refresh_key := tag || private.connect_key();
  insert into public.connect_grants (user_id, app, client_id, access_hash, access_expires, refresh_hash, refresh_tag_hash, salt)
  values (c.user_id, c.app, c.client_id, private.connect_hash(access_key), pg_catalog.now() + interval '1 hour', private.connect_hash(refresh_key),
          private.connect_hash(tag), private.connect_key())
  returning id into gid;
  update public.connect_codes k set grant_id = gid where k.code_hash = h;
  return pg_catalog.jsonb_build_object('access', access_key, 'refresh', refresh_key, 'expires_in', 3600);
exception when others then
  raise log 'connect_redeem: %', sqlstate;
  return '{"hint": "retry"}'::jsonb;
end;
$$;

-- The worker's: rotate a refresh key. Never raises. A refresh key is the grant's tag (32 hex digits, the
-- same for the life of the grant) followed by a secret that changes at every rotation. The next keys are
-- derived from the key presented and a salt chosen at that rotation and kept until the next, so the key
-- just replaced, presented again within 30 seconds (a retried request, two requests at once), gets the
-- same answer and writes nothing. Any other key that carries the tag is a spent one: presenting it ends
-- the grant. A salt lasts one rotation, so a copy of this table and an old key give nothing later.
create or replace function public.connect_refresh(p_key text, p_client_id text)
returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '2s'
as $$
declare
  refused constant jsonb := '{"hint": "refused"}'::jsonb;
  h text;
  tag text;
  s text;
  g public.connect_grants;
  access_key text;
  refresh_key text;
begin
  if p_key is null or p_client_id is null
     or pg_catalog.char_length(p_key) <> 96 or pg_catalog.char_length(p_client_id) not between 8 and 64
     or p_key !~ '^[0-9a-f]{96}$' or p_client_id !~ '^[A-Za-z0-9_-]{8,64}$' then
    return refused;
  end if;
  tag := pg_catalog.left(p_key, 32);
  h := private.connect_hash(p_key);
  select * into g from public.connect_grants x where x.refresh_tag_hash = private.connect_hash(tag) for update;
  if not found or g.revoked_at is not null then
    return refused;
  end if;
  if g.refresh_hash = h then
    if g.client_id <> p_client_id or not private.connect_live(g.revoked_at, g.last_used) then
      return refused;
    end if;
    if not private.connect_meter_tick(g.user_id, 'refreshes', 200) then
      return '{"hint": "limit"}'::jsonb;
    end if;
    s := private.connect_key();
    access_key := private.connect_next(p_key, s, 'a');
    refresh_key := tag || private.connect_next(p_key, s, 'r');
    update public.connect_grants x
       set prev_refresh_hash = x.refresh_hash, rotated_at = pg_catalog.now(), salt = s,
           access_hash = private.connect_hash(access_key), refresh_hash = private.connect_hash(refresh_key),
           access_expires = pg_catalog.now() + interval '1 hour', last_used = pg_catalog.now()
     where x.id = g.id;
    return pg_catalog.jsonb_build_object('access', access_key, 'refresh', refresh_key, 'expires_in', 3600);
  end if;
  if g.prev_refresh_hash = h and g.rotated_at > pg_catalog.now() - interval '30 seconds' then
    access_key := private.connect_next(p_key, g.salt, 'a');
    refresh_key := tag || private.connect_next(p_key, g.salt, 'r');
    if g.client_id <> p_client_id or not private.connect_live(g.revoked_at, g.last_used)
       or g.refresh_hash <> private.connect_hash(refresh_key) then
      return refused;
    end if;
    -- the answer the first call gave, derived again; nothing is written
    return pg_catalog.jsonb_build_object('access', access_key, 'refresh', refresh_key,
      'expires_in', least(3600, greatest(0, floor(extract(epoch from g.access_expires - pg_catalog.now()))))::integer);
  end if;
  -- the grant's tag with a secret that is neither current nor just replaced: a spent key
  update public.connect_grants x set revoked_at = pg_catalog.now() where x.id = g.id;
  return refused;
exception when others then
  raise log 'connect_refresh: %', sqlstate;
  return '{"hint": "retry"}'::jsonb;
end;
$$;

-- The worker's: the one function through which an AI app reads an account's progress. Never raises.
-- p_key is an access key. p_full null: check the key only (the protocol's own requests; not metered).
-- false: a tool call that needs no progress (metered). true: a tool call that reads progress (metered).
-- Answers {"hint": "refused"} (the key is not accepted), {"hint": "limit"} (a good key over the account's
-- 300 calls a day) or {"hint": "retry"} (a lock wait or deadlock; nothing was written), else
-- {"ok": true}, and for true also "last", "events" and "truncated". Only the account's own self learner
-- is read (its id is the account id): the grant's user_id, never a learner id from anywhere else. Nothing
-- else leaves: no name, no email, no pet, progress or game state. A use moves the grant's last_used
-- at most once an hour. Lock order: the grant row, then the meter row.
create or replace function public.mcp_context(p_key text, p_full boolean)
returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '2s'
as $$
declare
  refused constant jsonb := '{"hint": "refused"}'::jsonb;
  h text;
  g record;
  stored jsonb;
  last_out jsonb := null;
  sec text;
  ev jsonb;
  cut boolean;
begin
  if p_key is null or pg_catalog.char_length(p_key) <> 64 or p_key !~ '^[0-9a-f]{64}$' then
    return refused;
  end if;
  h := private.connect_hash(p_key);
  select x.id, x.user_id, x.access_expires, x.revoked_at, x.last_used into g
    from public.connect_grants x where x.access_hash = h;
  if not found or not private.connect_live(g.revoked_at, g.last_used) or g.access_expires <= pg_catalog.now() then
    return refused;
  end if;
  if g.last_used < pg_catalog.now() - interval '1 hour' then
    -- the row is checked again as it is written: a key rotated or revoked since the lookup is refused
    update public.connect_grants x set last_used = pg_catalog.now()
     where x.id = g.id and x.access_hash = h and x.revoked_at is null;
    if not found then
      return refused;
    end if;
  end if;
  if p_full is null then
    return '{"ok": true}'::jsonb;
  end if;
  if not private.connect_meter_tick(g.user_id, 'calls', 300) then
    return '{"hint": "limit"}'::jsonb;
  end if;
  if not p_full then
    return '{"ok": true}'::jsonb;
  end if;
  select s.last into stored from public.user_state s where s.user_id = g.user_id;
  if coalesce(pg_catalog.jsonb_typeof(stored) = 'object', false)
     and coalesce(pg_catalog.jsonb_typeof(stored -> 'id') = 'string', false)
     and (stored ->> 'id') ~ '^[a-z0-9][a-z0-9-]{0,39}$' then
    sec := '';
    if coalesce(pg_catalog.jsonb_typeof(stored -> 'section') = 'string', false)
       and (stored ->> 'section') ~ '^[a-z0-9][a-z0-9-]{0,79}$' then
      sec := stored ->> 'section';
    end if;
    last_out := pg_catalog.jsonb_build_object('id', stored ->> 'id', 'section', sec);
  end if;
  select coalesce(pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_array(w.id, w.t, w.d, w.src, w.sec, w.ref, w.k, w.ok, w.n, w.r, w.f)
             || case when w.x is null then '[]'::jsonb else pg_catalog.jsonb_build_array(w.x) end
           order by w.seq), '[]'::jsonb)
    into ev
    from (select e.id, e.t, e.d, e.src, e.sec, e.ref, e.k, e.ok, e.n, e.r, e.f, e.x, e.seq
            from public.events e where e.user_id = g.user_id order by e.seq desc limit 6000) w;
  select (select pg_catalog.count(*) from (select 1 from public.events e where e.user_id = g.user_id limit 6001) c) > 6000 into cut;
  return pg_catalog.jsonb_build_object('ok', true, 'last', last_out, 'events', ev, 'truncated', cut);
exception when others then
  raise log 'mcp_context: %', sqlstate;
  return '{"hint": "retry"}'::jsonb;
end;
$$;

revoke all on function private.connect_meter_tick(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.connect_redeem(text, text, text, text), public.connect_refresh(text, text) from public, authenticated;
grant execute on function public.connect_redeem(text, text, text, text), public.connect_refresh(text, text) to anon;
revoke all on function public.mcp_context(text, boolean) from public, authenticated;
grant execute on function public.mcp_context(text, boolean) to anon;
