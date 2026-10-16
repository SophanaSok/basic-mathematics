-- pgTAP suite for the event log (supabase/migrations/*_events.sql). Run by tools/sql-test.js
-- (npm run test:sql) against a throwaway Postgres in Docker, after either the schema as it is on
-- main plus the new migrations (twice) or the working tree's schema.sql (twice), then
-- supabase/tests/prune_cases.sql (generated: do not edit it). The runner passes the path it took
-- and the migrations it applied as the settings bm.sql_path and bm.migrations.
-- The whole file is one transaction and rolls back.
--
-- To act as a signed-in user the suite switches role inside small helper functions (pg_temp.*)
-- and switches back before returning, so pgTAP itself always runs as the superuser. auth.uid()
-- in this image reads request.jwt.claim.sub; request.jwt.claims is set too, as newer images read it.
begin;

-- three readers: A (an admin), B, C
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'a@example.test'),
  ('b0000000-0000-4000-8000-00000000000b', 'b@example.test'),
  ('c0000000-0000-4000-8000-00000000000c', 'c@example.test'),
  ('d0000000-0000-4000-8000-00000000000d', 'd@example.test'),
  ('e0000000-0000-4000-8000-00000000000e', 'e@example.test');
insert into public.admins (user_id) values ('a0000000-0000-4000-8000-00000000000a');

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.put(uid uuid, batch jsonb, epoch integer) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.as_user(uid);
  r := public.events_put(batch, epoch);
  execute 'reset role';
  return r;
end $$;
create function pg_temp.sqlstate_as(uid uuid, stmt text) returns text language plpgsql as $$
declare st text := 'ok';
begin
  perform pg_temp.as_user(uid);
  begin
    execute stmt;
  exception when others then
    st := sqlstate;
  end;
  execute 'reset role';
  return st;
end $$;
create function pg_temp.count_as(uid uuid, stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform pg_temp.as_user(uid);
  execute stmt into n;
  execute 'reset role';
  return n;
end $$;
create function pg_temp.nowmin() returns integer language sql as $$ select floor(extract(epoch from now()) / 60)::integer $$;
/* one batch element: an id made from the seed, a page entry at minute t */
create function pg_temp.el(seed text, t integer, ref text default '', k text default 'c', ok integer default 1, x jsonb default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', 'dev' || substr(md5(seed), 1, 5) || '-' || substr(md5(seed || 'r'), 1, 8) || '-' || substr(md5(seed || 'h'), 1, 7),
    'p', jsonb_build_array(t, t / 1440, 'ex', '', ref, k, ok, 1, 0, 0) || case when x is null then '[]'::jsonb else jsonb_build_array(x) end)
$$;
create function pg_temp.prune_case(c integer) returns text[] language plpgsql as $$
declare uid uuid := gen_random_uuid(); got text[];
begin
  insert into auth.users (id, email) values (uid, 'prune' || c || '@example.test');
  insert into public.events (user_id, id, t, d, src, sec, ref, k, ok, n, r, f, x, seq)
    select uid, id, (p->>0)::integer, (p->>1)::integer, p->>2, p->>3, p->>4, p->>5,
           (p->>6)::smallint, (p->>7)::smallint, (p->>8)::smallint, (p->>9)::integer, p->10, row_number() over (order by id)
    from private.prune_cases where case_no = c;
  perform private.events_prune(uid);
  select array_agg(id order by id collate "C") into got from public.events where user_id = uid;
  delete from auth.users where id = uid;
  return got;
end $$;

/* the hand-written validity cases: a valid entry and a valid checkpoint, one rule broken at a time */
create function pg_temp.vb() returns jsonb language sql as $$
  select '{"id":"devabcde-12345678-abcdefg","p":[29900000,20763,"ex","ch02#a","ch02/e3","c",1,2,0,0]}'::jsonb $$;
create function pg_temp.vz() returns jsonb language sql as $$
  select '{"id":"00000000-12345678-abcdefg","p":[29936160,20789,"cp","ch02#a","","z",0,0,0,0,{"b":2,"l":20780,"s":20790,"n":10,"o":3}]}'::jsonb $$;
create function pg_temp.setp(e jsonb, i integer, v jsonb) returns jsonb language sql as $$
  select jsonb_set(e, array['p', i::text], v) $$;
create function pg_temp.setx(e jsonb, key text, v jsonb) returns jsonb language sql as $$
  select jsonb_set(e, array['p', '10', key], v) $$;
create function pg_temp.setid(e jsonb, id text) returns jsonb language sql as $$
  select jsonb_set(e, '{id}', to_jsonb(id)) $$;
create temp table hv (label text, e jsonb, expected boolean);
insert into hv values
  ('a valid entry', pg_temp.vb(), true),
  ('a valid checkpoint', pg_temp.vz(), true),
  ('a valid entry with an x', pg_temp.setp(pg_temp.vb(), 10, '{"a":[1,"b",null,true],"c":{"d":-5}}'), true),
  ('t below the minimum', pg_temp.setp(pg_temp.vb(), 0, '26999999'), false),
  ('t above the maximum', pg_temp.setp(pg_temp.vb(), 0, '60000001'), false),
  ('t at the minimum', pg_temp.setp(pg_temp.setp(pg_temp.vb(), 0, '27000000'), 1, '18750'), true),
  ('t at the maximum', pg_temp.setp(pg_temp.setp(pg_temp.vb(), 0, '60000000'), 1, '41666'), true),
  ('t a string', pg_temp.setp(pg_temp.vb(), 0, '"29900000"'), false),
  ('t fractional', pg_temp.setp(pg_temp.vb(), 0, '29900000.5'), false),
  ('t null', pg_temp.setp(pg_temp.vb(), 0, 'null'), false),
  ('d below the minimum', pg_temp.setp(pg_temp.setp(pg_temp.vb(), 0, '25919999'), 1, '17999'), false),
  ('d above the maximum', pg_temp.setp(pg_temp.vb(), 1, '42001'), false),
  ('d two days from t', pg_temp.setp(pg_temp.vb(), 1, '20765'), false),
  ('d one day before t', pg_temp.setp(pg_temp.vb(), 1, '20762'), true),
  ('d one day after t', pg_temp.setp(pg_temp.vb(), 1, '20764'), true),
  ('ok 2', pg_temp.setp(pg_temp.vb(), 6, '2'), false),
  ('ok -1', pg_temp.setp(pg_temp.vb(), 6, '-1'), false),
  ('ok 0', pg_temp.setp(pg_temp.vb(), 6, '0'), true),
  ('ok as the string "1"', pg_temp.setp(pg_temp.vb(), 6, '"1"'), false),
  ('ok 1.5', pg_temp.setp(pg_temp.vb(), 6, '1.5'), false),
  ('ok true', pg_temp.setp(pg_temp.vb(), 6, 'true'), false),
  ('ok -0 reads as 0, as in the browser', pg_temp.setp(pg_temp.vb(), 6, '-0'), true),
  ('n -1', pg_temp.setp(pg_temp.vb(), 7, '-1'), false),
  ('n 999', pg_temp.setp(pg_temp.vb(), 7, '999'), true),
  ('n 1000', pg_temp.setp(pg_temp.vb(), 7, '1000'), false),
  ('r -1', pg_temp.setp(pg_temp.vb(), 8, '-1'), false),
  ('r 9', pg_temp.setp(pg_temp.vb(), 8, '9'), true),
  ('r 10', pg_temp.setp(pg_temp.vb(), 8, '10'), false),
  ('f -1', pg_temp.setp(pg_temp.vb(), 9, '-1'), false),
  ('f 65535', pg_temp.setp(pg_temp.vb(), 9, '65535'), true),
  ('f 65536', pg_temp.setp(pg_temp.vb(), 9, '65536'), false),
  ('f 1e300', pg_temp.setp(pg_temp.vb(), 9, '1e300'), false),
  ('f a 40-digit integer', pg_temp.setp(pg_temp.vb(), 9, '1234567890123456789012345678901234567890'), false),
  ('9 elements', pg_temp.setp(pg_temp.vb(), 0, '1') #- '{p,9}', false),
  ('12 elements', jsonb_set(pg_temp.vb(), '{p}', (pg_temp.vb()->'p') || '[{"a":1},1]'::jsonb), false),
  ('p an object', jsonb_set(pg_temp.vb(), '{p}', '{"a":1}'), false),
  ('p null', jsonb_set(pg_temp.vb(), '{p}', 'null'), false),
  ('src empty', pg_temp.setp(pg_temp.vb(), 2, '""'), false),
  ('src of four letters', pg_temp.setp(pg_temp.vb(), 2, '"abcd"'), false),
  ('src upper case', pg_temp.setp(pg_temp.vb(), 2, '"EX"'), false),
  ('src a number', pg_temp.setp(pg_temp.vb(), 2, '5'), false),
  ('an unknown src is valid', pg_temp.setp(pg_temp.vb(), 2, '"zzz"'), true),
  ('sec of 91 characters', pg_temp.setp(pg_temp.vb(), 3, to_jsonb(repeat('a', 91))), false),
  ('sec of 90 characters', pg_temp.setp(pg_temp.vb(), 3, to_jsonb(repeat('a', 90))), true),
  ('sec upper case', pg_temp.setp(pg_temp.vb(), 3, '"Ch02"'), false),
  ('sec with a space', pg_temp.setp(pg_temp.vb(), 3, '"ch02 a"'), false),
  ('sec with an accent', pg_temp.setp(pg_temp.vb(), 3, '"ch02é"'), false),
  ('ref with a backslash', pg_temp.setp(pg_temp.vb(), 4, '"a\\b"'), false),
  ('ref empty', pg_temp.setp(pg_temp.vb(), 4, '""'), true),
  ('ref null', pg_temp.setp(pg_temp.vb(), 4, 'null'), false),
  ('k empty', pg_temp.setp(pg_temp.vb(), 5, '""'), false),
  ('k of two letters', pg_temp.setp(pg_temp.vb(), 5, '"ab"'), false),
  ('k upper case', pg_temp.setp(pg_temp.vb(), 5, '"C"'), false),
  ('an unknown k is valid', pg_temp.setp(pg_temp.vb(), 5, '"q"'), true),
  ('id with an upper-case letter', pg_temp.setid(pg_temp.vb(), 'Devabcde-12345678-abcdefg'), false),
  ('id too short', pg_temp.setid(pg_temp.vb(), 'devabcde-12345678-abcdef'), false),
  ('id too long', pg_temp.setid(pg_temp.vb(), 'devabcde-12345678-abcdefgh'), false),
  ('id a number', jsonb_set(pg_temp.vb(), '{id}', '5'), false),
  ('no id', pg_temp.vb() - 'id', false),
  ('an element that is an array', '[1,2]', false),
  ('an element that is a string', '"x"', false),
  ('a non-checkpoint with a checkpoint dev', pg_temp.setid(pg_temp.vb(), '00000000-12345678-abcdefg'), false),
  ('a checkpoint with another dev', pg_temp.setid(pg_temp.vz(), 'devabcde-12345678-abcdefg'), false),
  ('x an array', pg_temp.setp(pg_temp.vb(), 10, '[1]'), false),
  ('x a string', pg_temp.setp(pg_temp.vb(), 10, '"x"'), false),
  ('x null', pg_temp.setp(pg_temp.vb(), 10, 'null'), false),
  ('x with a backslash', pg_temp.setp(pg_temp.vb(), 10, '{"a":"b\\c"}'), false),
  ('x with a quote in a string', pg_temp.setp(pg_temp.vb(), 10, '{"a":"b\"c"}'), false),
  ('x with a non-ASCII letter', pg_temp.setp(pg_temp.vb(), 10, '{"a":"é"}'), false),
  ('x with a non-ASCII key', pg_temp.setp(pg_temp.vb(), 10, '{"é":1}'), false),
  ('x with 1e300', pg_temp.setp(pg_temp.vb(), 10, '{"a":1e300}'), false),
  ('x with 1.5', pg_temp.setp(pg_temp.vb(), 10, '{"a":1.5}'), false),
  ('x with 1e12', pg_temp.setp(pg_temp.vb(), 10, '{"a":1000000000000}'), true),
  ('x with 1e12 + 1', pg_temp.setp(pg_temp.vb(), 10, '{"a":1000000000001}'), false),
  ('x with -1e12 - 1', pg_temp.setp(pg_temp.vb(), 10, '{"a":-1000000000001}'), false),
  ('x nested 4 deep', pg_temp.setp(pg_temp.vb(), 10, '{"a":{"b":{"c":{}}}}'), true),
  ('x nested 5 deep', pg_temp.setp(pg_temp.vb(), 10, '{"a":{"b":{"c":{"d":1}}}}'), false),
  ('x with arrays nested 5 deep', pg_temp.setp(pg_temp.vb(), 10, '{"a":[[[[]]]]}'), false),
  ('x of over 400 characters', pg_temp.setp(pg_temp.vb(), 10, jsonb_build_object('s', repeat('x', 450))), false),
  ('a checkpoint with 10 elements', jsonb_set(pg_temp.vz(), '{p}', (pg_temp.vz()->'p') #- '{10}'), false),
  ('a checkpoint with src ex', pg_temp.setp(pg_temp.vz(), 2, '"ex"'), false),
  ('a checkpoint with an empty sec', pg_temp.setp(pg_temp.vz(), 3, '""'), false),
  ('a checkpoint with b 5', pg_temp.setx(pg_temp.vz(), 'b', '5'), false),
  ('a checkpoint with b 4', pg_temp.setx(pg_temp.vz(), 'b', '4'), true),
  ('a checkpoint with b a string', pg_temp.setx(pg_temp.vz(), 'b', '"2"'), false),
  ('a checkpoint with no b', jsonb_set(pg_temp.vz(), '{p,10}', (pg_temp.vz()->'p'->10) - 'b'), false),
  ('a checkpoint with l = s', pg_temp.setx(pg_temp.vz(), 'l', '20790'), false),
  ('a checkpoint with l = s - 1', pg_temp.setx(pg_temp.vz(), 'l', '20789'), true),
  ('a checkpoint with l below the minimum', pg_temp.setx(pg_temp.vz(), 'l', '17999'), false),
  ('a checkpoint with o above n', pg_temp.setx(pg_temp.vz(), 'o', '11'), false),
  ('a checkpoint with n 1000001', pg_temp.setx(pg_temp.setx(pg_temp.vz(), 'n', '1000001'), 'o', '0'), false),
  ('a checkpoint with n 1000000', pg_temp.setx(pg_temp.setx(pg_temp.vz(), 'n', '1000000'), 'o', '0'), true),
  ('a checkpoint with d not s - 1', pg_temp.setp(pg_temp.vz(), 1, '20788'), false),
  ('a checkpoint with t not d * 1440', pg_temp.setp(pg_temp.vz(), 0, '29936161'), false),
  ('a checkpoint with s = today + 2', pg_temp.setp(pg_temp.setp(pg_temp.setx(pg_temp.setx(pg_temp.vz(), 's', '20802'), 'l', '20790'), 1, '20801'), 0, '29953440'), true),
  ('a checkpoint with s = today + 3', pg_temp.setp(pg_temp.setp(pg_temp.setx(pg_temp.setx(pg_temp.vz(), 's', '20803'), 'l', '20790'), 1, '20802'), 0, '29954880'), false);

-- 237 hand-counted tests below, plus one per row of the three tables
select plan(237 + (select count(*)::integer from hv) + (select count(*)::integer from private.valid_cases)
  + (select count(*)::integer from private.prune_expected));

-- 1. tables, row-level security, policies, grants
select has_table('public', 'events', 'public.events exists');
select has_table('public', 'event_meta', 'public.event_meta exists');
select is((select relrowsecurity from pg_class where oid = 'public.events'::regclass), true, 'events has row-level security on');
select is((select relrowsecurity from pg_class where oid = 'public.event_meta'::regclass), true, 'event_meta has row-level security on');
select is(
  (select string_agg(policyname::text || ' / ' || cmd::text || ' / ' || roles::text, '; ') from pg_policies where schemaname = 'public' and tablename = 'events'),
  'read own events / SELECT / {authenticated}',
  'events has exactly one policy: read own events, select, authenticated');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'event_meta'), 0::bigint, 'event_meta has no policy');
select is(
  (select string_agg(table_name::text || ' / ' || grantee::text || ' / ' || privilege_type::text, '; ' order by table_name::text, grantee::text, privilege_type::text)
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('events', 'event_meta') and grantee in ('anon', 'authenticated')),
  'events / authenticated / SELECT',
  'the only grant to anon or authenticated on the two tables is select on events');
select is((select count(*) from pg_indexes where schemaname = 'public' and indexname = 'events_seq_idx' and indexdef like 'CREATE UNIQUE%'), 1::bigint, 'events_seq_idx is unique');

-- 2. definer settings and privileges
select is((select prosecdef from pg_proc where oid = 'public.events_put(jsonb, integer, uuid)'::regprocedure), true, 'events_put is security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'public.events_put(jsonb, integer, uuid)'::regprocedure), 'events_put pins search_path');
select is((select prosecdef from pg_proc where oid = 'public.events_usage()'::regprocedure), true, 'events_usage is security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'public.events_usage()'::regprocedure), 'events_usage pins search_path');
select is((select prosecdef from pg_proc where oid = 'private.events_on_reset()'::regprocedure), true, 'events_on_reset is security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'private.events_on_reset()'::regprocedure), 'events_on_reset pins search_path');
select is((select prosecdef from pg_proc where oid = 'private.events_prune(uuid)'::regprocedure), true, 'events_prune is security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'private.events_prune(uuid)'::regprocedure), 'events_prune pins search_path');
select is((select prosecdef from pg_proc where oid = 'private.events_valid(jsonb, integer)'::regprocedure), true, 'events_valid is security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'private.events_valid(jsonb, integer)'::regprocedure), 'events_valid pins search_path');
select is((select prosecdef from pg_proc where oid = 'private.events_ceiling()'::regprocedure), false, 'events_ceiling is a plain function');
select is(has_function_privilege('authenticated', 'private.events_prune(uuid)', 'execute'), false, 'authenticated cannot run events_prune');
select is(has_function_privilege('authenticated', 'private.events_valid(jsonb, integer)', 'execute'), false, 'authenticated cannot run events_valid');
select is(has_function_privilege('authenticated', 'private.events_on_reset()', 'execute'), false, 'authenticated cannot run events_on_reset');
select is(has_function_privilege('authenticated', 'private.events_ceiling()', 'execute'), false, 'authenticated cannot run events_ceiling');
select is(has_schema_privilege('authenticated', 'private', 'usage'), false, 'authenticated has no usage on schema private');
select is(has_function_privilege('anon', 'public.events_put(jsonb, integer, uuid)', 'execute'), false, 'anon cannot run events_put');
select is(has_function_privilege('authenticated', 'public.events_put(jsonb, integer, uuid)', 'execute'), true, 'authenticated can run events_put');
select is(has_function_privilege('anon', 'public.events_usage()', 'execute'), false, 'anon cannot run events_usage');
select is(has_function_privilege('authenticated', 'public.events_usage()', 'execute'), true, 'authenticated can run events_usage');

-- 3. a reader sees only their own rows, and writes only through events_put
select is(
  pg_temp.put('a0000000-0000-4000-8000-00000000000a',
    jsonb_build_array(pg_temp.el('a1', pg_temp.nowmin() - 300, 'ch02/e1'), pg_temp.el('a2', pg_temp.nowmin() - 200, 'ch02/e2'),
                      pg_temp.el('a3', pg_temp.nowmin() - 100, 'ch02/e3', 'c', 1, '{"a":1}')), 0),
  '{"added":3,"refused":[],"seq":3,"epoch":0}'::jsonb,
  'A: events_put of three valid entries adds three, seq 3');
select is(pg_temp.count_as('b0000000-0000-4000-8000-00000000000b', 'select count(*) from public.events'), 0::bigint, 'B sees no events');
select is(pg_temp.count_as('b0000000-0000-4000-8000-00000000000b', $$select count(*) from public.events where user_id = 'a0000000-0000-4000-8000-00000000000a'$$), 0::bigint, 'B sees none of A''s events when asking for them');
select is(pg_temp.count_as('a0000000-0000-4000-8000-00000000000a', 'select count(*) from public.events'), 3::bigint, 'A sees their three events');
select is((select x from public.events where id = pg_temp.el('a3', 0)->>'id'), '{"a":1}'::jsonb, 'the 11th element is stored as x');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$insert into public.events (user_id, id, t, d, src, sec, ref, k, ok, n, r, f, seq) values ('b0000000-0000-4000-8000-00000000000b', 'devabcde-12345678-abcdefg', 29900000, 20763, 'ex', '', '', 'c', 1, 0, 0, 0, 1)$$), '42501', 'B cannot insert into events');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$update public.events set n = 5$$), '42501', 'B cannot update events');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$delete from public.events$$), '42501', 'B cannot delete from events');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$select * from public.event_meta$$), '42501', 'B cannot select from event_meta');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$insert into public.event_meta (user_id) values ('b0000000-0000-4000-8000-00000000000b')$$), '42501', 'B cannot insert into event_meta');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$update public.event_meta set seq = 0$$), '42501', 'B cannot update event_meta');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$delete from public.event_meta$$), '42501', 'B cannot delete from event_meta');
select throws_ok($$ select pg_temp.put(null, '[]', 0) $$, 'P0001', 'not signed in', 'events_put raises when nobody is signed in');

