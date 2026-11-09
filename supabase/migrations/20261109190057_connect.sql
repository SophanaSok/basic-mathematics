-- Migration 20261109190057_connect: Mochi in your AI, card CN-2 (docs/decisions/0016-mochi-in-your-ai.md). Adds the two
-- connection tables and the functions that move a connection through approve, redeem, refresh and revoke.
-- Nothing deployed calls any of it yet, so it can be applied at any time and the live site is unaffected;
-- it adds tables and functions only (OPERATIONS.md, "The connections (CN-2)"). Same statements as the
-- end of schema.sql.

-- Mochi in your AI (docs/decisions/0016-mochi-in-your-ai.md, card CN-2): the connection state machine.
-- An AI app is never handed a Supabase credential. A signed-in reader approves (connect_approve), which
-- makes a one-use code; the site's worker redeems it with a PKCE verifier (connect_redeem) for an access
-- key and a refresh key, and rotates the refresh key (connect_refresh). Only the SHA-256 of a key or a
-- code is stored. The two worker-facing functions are granted to anon (the worker has no user identity;
-- the key is the credential), never raise, and answer every refusal with {"hint": "refused"}, so what a
-- refusal wrote (a code marked used, a grant ended) commits. The rest are for the signed-in reader.
-- Lock order everywhere: the per-user advisory lock first, then rows. Time is pg_catalog.now().
-- An access key or a code is 64 hex digits; a refresh key is 96 (connect_refresh says why).

-- One row per connection. No policies: only the connect_* functions touch it.
create table if not exists public.connect_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app text not null check (app in ('claude', 'chatgpt', 'local')),
  client_id text not null check (client_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  access_hash text not null unique check (access_hash ~ '^[0-9a-f]{64}$'),
  access_expires timestamptz not null,
  refresh_hash text not null unique check (refresh_hash ~ '^[0-9a-f]{64}$'),
  refresh_tag_hash text not null unique check (refresh_tag_hash ~ '^[0-9a-f]{64}$'),   -- of the tag every refresh key of this grant starts with
  salt text not null check (salt ~ '^[0-9a-f]{64}$'),                                    -- new at every rotation, never leaves the database: the current keys were derived with it
  prev_refresh_hash text check (prev_refresh_hash ~ '^[0-9a-f]{64}$'),   -- the refresh key just replaced ...
  rotated_at timestamptz,                                                -- ... and when
  created_at timestamptz not null default now(),
  last_used timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists connect_grants_user_idx on public.connect_grants (user_id);
alter table public.connect_grants enable row level security;
revoke all on table public.connect_grants from anon, authenticated;

-- One row per approval: a code that lives two minutes and is consumed by its first presentation.
create table if not exists public.connect_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  app text not null check (app in ('claude', 'chatgpt', 'local')),
  client_id text not null check (client_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  redirect_uri text not null check (char_length(redirect_uri) <= 200),
  challenge text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  grant_id uuid references public.connect_grants (id) on delete set null
);
create index if not exists connect_codes_user_idx on public.connect_codes (user_id, created_at);
alter table public.connect_codes enable row level security;
revoke all on table public.connect_codes from anon, authenticated;

-- The allow-list of places a code may be sent, and the only place it is written. Exact, case-sensitive
-- comparison; anything else (a trailing slash, query, fragment, user-info, other scheme or path, an IPv6
-- loopback, a missing port, a port with a leading zero or above 65535, over 200 characters) is null.
create or replace function private.connect_app(uri text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when uri is null or pg_catalog.char_length(uri) > 200 then null
    when uri in ('https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback') then 'claude'
    when uri = 'https://chatgpt.com/connector_platform_oauth_redirect' then 'chatgpt'
    when uri ~ '^http://(localhost|127\.0\.0\.1):[1-9][0-9]{0,4}/callback$'
         and substring(uri from '^http://[^:]+:([0-9]+)/callback$')::integer <= 65535 then 'local'
    else null
  end;
$$;

-- The PKCE S256 transform: base64url, no padding, of the SHA-256 of the verifier's bytes (RFC 7636).
create or replace function private.connect_s256(verifier text)
returns text
language sql immutable set search_path = ''
as $$
  select pg_catalog.rtrim(pg_catalog.translate(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(verifier, 'UTF8')), 'base64'), '+/', '-_'), '=');
$$;