-- 4. events_valid: the rules one at a time, then the cases generated from the browser's isValid
select is(private.events_valid(e, 20800), expected, 'valid: ' || label) from hv;
select is(private.events_valid(e, today), expected, 'valid case ' || case_no) from private.valid_cases order by case_no;

-- 5. duplicates
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(pg_temp.el('b1', pg_temp.nowmin() - 30, 'r1'), pg_temp.el('b2', pg_temp.nowmin() - 20, 'r2'), pg_temp.el('b3', pg_temp.nowmin() - 10, 'r3')), 0),
  '{"added":3,"refused":[],"seq":3,"epoch":0}'::jsonb, 'B: three entries are added');
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(pg_temp.el('b1', pg_temp.nowmin() - 30, 'r1'), pg_temp.el('b2', pg_temp.nowmin() - 20, 'r2'), pg_temp.el('b3', pg_temp.nowmin() - 10, 'r3')), 0),
  '{"added":0,"refused":[],"seq":3,"epoch":0}'::jsonb, 'B: the same batch again adds none and seq stays');
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(pg_temp.el('b4', pg_temp.nowmin() - 5, 'r4'), pg_temp.el('b4', pg_temp.nowmin() - 5, 'r4', 'c', 0)), 0),
  '{"added":1,"refused":[],"seq":4,"epoch":0}'::jsonb, 'B: one id twice in a batch adds one and does not raise');

-- 6. quotas and ceilings
update public.event_meta set day_n = 2997 where user_id = 'b0000000-0000-4000-8000-00000000000b';
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(pg_temp.el('q1', pg_temp.nowmin() - 90, 'q1'), pg_temp.el('q2', pg_temp.nowmin() - 90, 'q2'), pg_temp.el('q3', pg_temp.nowmin() - 90, 'q3')), 0)->>'added', '3', 'B: 2997 + 3 new entries reaches 3000 and is allowed');
update public.event_meta set day_n = 2998 where user_id = 'b0000000-0000-4000-8000-00000000000b';
create temp table before_quota as select (select count(*) from public.events where user_id = 'b0000000-0000-4000-8000-00000000000b') as n, m.seq, m.day_calls from public.event_meta m where m.user_id = 'b0000000-0000-4000-8000-00000000000b';
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(pg_temp.el('q4', pg_temp.nowmin() - 80, 'q4'), pg_temp.el('q5', pg_temp.nowmin() - 80, 'q5'), pg_temp.el('q6', pg_temp.nowmin() - 80, 'q6')), 0),
  '{"hint":"bm-quota","refused":[]}'::jsonb, 'B: 2998 + 3 new entries is over the day''s quota');
select is((select count(*) from public.events where user_id = 'b0000000-0000-4000-8000-00000000000b'), (select n from before_quota), 'a refused batch inserts nothing');
select is((select row(m.seq, m.day_n, m.day_calls)::text from public.event_meta m where m.user_id = 'b0000000-0000-4000-8000-00000000000b'),
  (select row(seq, 2998, day_calls + 1)::text from before_quota), 'a refused batch changes only day_calls');
update public.event_meta set day_calls = 2000 where user_id = 'b0000000-0000-4000-8000-00000000000b';
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', '[]', 0), '{"hint":"bm-calls"}'::jsonb, 'B: the 2001st call of a day is refused');
update public.event_meta set day_n = 0, day_calls = 0 where user_id = 'b0000000-0000-4000-8000-00000000000b';
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', (select jsonb_agg(g) from generate_series(1, 501) g), 0), '{"hint":"bm-batch"}'::jsonb, 'B: 501 elements are refused');
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', '{"a":1}', 0), '{"hint":"bm-batch"}'::jsonb, 'B: a batch that is not an array is refused');
create or replace function private.events_ceiling() returns bigint language sql immutable as 'select 1::bigint';
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(pg_temp.el('f1', pg_temp.nowmin() - 70, 'f1')), 0), '{"hint":"bm-full"}'::jsonb, 'B: a table over its ceiling refuses new entries');
create or replace function private.events_ceiling() returns bigint language sql immutable as 'select 314572800::bigint';
select is(private.events_ceiling(), 314572800::bigint, 'the ceiling is back at 300 MB');
insert into public.event_meta (user_id, seq) values ('c0000000-0000-4000-8000-00000000000c', 25000);
insert into public.events (user_id, id, t, d, src, sec, ref, k, ok, n, r, f, seq)
  select 'c0000000-0000-4000-8000-00000000000c', substr(md5(g::text), 1, 8) || '-' || substr(md5(g::text || 'x'), 1, 8) || '-' || substr(md5(g::text || 'y'), 1, 7),
         29900000, 20763, 'ex', '', 'r' || g, 'c', 1, 0, 0, 0, g
  from generate_series(1, 25000) g;
select is(pg_temp.put('c0000000-0000-4000-8000-00000000000c', jsonb_build_array(pg_temp.el('z1', pg_temp.nowmin() - 60, 'z1')), 0), '{"hint":"bm-full"}'::jsonb, 'C: at 25000 rows a new entry is refused');

-- 7. epoch
select is(pg_temp.put('a0000000-0000-4000-8000-00000000000a', '[]', 0), '{"epoch":0,"seq":3}'::jsonb, 'A: the handshake returns epoch and seq');
select is(pg_temp.put('a0000000-0000-4000-8000-00000000000a', jsonb_build_array(pg_temp.el('e1', pg_temp.nowmin() - 50, 'e1')), 1), '{"hint":"bm-reset","epoch":0}'::jsonb, 'A: a batch with another epoch is told bm-reset');

-- 10. seq rises with the batch's own order of t, then continues
select is(pg_temp.put('a0000000-0000-4000-8000-00000000000a', jsonb_build_array(pg_temp.el('s2', pg_temp.nowmin() - 40, 's2'), pg_temp.el('s1', pg_temp.nowmin() - 45, 's1')), 0),
  '{"added":2,"refused":[],"seq":5,"epoch":0}'::jsonb, 'A: a second batch of two takes seq 4 and 5');
select is((select array_agg(seq order by seq) from public.events where user_id = 'a0000000-0000-4000-8000-00000000000a'), array[1, 2, 3, 4, 5]::bigint[], 'A: seq is 1 to 5 without a gap');
select is((select seq from public.events where id = pg_temp.el('s1', 0)->>'id'), 4::bigint, 'within a batch the earlier t takes the lower seq');

-- 8. future
select is(pg_temp.put('a0000000-0000-4000-8000-00000000000a', jsonb_build_array(pg_temp.el('fu', pg_temp.nowmin() + 1441, 'fu')), 0),
  jsonb_build_object('added', 0, 'refused', jsonb_build_array(jsonb_build_object('id', pg_temp.el('fu', 0)->>'id', 'why', 'future')), 'seq', 5, 'epoch', 0), 'A: an entry more than a day ahead is refused as future');
select is(pg_temp.put('a0000000-0000-4000-8000-00000000000a', jsonb_build_array(pg_temp.el('fv', pg_temp.nowmin() + 1439, 'fv')), 0),
  '{"added":1,"refused":[],"seq":6,"epoch":0}'::jsonb, 'A: an entry just under a day ahead is added');

-- 11. rd
select is((select count(*) from public.events where user_id = 'a0000000-0000-4000-8000-00000000000a' and rd <> current_date - date '1970-01-01'), 0::bigint, 'rd is today''s day number on every row');
select is(pg_temp.put('a0000000-0000-4000-8000-00000000000a', jsonb_build_array(pg_temp.el('rd', pg_temp.nowmin() - 12, 'rd') || '{"rd":5}'::jsonb), 0)->>'added', '1', 'A: an element with an rd field is added');
select is((select rd from public.events where id = pg_temp.el('rd', 0)->>'id'), current_date - date '1970-01-01', 'an rd field in the element is ignored');