-- A new key or code: 64 hex digits from two random UUIDs, as board_secret is made.
create or replace function private.connect_key()
returns text
language sql volatile set search_path = ''
as $$
  select pg_catalog.replace(pg_catalog.gen_random_uuid()::text || pg_catalog.gen_random_uuid()::text, '-', '');
$$;

-- The stored form of a key or code.
create or replace function private.connect_hash(k text)
returns text
language sql immutable set search_path = ''
as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(k, 'UTF8')), 'hex');
$$;

-- The key that follows k in a grant's chain: 'r' the next refresh secret, 'a' the access key that comes with it.
-- Without the grant's salt, which no key holder has, it cannot be computed outside the database.
create or replace function private.connect_next(k text, salt text, which text)
returns text
language sql immutable set search_path = ''
as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(k || ':' || salt || ':' || which, 'UTF8')), 'hex');
$$;

-- A grant is live when it is not revoked and was used within the last 90 days. Written once, used everywhere.
create or replace function private.connect_live(p_revoked timestamptz, p_last_used timestamptz)
returns boolean
language sql stable set search_path = ''
as $$
  select p_revoked is null and p_last_used > pg_catalog.now() - interval '90 days';
$$;

-- Approving: the signed-in reader, after a fresh first-factor sign-in, makes a one-use code for an app
-- that will redeem it. Returns the raw code; only its hash is stored. A refused call writes nothing.
create or replace function public.connect_approve(p_client_id text, p_redirect_uri text, p_challenge text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  code text;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if not private.fresh_auth() then
    raise exception 'stale sign-in';
  end if;
  if coalesce(p_client_id !~ '^[A-Za-z0-9_-]{8,64}$', true)
     or coalesce(p_challenge !~ '^[A-Za-z0-9_-]{43}$', true)
     or private.connect_app(p_redirect_uri) is null then
    raise exception 'bad request';
  end if;
  -- one account's approve and redeem calls run one at a time
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('connect:' || uid::text, 0));
  delete from public.connect_codes c where c.user_id = uid and c.created_at < pg_catalog.now() - interval '24 hours';
  delete from public.connect_grants g
   where g.user_id = uid
     and (g.revoked_at < pg_catalog.now() - interval '24 hours'
          or (g.revoked_at is null and g.last_used <= pg_catalog.now() - interval '90 days'));
  if (select count(*) from public.connect_codes c where c.user_id = uid and c.created_at >= pg_catalog.now() - interval '24 hours') >= 20 then
    raise exception 'too many approvals';
  end if;
  if (select count(*) from public.connect_grants g where g.user_id = uid and private.connect_live(g.revoked_at, g.last_used)) >= 5 then
    raise exception 'too many connections';
  end if;
  code := private.connect_key();
  insert into public.connect_codes (code_hash, user_id, app, client_id, redirect_uri, challenge, created_at, expires_at)
  values (private.connect_hash(code), uid, private.connect_app(p_redirect_uri), p_client_id, p_redirect_uri, p_challenge,
          pg_catalog.now(), pg_catalog.now() + interval '2 minutes');
  return code;
end;
$$;

-- The caller's live connections, newest first. Never a hash or a client id.
create or replace function public.connect_list()
returns table (id uuid, app text, created_at timestamptz, last_used timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  return query
    select g.id, g.app, g.created_at, g.last_used
      from public.connect_grants g
     where g.user_id = uid and private.connect_live(g.revoked_at, g.last_used)
     order by g.created_at desc, g.id;
end;
$$;

-- Ends one of the caller's live connections. No fresh sign-in is needed to revoke.
create or replace function public.connect_revoke(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  update public.connect_grants g set revoked_at = pg_catalog.now()
   where g.id = p_id and g.user_id = uid and private.connect_live(g.revoked_at, g.last_used);
  if not found then
    raise exception 'not your connection';
  end if;
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
  return refused;
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
  return refused;
end;
$$;

revoke all on function private.connect_app(text), private.connect_s256(text), private.connect_key(), private.connect_hash(text),
  private.connect_next(text, text, text), private.connect_live(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.connect_approve(text, text, text), public.connect_list(), public.connect_revoke(uuid) from public, anon;
grant execute on function public.connect_approve(text, text, text), public.connect_list(), public.connect_revoke(uuid) to authenticated;
revoke all on function public.connect_redeem(text, text, text, text), public.connect_refresh(text, text) from public, authenticated;
grant execute on function public.connect_redeem(text, text, text, text), public.connect_refresh(text, text) to anon;