-- junk: no case reaches bm-error
select is(pg_temp.put('a0000000-0000-4000-8000-00000000000a',
  jsonb_build_array(null, 5, 'x', '[]'::jsonb, '{}'::jsonb, '{"id":"short"}'::jsonb, '{"id":5,"p":5}'::jsonb, '{"id":null}'::jsonb,
    jsonb_set(pg_temp.vb(), '{p,9}', '1e300'), jsonb_set(pg_temp.vb(), '{p,7}', '12345678901234567890123')), 0)->'refused',
  '[{"id":null,"why":"invalid"},{"id":null,"why":"invalid"},{"id":null,"why":"invalid"},{"id":null,"why":"invalid"},{"id":null,"why":"invalid"},{"id":"short","why":"invalid"},{"id":"5","why":"invalid"},{"id":null,"why":"invalid"},{"id":"devabcde-12345678-abcdefg","why":"invalid"},{"id":"devabcde-12345678-abcdefg","why":"invalid"}]'::jsonb,
  'A: junk elements are refused as invalid and none raises or reaches bm-error');
select is(pg_temp.put('a0000000-0000-4000-8000-00000000000a', '[]', 0)->>'hint', null, 'A: still no hint after the junk');

-- 9. a reset, as the signed-in reader, starts the log over
select is(pg_temp.sqlstate_as('a0000000-0000-4000-8000-00000000000a', $$insert into public.user_state (user_id, reset_at) values ('a0000000-0000-4000-8000-00000000000a', 1)$$), 'ok', 'A: inserting user_state with reset_at 1 works under A''s own policy');
select is((select count(*) from public.events where user_id = 'a0000000-0000-4000-8000-00000000000a'), 0::bigint, 'the reset deleted A''s events');
select is((select epoch from public.event_meta where user_id = 'a0000000-0000-4000-8000-00000000000a'), 1, 'the reset moved A''s epoch to 1');
select is(pg_temp.sqlstate_as('a0000000-0000-4000-8000-00000000000a', $$update public.user_state set reset_at = 2 where user_id = 'a0000000-0000-4000-8000-00000000000a'$$), 'ok', 'A: a larger reset_at is accepted');
select is((select epoch from public.event_meta where user_id = 'a0000000-0000-4000-8000-00000000000a'), 2, 'a larger reset_at moved the epoch to 2');
select is(pg_temp.put('a0000000-0000-4000-8000-00000000000a', jsonb_build_array(pg_temp.el('n1', pg_temp.nowmin() - 5, 'n1')), 0), '{"hint":"bm-reset","epoch":2}'::jsonb, 'A: a device on the old epoch is told bm-reset');
select is(pg_temp.put('a0000000-0000-4000-8000-00000000000a', jsonb_build_array(pg_temp.el('n1', pg_temp.nowmin() - 5, 'n1')), 2)->>'added', '1', 'A: a device on the new epoch writes into the new log');
select is(pg_temp.sqlstate_as('a0000000-0000-4000-8000-00000000000a', $$update public.user_state set reset_at = 2, progress = '{"x":1}' where user_id = 'a0000000-0000-4000-8000-00000000000a'$$), 'ok', 'A: an update that keeps reset_at works');
select is(pg_temp.sqlstate_as('a0000000-0000-4000-8000-00000000000a', $$update public.user_state set reset_at = 1 where user_id = 'a0000000-0000-4000-8000-00000000000a'$$), 'ok', 'A: an update that lowers reset_at works');
select is((select epoch from public.event_meta where user_id = 'a0000000-0000-4000-8000-00000000000a'), 2, 'an update that does not raise reset_at leaves the epoch');
select is((select count(*) from public.events where user_id = 'a0000000-0000-4000-8000-00000000000a'), 1::bigint, 'an update that does not raise reset_at leaves the events');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$insert into public.user_state (user_id) values ('b0000000-0000-4000-8000-00000000000b')$$), 'ok', 'B: inserting user_state with reset_at 0 works');
select is((select epoch from public.event_meta where user_id = 'b0000000-0000-4000-8000-00000000000b'), 0, 'reset_at 0 leaves B''s epoch');
select is((select count(*) from pg_trigger where tgrelid = 'public.user_state'::regclass and tgname like 'events_on_reset%' and not tgisinternal), 2::bigint, 'user_state has the two reset triggers');


-- 15. more of events_put, as reader E (D has no event_meta row)
-- a reset of a reader whose log never existed on the server is not a reset of it
insert into public.user_state (user_id, reset_at) values ('d0000000-0000-4000-8000-00000000000d', 5);
select is((select count(*) from public.event_meta where user_id = 'd0000000-0000-4000-8000-00000000000d'), 0::bigint, 'a first user_state with reset_at > 0 leaves no event_meta row');

-- v: 1 to 99 as a number is kept, anything else falls back to 1
select is(pg_temp.put('e0000000-0000-4000-8000-00000000000e', jsonb_build_array(
    pg_temp.el('v1', pg_temp.nowmin() - 700, 'v1') || '{"v":100}', pg_temp.el('v2', pg_temp.nowmin() - 699, 'v2') || '{"v":0}',
    pg_temp.el('v3', pg_temp.nowmin() - 698, 'v3') || '{"v":"5"}', pg_temp.el('v4', pg_temp.nowmin() - 697, 'v4') || '{"v":5.5}',
    pg_temp.el('v5', pg_temp.nowmin() - 696, 'v5') || '{"v":-3}', pg_temp.el('v6', pg_temp.nowmin() - 695, 'v6') || '{"v":1e2}',
    pg_temp.el('v7', pg_temp.nowmin() - 694, 'v7') || '{"v":null}', pg_temp.el('v8', pg_temp.nowmin() - 693, 'v8') || '{"v":7}',
    pg_temp.el('v9', pg_temp.nowmin() - 692, 'v9') || '{"v":99}'), 0)->>'added', '9', 'E: nine entries with a v of every kind are added');
select is((select array_agg(v order by t) from public.events where user_id = 'e0000000-0000-4000-8000-00000000000e' and ref ~ '^v[0-9]$'), array[1, 1, 1, 1, 1, 1, 1, 7, 99]::smallint[], 'v outside 1..99 or not an integer number falls back to 1; 7 and 99 are kept');

-- the day rolls over: a new UTC day starts the counters again
update public.event_meta set day = ((now() at time zone 'UTC')::date) - 1, day_n = 5, day_calls = 7 where user_id = 'e0000000-0000-4000-8000-00000000000e';
do $$ begin perform pg_temp.put('e0000000-0000-4000-8000-00000000000e', '[]', 0); end $$;
select is((select row(m.day = (now() at time zone 'UTC')::date, m.day_n, m.day_calls)::text from public.event_meta m where m.user_id = 'e0000000-0000-4000-8000-00000000000e'), '(t,0,1)', 'a put on a new day resets day_n and day_calls, then counts the call');

-- a refusal still counts as a call
create temp table dc as select day_calls as n from public.event_meta where user_id = 'e0000000-0000-4000-8000-00000000000e';
do $$ begin perform pg_temp.put('e0000000-0000-4000-8000-00000000000e', '{"a":1}', 0); end $$;
select is((select day_calls from public.event_meta where user_id = 'e0000000-0000-4000-8000-00000000000e'), (select n + 1 from dc), 'a bm-batch refusal counts as a call');
do $$ begin perform pg_temp.put('e0000000-0000-4000-8000-00000000000e', jsonb_build_array(pg_temp.el('rf', pg_temp.nowmin() - 5, 'rf')), 9); end $$;
select is((select day_calls from public.event_meta where user_id = 'e0000000-0000-4000-8000-00000000000e'), (select n + 2 from dc), 'a bm-reset refusal counts as a call');

-- held, future, invalid and new together: invalid is judged before future
select is(pg_temp.put('e0000000-0000-4000-8000-00000000000e', jsonb_build_array(
    pg_temp.el('v1', pg_temp.nowmin() - 700, 'v1'),
    pg_temp.el('mf', pg_temp.nowmin() + 1441, 'mf'),
    jsonb_set(pg_temp.el('mi', pg_temp.nowmin() + 5000, 'mi'), '{p,7}', '1000'),
    pg_temp.el('mn', pg_temp.nowmin() - 4, 'mn')), 0),
  jsonb_build_object('added', 1, 'refused', jsonb_build_array(
      jsonb_build_object('id', pg_temp.el('mf', 0)->>'id', 'why', 'future'),
      jsonb_build_object('id', pg_temp.el('mi', 0)->>'id', 'why', 'invalid')),
    'seq', 10, 'epoch', 0),
  'E: a held entry adds nothing, a future one is future, an invalid and future one is invalid, a new one is added');

-- prune runs inside events_put: a ninth page entry for one ref is dropped
select is(pg_temp.put('e0000000-0000-4000-8000-00000000000e', (select jsonb_agg(pg_temp.el('pp' || g, pg_temp.nowmin() - 600 + g, 'pp', 'h')) from generate_series(1, 9) g), 0)->>'added', '9', 'E: nine page entries for one ref are added');
select is((select count(*) from public.events where user_id = 'e0000000-0000-4000-8000-00000000000e' and ref = 'pp'), 8::bigint, 'and only the first eight stay');

-- the server's day is the UTC day whatever the session's time zone
update public.event_meta set day = ((now() at time zone 'UTC')::date) - 1 where user_id = 'e0000000-0000-4000-8000-00000000000e';
set local timezone = 'Etc/GMT+12';
select is(pg_temp.put('e0000000-0000-4000-8000-00000000000e', jsonb_build_array(pg_temp.el('tz1', pg_temp.nowmin() - 3, 'tz1')), 0)->>'added', '1', 'E: a put under UTC-12 adds the entry');
select is((select rd from public.events where id = pg_temp.el('tz1', 0)->>'id'), ((now() at time zone 'UTC')::date) - date '1970-01-01', 'under UTC-12 rd is the UTC day');
select is((select day from public.event_meta where user_id = 'e0000000-0000-4000-8000-00000000000e'), (now() at time zone 'UTC')::date, 'under UTC-12 event_meta.day is the UTC day');
update public.event_meta set day = ((now() at time zone 'UTC')::date) - 1 where user_id = 'e0000000-0000-4000-8000-00000000000e';
set local timezone = 'Etc/GMT-12';
select is(pg_temp.put('e0000000-0000-4000-8000-00000000000e', jsonb_build_array(pg_temp.el('tz2', pg_temp.nowmin() - 2, 'tz2')), 0)->>'added', '1', 'E: a put under UTC+12 adds the entry');
select is((select rd from public.events where id = pg_temp.el('tz2', 0)->>'id'), ((now() at time zone 'UTC')::date) - date '1970-01-01', 'under UTC+12 rd is the UTC day');
select is((select day from public.event_meta where user_id = 'e0000000-0000-4000-8000-00000000000e'), (now() at time zone 'UTC')::date, 'under UTC+12 event_meta.day is the UTC day');
reset timezone;

-- numerals that print as 100 KB: refused as invalid without being printed, and fast
create temp table t0 as select clock_timestamp() as t;
create temp table hugeres as select pg_temp.put('e0000000-0000-4000-8000-00000000000e', (
  select jsonb_agg(jsonb_build_object('id', 'dev' || substr(md5(g::text), 1, 5) || '-' || substr(md5(g::text || 'r'), 1, 8) || '-' || substr(md5(g::text || 'h'), 1, 7),
                                      'p', jsonb_build_array('1e99999'::jsonb, 20763, 'ex', '', '', 'c', 1, 1, 0, 0))) from generate_series(1, 500) g), 0) as r;
create temp table t1 as select clock_timestamp() as t;
select is(jsonb_array_length((select r->'refused' from hugeres)), 500, '500 elements of 1e99999 are all refused');
select is((select count(*) from hugeres, jsonb_array_elements(r->'refused') e where e->>'why' = 'invalid'), 500::bigint, 'every one is invalid');
select ok((select t from t1) - (select t from t0) < interval '1 second', '500 elements of 1e99999 take under a second');
create temp table t2 as select clock_timestamp() as t;
create temp table hugex as select pg_temp.put('e0000000-0000-4000-8000-00000000000e', jsonb_build_array(
  pg_temp.el('hx', pg_temp.nowmin() - 9, 'hx', 'c', 1, (select jsonb_object_agg('k' || g, '1e99999'::jsonb) || '{"s":1e-9000}'::jsonb from generate_series(1, 15) g))), 0) as r;
create temp table t3 as select clock_timestamp() as t;
select is((select r->'refused'->0->>'why' from hugex), 'invalid', 'an x holding 15 numerals of 1e99999 makes the entry invalid');
select ok((select t from t3) - (select t from t2) < interval '1 second', 'and it takes under a second');

-- 12. prune parity with the browser's prune()
select is(pg_temp.prune_case(case_no), ids, 'prune parity case ' || case_no) from private.prune_expected order by case_no;

-- 13. events_usage
select is(pg_temp.count_as('a0000000-0000-4000-8000-00000000000a', 'select count(*) from public.events_usage()'), 1::bigint, 'the admin gets one row from events_usage');
select is(pg_temp.count_as('b0000000-0000-4000-8000-00000000000b', 'select count(*) from public.events_usage()'), 0::bigint, 'a reader who is not an admin gets none');
select is(pg_temp.count_as('a0000000-0000-4000-8000-00000000000a', 'select rows from public.events_usage()'), (select count(*) from public.events), 'events_usage counts every row');

-- 14. the migration is complete: seven functions in private (it was applied twice by the runner)
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'), 7::bigint, 'schema private holds exactly seven functions');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('events', 'event_meta') and c.relkind = 'r'), 2::bigint, 'both tables exist once');

-- 15. the fresh start (P7): public.attempts is gone, private.fresh_start runs once per key
select hasnt_table('public', 'attempts', 'public.attempts is dropped');
select has_table('private', 'once', 'private.once exists');
-- the runner says what it applied (settings bm.sql_path and bm.migrations, set in the same session),
-- so this does not read the answer from private.once, the table under test. The migration writes
-- the key 'r2-fresh-start'; schema.sql alone defines private.once and private.fresh_start but runs
-- no fresh start, so on the schema path (and on a migration path without that migration) the table
-- must be empty. The next assertion checks that both ways. The key is expected only on a run whose
-- base ref is older than that migration (P7, 2026-10-15): with origin/main current, never.
select ok(current_setting('bm.sql_path', true) in ('schema', 'migration'), 'the runner said which path it ran (bm.sql_path)');
select ok((current_setting('bm.sql_path', true) = 'schema') = (coalesce(current_setting('bm.migrations', true), '') = ''), 'the schema path applied no migration and the migration path at least one (bm.migrations)');
create temp table migrated as select '20261015201142_drop_attempts.sql' = any(string_to_array(coalesce(current_setting('bm.migrations', true), ''), ',')) as yes;
select is((select string_agg(key, ',' order by key) from private.once), case when (select yes from migrated) then 'r2-fresh-start' end, 'private.once holds r2-fresh-start when the migration ran, and nothing from schema.sql alone');
select has_function('private', 'fresh_start', array['text'], 'private.fresh_start exists');
select is(has_function_privilege('authenticated', 'private.fresh_start(text)', 'execute'), false, 'authenticated cannot execute private.fresh_start');
select is(has_function_privilege('anon', 'private.fresh_start(text)', 'execute'), false, 'anon cannot execute private.fresh_start');
select is(has_table_privilege('authenticated', 'private.once', 'select'), false, 'authenticated cannot read private.once');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$select private.fresh_start('x')$$), '42501', 'B cannot call fresh_start');

/* an entry of any kind: seed, minute, section, ref, kind, ok, n, r, f, src */
create function pg_temp.pe(seed text, t integer, sec text, ref text, k text, ok integer, n integer, r integer, f integer, src text default 'ex')
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', 'dev' || substr(md5(seed), 1, 5) || '-' || substr(md5(seed || 'r'), 1, 8) || '-' || substr(md5(seed || 'h'), 1, 7),
    'p', jsonb_build_array(t, t / 1440, src, sec, ref, k, ok, n, r, f))
$$;
/* the rows of a query, as one text, run as a signed-in user */
create function pg_temp.rows_as(uid uuid, stmt text) returns text language plpgsql as $$
declare s text;
begin
  perform pg_temp.as_user(uid);
  execute 'select coalesce(string_agg(e::text, '';'' order by e::text), '''') from (' || stmt || ') e' into s;
  execute 'reset role';
  return s;
end $$;
create function pg_temp.epoch_of(uid uuid) returns integer language sql as $$ select epoch from public.event_meta where user_id = uid $$;

update public.user_state set progress = '{"a":1}', reset_at = 5 where user_id = 'b0000000-0000-4000-8000-00000000000b';
update public.user_state set play = '{"p":1}', attempts = '{"p":1}', activity = '{"p":1}', lesson = '{"p":1}', last = '{"p":1}', game = '{"p":1}', diag = '{"d":1}'
  where user_id in ('b0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000d');
update public.user_state set progress = '{"a":1}', reset_at = 9223372036854775807 where user_id = 'd0000000-0000-4000-8000-00000000000d';
create temp table fs_e as select (select epoch from public.event_meta where user_id = 'e0000000-0000-4000-8000-00000000000e') as epoch,
  (select count(*) from public.events where user_id = 'e0000000-0000-4000-8000-00000000000e') as n;
select ok((select n from fs_e) > 0, 'E (who has no user_state row) has events before the fresh start');
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(
  pg_temp.pe('fs1', pg_temp.nowmin() - 20, 'ch02#one-unknown', 'ch02/zz', 'c', 1, 1, 0, 0)), pg_temp.epoch_of('b0000000-0000-4000-8000-00000000000b'))->>'added', '1', 'B has an event before the fresh start');
create temp table fs1 as select pg_temp.epoch_of('b0000000-0000-4000-8000-00000000000b') as epoch;
select is(pg_temp.put('d0000000-0000-4000-8000-00000000000d', jsonb_build_array(
  pg_temp.pe('fsd', pg_temp.nowmin() - 20, 'ch02#one-unknown', 'ch02/zy', 'c', 1, 1, 0, 0)), coalesce(pg_temp.epoch_of('d0000000-0000-4000-8000-00000000000d'), 0))->>'added', '1', 'D (reset_at at the maximum) has an event before the fresh start');
create temp table fsd as select pg_temp.epoch_of('d0000000-0000-4000-8000-00000000000d') as epoch;
select is(private.fresh_start('test-fresh'), true, 'fresh_start with a new key returns true');
select is((select count(*) from public.events where user_id = 'd0000000-0000-4000-8000-00000000000d'), 0::bigint, 'D: the trigger could not fire (reset_at cannot grow), the function emptied the log itself');
select is(pg_temp.epoch_of('d0000000-0000-4000-8000-00000000000d'), (select epoch + 1 from fsd), 'D: and moved the epoch by one');
select is((select count(*) from public.user_state where user_id in ('b0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000d')
  and play = '{}' and attempts = '{}' and activity = '{}' and lesson = '{}' and game = '{}' and last is null and progress = '{}'), 2::bigint,
  'B and D: progress, play, attempts, activity, lesson, game are {} and last is null');
select is((select count(*) from public.user_state where user_id in ('b0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000d') and diag = '{"d":1}'), 2::bigint, 'B and D: diag is unchanged');
select is((select reset_at from public.user_state where user_id = 'd0000000-0000-4000-8000-00000000000d'), 9223372036854775807::bigint, 'D: a reset_at at the bigint maximum does not overflow the fresh start');
select is((select count(*) from public.events where user_id = 'e0000000-0000-4000-8000-00000000000e'), 0::bigint, 'E (no user_state row): events are gone');
select is((select epoch from public.event_meta where user_id = 'e0000000-0000-4000-8000-00000000000e'), (select epoch + 1 from fs_e), 'E: epoch grew by one');
select is((select relrowsecurity from pg_class where oid = 'private.once'::regclass), true, 'private.once has row-level security on');
select is((select count(*) from pg_policies where schemaname = 'private' and tablename = 'once'), 0::bigint, 'private.once has no policy');
select is((select count(*) from unnest(array['select', 'insert', 'update', 'delete']) priv, unnest(array['anon', 'authenticated']) r
  where has_table_privilege(r, 'private.once', priv)), 0::bigint, 'anon and authenticated have no privilege on private.once');
select is((select progress from public.user_state where user_id = 'b0000000-0000-4000-8000-00000000000b'), '{}'::jsonb, 'B''s progress is empty');
select ok((select reset_at from public.user_state where user_id = 'b0000000-0000-4000-8000-00000000000b') > 5, 'B''s reset_at moved forward');
select ok((select reset_at from public.user_state where user_id = 'b0000000-0000-4000-8000-00000000000b') > 1700000000000, 'reset_at is a millisecond clock reading');
select is((select count(*) from public.events where user_id = 'b0000000-0000-4000-8000-00000000000b'), 0::bigint, 'B''s events are gone');
select is(pg_temp.epoch_of('b0000000-0000-4000-8000-00000000000b'), (select epoch + 1 from fs1), 'B''s epoch grew by one');
select is((select count(*) from private.once where key = 'test-fresh'), 1::bigint, 'the key is recorded');
create temp table fs2 as select updated_at, reset_at from public.user_state where user_id = 'b0000000-0000-4000-8000-00000000000b';
select is(private.fresh_start('test-fresh'), false, 'a second fresh_start with the same key returns false');
select is((select row(updated_at, reset_at)::text from public.user_state where user_id = 'b0000000-0000-4000-8000-00000000000b'), (select row(updated_at, reset_at)::text from fs2), 'and changes nothing');
-- not called when the migration did not run: on schema.sql alone the key is fresh, and spending
-- it here would start every reader afresh and move the epoch the next line checks
select is(case when (select yes from migrated) then private.fresh_start('r2-fresh-start') else false end, false, 'the migration''s key is spent too');
select is(pg_temp.epoch_of('b0000000-0000-4000-8000-00000000000b'), (select epoch + 1 from fs1), 'no epoch moved on the spent keys');

-- 16. exercise_stats() and chapter_stats() read the event log (D is the second reader: C's log is full)
delete from public.events;
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(
  pg_temp.pe('s1', pg_temp.nowmin() - 30, 'ch02#one-unknown', 'ch02/e3', 'c', 0, 1, 0, 0),
  pg_temp.pe('s2', pg_temp.nowmin() - 29, 'ch02#one-unknown', 'ch02/e3', 'c', 1, 2, 1, 0),
  pg_temp.pe('s3', pg_temp.nowmin() - 28, 'ch02#one-unknown', 'ch02/e3', 'o', 0, 0, 1, 0),
  pg_temp.pe('s4', pg_temp.nowmin() - 27, 'ch02#one-unknown', 'ch02/e3', 'a', 0, 0, 0, 0),
  pg_temp.pe('s5', pg_temp.nowmin() - 26, 'ch02#one-unknown', 'g:arena', 'c', 1, 1, 0, 0)),
  pg_temp.epoch_of('b0000000-0000-4000-8000-00000000000b'))->>'added', '5', 'B: five entries, two of which the stats ignore');
select is(pg_temp.rows_as('a0000000-0000-4000-8000-00000000000a', 'select * from public.exercise_stats()'),
  '(ch02,e3,ch02#one-unknown,f,1,2,1,0,1,1,2.00)', 'exercise_stats: one row, the a entry and the g: ref ignored');
select is(pg_temp.rows_as('a0000000-0000-4000-8000-00000000000a', 'select * from public.chapter_stats()'),
  '(ch02,1,2,1)', 'chapter_stats: one reader, two checks, active in the last 7 days');
select is(pg_temp.put('d0000000-0000-4000-8000-00000000000d', jsonb_build_array(
  pg_temp.pe('s6', pg_temp.nowmin() - 25, 'ch02#one-unknown', 'ch02/e3', 'c', 1, 1, 0, 0)),
  coalesce(pg_temp.epoch_of('d0000000-0000-4000-8000-00000000000d'), 0))->>'added', '1', 'D: one right first-try check on the same exercise');
select is(pg_temp.rows_as('a0000000-0000-4000-8000-00000000000a', 'select * from public.exercise_stats()'),
  '(ch02,e3,ch02#one-unknown,f,2,3,2,1,1,1,1.50)', 'exercise_stats with D: 2 learners, 3 checks, 1 first try, avg 1.50');
select is(pg_temp.rows_as('a0000000-0000-4000-8000-00000000000a', 'select * from public.chapter_stats()'),
  '(ch02,2,3,2)', 'chapter_stats with D: (ch02, 2, 3, 2)');
select is(pg_temp.rows_as('b0000000-0000-4000-8000-00000000000b', 'select * from public.exercise_stats()'), '', 'B (not an admin) gets no exercise_stats');
select is(pg_temp.rows_as('b0000000-0000-4000-8000-00000000000b', 'select * from public.chapter_stats()'), '', 'B (not an admin) gets no chapter_stats');
select is(pg_temp.put('d0000000-0000-4000-8000-00000000000d', jsonb_build_array(
  pg_temp.pe('s7', pg_temp.nowmin() - 24, 'interlude#a', 'interlude/e1', 'c', 1, 1, 0, 0, 'in'),
  pg_temp.pe('s8', pg_temp.nowmin() - 23, 'pk-data#a', 'pk-data/t7', 'c', 0, 1, 0, 0)),
  coalesce(pg_temp.epoch_of('d0000000-0000-4000-8000-00000000000d'), 0))->>'added', '2', 'D: an interlude and a pk-* exercise');
select is(pg_temp.rows_as('a0000000-0000-4000-8000-00000000000a', 'select chapter, ex_key, inline, learners, checks, solved from public.exercise_stats()'),
  '(ch02,e3,f,2,3,2);(interlude,e1,t,1,1,1);(pk-data,t7,f,1,1,0)', 'interlude and pk-* chapters are counted, the inline flag follows src in');
select is(pg_temp.rows_as('a0000000-0000-4000-8000-00000000000a', 'select * from public.chapter_stats()'),
  '(ch02,2,3,2);(interlude,1,1,1);(pk-data,1,1,1)', 'chapter_stats counts them under their own chapters');
select is(pg_temp.rows_as('a0000000-0000-4000-8000-00000000000a', 'select * from public.exercise_stats() where false'), '', 'exercise_stats runs for the admin through a filter');
-- an open without a check is not a learner; an old check is not active in 7 days
select is(pg_temp.put('e0000000-0000-4000-8000-00000000000e', jsonb_build_array(
  pg_temp.pe('s9', pg_temp.nowmin() - 20, 'ch05#a', 'ch05/e1', 'o', 0, 0, 1, 0),
  pg_temp.pe('s10', pg_temp.nowmin() - 9 * 1440, 'ch06#a', 'ch06/e1', 'c', 1, 1, 0, 0)),
  pg_temp.epoch_of('e0000000-0000-4000-8000-00000000000e'))->>'added', '2', 'E: an open without a check, and a check nine days old');
select is(pg_temp.rows_as('a0000000-0000-4000-8000-00000000000a', 'select chapter from public.exercise_stats() where chapter in (''ch05'', ''ch06'')'), '(ch06)', 'an open without a check is not a learner');
select is(pg_temp.rows_as('a0000000-0000-4000-8000-00000000000a', 'select * from public.chapter_stats() where chapter = ''ch06'''), '(ch06,1,1,0)', 'a check nine days old is not active in 7 days');
-- the cap: 100 exercises per reader per chapter
insert into public.events (user_id, id, t, d, src, sec, ref, k, ok, n, r, f, seq)
  select 'e0000000-0000-4000-8000-00000000000e', 'cap' || lpad(g::text, 5, '0') || '-00000000-0000000',
         pg_temp.nowmin() - 100, (pg_temp.nowmin() - 100) / 1440, 'ex', '', 'ch07/x' || lpad(g::text, 3, '0'), 'c', 1, 1, 0, 0, 1000 + g
  from generate_series(1, 130) g;
select is(pg_temp.rows_as('a0000000-0000-4000-8000-00000000000a', 'select count(*) from public.exercise_stats() where chapter = ''ch07'''), '(100)', 'exercise_stats counts at most 100 exercises per reader per chapter');
select is(pg_temp.rows_as('a0000000-0000-4000-8000-00000000000a', 'select * from public.chapter_stats() where chapter = ''ch07'''), '(ch07,1,100,1)', 'chapter_stats applies the same cap');

-- 17. managed learners (PA-1): B and C are parents, D an adult, E is deleted at the end
create function pg_temp.as_user_amr(uid uuid, ts bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', ts)))::text, true);
  execute 'set local role authenticated';
end $$;
/* run stmt as uid with a sign-in at ts (null: no amr claim); returns 'ok' or the error message */
create function pg_temp.msg_as(uid uuid, ts bigint, stmt text) returns text language plpgsql as $$
declare m text := 'ok';
begin
  if ts is null then perform pg_temp.as_user(uid); else perform pg_temp.as_user_amr(uid, ts); end if;
  begin
    execute stmt;
  exception when others then
    m := sqlerrm;
  end;
  execute 'reset role';
  return m;
end $$;
create function pg_temp.now_s() returns bigint language sql as $$ select floor(extract(epoch from now()))::bigint $$;
create function pg_temp.put3(uid uuid, batch jsonb, epoch integer, learner uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.as_user(uid);
  r := public.events_put(batch, epoch, learner);
  execute 'reset role';
  return r;
end $$;
create function pg_temp.export_as(uid uuid, ts bigint, learner uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.as_user_amr(uid, ts);
  r := public.learner_export(learner);
  execute 'reset role';
  return r;
end $$;
create function pg_temp.val_as(uid uuid, stmt text) returns text language plpgsql as $$
declare r text;
begin
  perform pg_temp.as_user(uid);
  execute stmt into r;
  execute 'reset role';
  return r;
end $$;

select has_function('private', 'fresh_auth', 'private.fresh_auth exists');
select is(has_function_privilege('authenticated', 'private.fresh_auth()', 'execute'), false, 'authenticated cannot execute private.fresh_auth');
select is(has_function_privilege('anon', 'public.learner_add(text, boolean, smallint)', 'execute'), false, 'anon cannot run learner_add');
select is(has_function_privilege('authenticated', 'public.learner_add(text, boolean, smallint)', 'execute'), true, 'authenticated can run learner_add');

-- backfill and trigger
select is((select count(*) from public.learners where self and id = guardian), (select count(*) from auth.users), 'every auth.users row has a self learner with id = guardian');
select is((select count(*) from public.learners where self), (select count(*) from public.learners where id = guardian), 'a learner is self exactly when its id is its guardian');
insert into auth.users (id, email) values ('f0000000-0000-4000-8000-00000000000f', 'f@example.test');
select is((select count(*) from public.learners where id = 'f0000000-0000-4000-8000-00000000000f' and self), 1::bigint, 'inserting an account creates its self learner');
delete from public.learners where id = 'f0000000-0000-4000-8000-00000000000f';
select is(pg_temp.count_as('f0000000-0000-4000-8000-00000000000f', 'select count(*) from public.learner_list()'), 1::bigint, 'learner_list restores a missing self learner');
select is((select count(*) from public.learners where id = 'f0000000-0000-4000-8000-00000000000f' and self), 1::bigint, 'and the row is back');

-- the table is read-only from the browser
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$insert into public.learners (guardian, name) values ('b0000000-0000-4000-8000-00000000000b', 'x')$$), '42501', 'B cannot insert into learners');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$insert into public.learners (guardian, name) values ('c0000000-0000-4000-8000-00000000000c', 'x')$$), '42501', 'B cannot insert a learner under another guardian');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$update public.learners set name = 'x'$$), '42501', 'B cannot update learners');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', $$delete from public.learners$$), '42501', 'B cannot delete from learners');

-- learner_add and learner_list
create temp table lk (k text primary key, id uuid);
insert into lk values
  ('b13', (select pg_temp.val_as('b0000000-0000-4000-8000-00000000000b', $$select public.learner_add('Kid One', true, 1::smallint)$$)::uuid)),
  ('b18', (select pg_temp.val_as('b0000000-0000-4000-8000-00000000000b', $$select public.learner_add('  Kid Two  ', false, 5::smallint)$$)::uuid));
select is(pg_temp.count_as('b0000000-0000-4000-8000-00000000000b', 'select count(*) from public.learner_list()'), 3::bigint, 'B: learner_list returns three rows');
select is(pg_temp.val_as('b0000000-0000-4000-8000-00000000000b', 'select self::text from public.learner_list() limit 1'), 'true', 'B: the self learner comes first');
select is((select row(name, under13, consent_v, consent_at is not null)::text from public.learners where id = (select id from lk where k = 'b13')), '("Kid One",t,1,t)', 'under-13 learner: consent stored with a time');
select is((select row(name, under13, consent_v, consent_at is not null)::text from public.learners where id = (select id from lk where k = 'b18')), '("Kid Two",f,,f)', 'other learner: name trimmed, consent_v null');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, $$select public.learner_add('K', true, 0::smallint)$$), 'consent required', 'learner_add under13 with consent 0 raises consent required');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, $$select public.learner_add('K', true, null)$$), 'consent required', 'learner_add under13 with null consent raises consent required');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, 'select public.learner_add(repeat(''a'', 41), false, null)'), 'bad name', 'a 41-character name raises bad name');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, $$select public.learner_add('   ', false, null)$$), 'bad name', 'a blank name raises bad name');
do $$ begin for i in 3..8 loop perform pg_temp.val_as('b0000000-0000-4000-8000-00000000000b', 'select public.learner_add(''K' || i || ''', false, null)'); end loop; end $$;
select is((select count(*) from public.learners where guardian = 'b0000000-0000-4000-8000-00000000000b' and not self), 8::bigint, 'B holds eight managed learners');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, $$select public.learner_add('K9', false, null)$$), 'too many learners', 'the ninth managed learner raises too many learners');
select is(pg_temp.msg_as(null, null, $$select public.learner_add('K', false, null)$$), 'not signed in', 'learner_add with nobody signed in raises not signed in');

-- cross-family (T1): C against B's learner
insert into public.user_state (user_id, progress) values ((select id from lk where k = 'b13'), '{"k":1}');
select is(pg_temp.count_as('c0000000-0000-4000-8000-00000000000c', format('select count(*) from public.user_state where user_id = %L', (select id from lk where k = 'b13'))), 0::bigint, 'C cannot see the state of B''s learner');
select is(pg_temp.count_as('b0000000-0000-4000-8000-00000000000b', format('select count(*) from public.user_state where user_id = %L', (select id from lk where k = 'b13'))), 1::bigint, 'B sees the state of their learner');
select is(pg_temp.sqlstate_as('c0000000-0000-4000-8000-00000000000c', format('insert into public.user_state (user_id) values (%L)', (select id from lk where k = 'b18'))), '42501', 'C cannot insert user_state for B''s learner');
select is(pg_temp.msg_as('c0000000-0000-4000-8000-00000000000c', null, format('select public.events_put(%L::jsonb, 0, %L)', '[]', (select id from lk where k = 'b13'))), 'not your learner', 'C: events_put for B''s learner raises not your learner');
select is(pg_temp.msg_as('c0000000-0000-4000-8000-00000000000c', null, format('select public.learner_rename(%L, ''z'')', (select id from lk where k = 'b13'))), 'not your learner', 'C: learner_rename on B''s learner raises not your learner');
select is(pg_temp.msg_as('c0000000-0000-4000-8000-00000000000c', null, format('select public.learner_mark_under13(%L, 1::smallint)', (select id from lk where k = 'b18'))), 'not your learner', 'C: learner_mark_under13 on B''s learner raises not your learner');
select is(pg_temp.msg_as('c0000000-0000-4000-8000-00000000000c', pg_temp.now_s() - 60, format('select public.learner_delete(%L)', (select id from lk where k = 'b13'))), 'not your learner', 'C: learner_delete on B''s learner raises not your learner');
select is(pg_temp.msg_as('c0000000-0000-4000-8000-00000000000c', pg_temp.now_s() - 60, format('select public.learner_export(%L)', (select id from lk where k = 'b13'))), 'not your learner', 'C: learner_export on B''s learner raises not your learner');
select is(pg_temp.count_as('c0000000-0000-4000-8000-00000000000c', format('select count(*) from public.learners where id = %L', (select id from lk where k = 'b13'))), 0::bigint, 'C cannot see B''s learner rows');

-- rename and mark under 13 as B
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, format('select public.learner_rename(%L, ''Renamed'')', (select id from lk where k = 'b18'))), 'ok', 'B renames a managed learner');
select is((select name from public.learners where id = (select id from lk where k = 'b18')), 'Renamed', 'and the name changed');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, $$select public.learner_rename('b0000000-0000-4000-8000-00000000000b', 'Me')$$), 'not your learner', 'B cannot rename their own self learner');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, format('select public.learner_mark_under13(%L, 2::smallint)', (select id from lk where k = 'b18'))), 'consent required', 'learner_mark_under13 with the wrong consent version raises consent required');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, format('select public.learner_mark_under13(%L, 1::smallint)', (select id from lk where k = 'b18'))), 'ok', 'B marks a managed learner under 13');
select is((select row(under13, consent_v, consent_at is not null)::text from public.learners where id = (select id from lk where k = 'b18')), '(t,1,t)', 'and the consent is recorded');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, $$select public.learner_mark_under13('b0000000-0000-4000-8000-00000000000b', 1::smallint)$$), 'not your learner', 'the self learner cannot be marked under 13');

-- events_put with a learner
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, 'select public.events_put(''[]'', 0)'), 'ok', 'events_put with two arguments still resolves');
create temp table lput as select pg_temp.put3('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(pg_temp.el('lp1', pg_temp.nowmin() - 15, 'lp1')), 0, (select id from lk where k = 'b13')) as r;
select is((select r->>'added' from lput), '1', 'B: events_put for a managed learner adds the entry');
select is((select user_id from public.events where id = pg_temp.el('lp1', 0)->>'id'), (select id from lk where k = 'b13'), 'and it lands under the learner id');
select is((select count(*) from public.events where id = pg_temp.el('lp1', 0)->>'id' and user_id = 'b0000000-0000-4000-8000-00000000000b'), 0::bigint, 'and not under B''s own id');
select is(pg_temp.put('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(pg_temp.el('lp2', pg_temp.nowmin() - 14, 'lp2')), pg_temp.epoch_of('b0000000-0000-4000-8000-00000000000b'))->>'added', '1', 'B: the two-argument call adds an entry');
select is((select user_id from public.events where id = pg_temp.el('lp2', 0)->>'id'), 'b0000000-0000-4000-8000-00000000000b'::uuid, 'and it lands under B''s own id');
select is(pg_temp.count_as('b0000000-0000-4000-8000-00000000000b', format('select count(*) from public.events where user_id = %L', (select id from lk where k = 'b13'))), 1::bigint, 'B reads the events of their learner through the policy');

-- step-up (T4): learner_delete
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, format('select public.learner_delete(%L)', (select id from lk where k = 'b13'))), 'stale sign-in', 'learner_delete with no amr raises stale sign-in');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', pg_temp.now_s() - 660, format('select public.learner_delete(%L)', (select id from lk where k = 'b13'))), 'stale sign-in', 'learner_delete with a sign-in 11 minutes old raises stale sign-in');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', pg_temp.now_s() - 60, format('select public.learner_delete(%L)', (select id from lk where k = 'b13'))), 'ok', 'learner_delete with a sign-in 1 minute old succeeds');
select is((select count(*) from public.user_state where user_id = (select id from lk where k = 'b13')) + (select count(*) from public.events where user_id = (select id from lk where k = 'b13')) + (select count(*) from public.event_meta where user_id = (select id from lk where k = 'b13')), 0::bigint, 'and the learner''s state, events and meta are gone');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', pg_temp.now_s() - 60, $$select public.learner_delete('b0000000-0000-4000-8000-00000000000b')$$), 'not your learner', 'the self learner cannot be deleted with learner_delete');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', pg_temp.now_s() - 60, 'select public.learner_delete(gen_random_uuid())'), 'not your learner', 'an unknown learner raises not your learner');

-- step-up: learner_export (b18 holds a state row and an event)
insert into public.user_state (user_id, progress) values ((select id from lk where k = 'b18'), '{"k":2}');
select is(pg_temp.put3('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(pg_temp.el('lx1', pg_temp.nowmin() - 13, 'lx1'), pg_temp.el('lx2', pg_temp.nowmin() - 12, 'lx2')), 0, (select id from lk where k = 'b18'))->>'added', '2', 'B: two entries for a second managed learner');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, format('select public.learner_export(%L)', (select id from lk where k = 'b18'))), 'stale sign-in', 'learner_export with no amr raises stale sign-in');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', pg_temp.now_s() - 660, format('select public.learner_export(%L)', (select id from lk where k = 'b18'))), 'stale sign-in', 'learner_export with a sign-in 11 minutes old raises stale sign-in');
create temp table lexp as select pg_temp.export_as('b0000000-0000-4000-8000-00000000000b', pg_temp.now_s() - 60, (select id from lk where k = 'b18')) as j;
select is((select row(j->'learner'->>'name', j->'state'->'progress', jsonb_array_length(j->'events'))::text from lexp), '(Renamed,"{""k"": 2}",2)', 'learner_export with a sign-in 1 minute old returns the learner, its state and its two events');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', pg_temp.now_s() - 60, $$select public.learner_export('b0000000-0000-4000-8000-00000000000b')$$), 'ok', 'learner_export of one''s own self learner is allowed');

-- fresh_auth fails closed on a malformed claim
do $x$ begin perform set_config('request.jwt.claims', '{"sub":"x","amr":"password"}', true); end $x$;
select is(private.fresh_auth(), false, 'a non-array amr claim is not fresh');
do $x$ begin perform set_config('request.jwt.claims', '{"sub":"x","amr":[{"method":"password","timestamp":"soon"},5,null]}', true); end $x$;
select is(private.fresh_auth(), false, 'an amr without a numeric timestamp is not fresh');
do $x$ begin perform set_config('request.jwt.claims', '{"sub":"x"}', true); end $x$;
select is(private.fresh_auth(), false, 'no amr claim is not fresh');
do $x$ begin perform set_config('request.jwt.claims', json_build_object('sub', 'x', 'amr', json_build_array(json_build_object('timestamp', floor(extract(epoch from now())) + 31536000)))::text, true); end $x$;
select is(private.fresh_auth(), false, 'a timestamp one year ahead is not fresh');
do $x$ begin perform set_config('request.jwt.claims', '{"sub":"x","amr":[{"method":"password","timestamp":1e300}]}', true); end $x$;
select is(private.fresh_auth(), false, 'a timestamp of 1e300 is not fresh');
do $x$ begin perform set_config('request.jwt.claims', json_build_object('sub', 'x', 'amr', json_build_array(json_build_object('timestamp', floor(extract(epoch from now())) - 599)))::text, true); end $x$;
select is(private.fresh_auth(), true, 'a timestamp 599 seconds ago is fresh');

-- reset isolation (T5): resetting one learner leaves the other's events
insert into public.learners (guardian, name) values ('b0000000-0000-4000-8000-00000000000b', 'iso1'), ('b0000000-0000-4000-8000-00000000000b', 'iso2');
insert into public.user_state (user_id) select id from public.learners where name in ('iso1', 'iso2');
do $x$ begin perform pg_temp.put3('b0000000-0000-4000-8000-00000000000b', jsonb_build_array(pg_temp.el('iso' || name, pg_temp.nowmin() - 11, 'iso')), 0, id) from public.learners where name in ('iso1', 'iso2'); end $x$;
select is((select count(*) from public.events e join public.learners l on l.id = e.user_id where l.name in ('iso1', 'iso2')), 2::bigint, 'two learners of B each hold an event');
update public.user_state set reset_at = 5 where user_id = (select id from public.learners where name = 'iso1');
select is((select string_agg(l.name, ',') from public.events e join public.learners l on l.id = e.user_id where l.name in ('iso1', 'iso2')), 'iso2', 'resetting one learner removes only its events');
select is((select epoch from public.event_meta where user_id = (select id from public.learners where name = 'iso2')), 0, 'and leaves the other''s epoch');

-- cross-family, the rest (T1): C against B's managed learner (b18 holds a state row and two events)
select is(pg_temp.count_as('c0000000-0000-4000-8000-00000000000c', format('select count(*) from public.events where user_id = %L', (select id from lk where k = 'b18'))), 0::bigint, 'C cannot see the events of B''s learner');
select is((select count(*) from public.events where user_id = (select id from lk where k = 'b18')), 2::bigint, 'while B''s learner does have events');
create function pg_temp.rows_changed_as(uid uuid, stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform pg_temp.as_user(uid);
  execute stmt;
  get diagnostics n = row_count;
  execute 'reset role';
  return n;
end $$;
select is(pg_temp.rows_changed_as('c0000000-0000-4000-8000-00000000000c', format('update public.user_state set reset_at = 1 where user_id = %L', (select id from lk where k = 'b18'))), 0::bigint, 'C: updating the state of B''s learner affects no row');
select is(pg_temp.rows_changed_as('c0000000-0000-4000-8000-00000000000c', format('delete from public.user_state where user_id = %L', (select id from lk where k = 'b18'))), 0::bigint, 'C: deleting the state of B''s learner affects no row');
select is(pg_temp.sqlstate_as('b0000000-0000-4000-8000-00000000000b', format('update public.user_state set user_id = %L where user_id = %L', 'c0000000-0000-4000-8000-00000000000c', (select id from lk where k = 'b18'))), '42501', 'B cannot move the state of their learner onto C');

-- the check constraints on learners (superuser, so only the constraints can refuse)
select throws_ok($$insert into public.learners (id, guardian, self) values (gen_random_uuid(), 'b0000000-0000-4000-8000-00000000000b', true)$$, '23514', null, 'a self learner whose id is not its guardian is refused');
select throws_ok($$insert into public.learners (id, guardian, self, under13, consent_v) values ('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', true, true, 1)$$, '23514', null, 'a self learner cannot be under 13');
select throws_ok($$insert into public.learners (guardian, name, under13) values ('b0000000-0000-4000-8000-00000000000b', 'u', true)$$, '23514', null, 'an under-13 learner needs a consent version');

-- names: 40 characters pass, 41 and blank are refused, in learner_rename too
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, format('select public.learner_rename(%L, repeat(''a'', 41))', (select id from lk where k = 'b18'))), 'bad name', 'learner_rename with 41 characters raises bad name');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, format('select public.learner_rename(%L, ''   '')', (select id from lk where k = 'b18'))), 'bad name', 'learner_rename with a blank name raises bad name');
select is(pg_temp.msg_as('b0000000-0000-4000-8000-00000000000b', null, format('select public.learner_rename(%L, repeat(''a'', 40))', (select id from lk where k = 'b18'))), 'ok', 'learner_rename with 40 characters passes');
select is(pg_temp.msg_as('c0000000-0000-4000-8000-00000000000c', null, 'select public.learner_add(repeat(''b'', 40), false, null)'), 'ok', 'learner_add with 40 characters passes');

-- delete_my_account is unchanged (no step-up yet): deleting E removes E's learners and data
select is(pg_temp.msg_as('e0000000-0000-4000-8000-00000000000e', null, 'select public.delete_my_account()'), 'ok', 'E deletes their account');
select is((select count(*) from auth.users where id = 'e0000000-0000-4000-8000-00000000000e') + (select count(*) from public.learners where guardian = 'e0000000-0000-4000-8000-00000000000e') + (select count(*) from public.events where user_id = 'e0000000-0000-4000-8000-00000000000e'), 0::bigint, 'E, their learners and their events are gone');

select * from finish();
rollback;
