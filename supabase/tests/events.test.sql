-- pgTAP suite for the event log (supabase/migrations/*_events.sql). Run by tools/sql-test.js
-- (npm run test:sql) against a throwaway Postgres in Docker, after the schema as it is on main,
-- the migration (twice) and supabase/tests/prune_cases.sql (generated: do not edit it).
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
  ('c0000000-0000-4000-8000-00000000000c', 'c@example.test');
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

-- 85 hand-counted tests below, plus one per row of the three tables
select plan(85 + (select count(*)::integer from hv) + (select count(*)::integer from private.valid_cases)
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
select is((select prosecdef from pg_proc where oid = 'public.events_put(jsonb, integer)'::regprocedure), true, 'events_put is security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'public.events_put(jsonb, integer)'::regprocedure), 'events_put pins search_path');
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
select is(has_function_privilege('anon', 'public.events_put(jsonb, integer)', 'execute'), false, 'anon cannot run events_put');
select is(has_function_privilege('authenticated', 'public.events_put(jsonb, integer)', 'execute'), true, 'authenticated can run events_put');
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
  '[{"id":null,"why":"invalid"},{"id":null,"why":"invalid"},{"id":null,"why":"invalid"},{"id":null,"why":"invalid"},{"id":null,"why":"invalid"},{"id":"short","why":"invalid"},{"id":"5","why":"invalid"},{"id":null,"why":"invalid"},{"id":"devabcde-12345678-abcdefg","why":"invalid"}]'::jsonb,
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

-- 12. prune parity with the browser's prune()
select is(pg_temp.prune_case(case_no), ids, 'prune parity case ' || case_no) from private.prune_expected order by case_no;

-- 13. events_usage
select is(pg_temp.count_as('a0000000-0000-4000-8000-00000000000a', 'select count(*) from public.events_usage()'), 1::bigint, 'the admin gets one row from events_usage');
select is(pg_temp.count_as('b0000000-0000-4000-8000-00000000000b', 'select count(*) from public.events_usage()'), 0::bigint, 'a reader who is not an admin gets none');
select is(pg_temp.count_as('a0000000-0000-4000-8000-00000000000a', 'select rows from public.events_usage()'), (select count(*) from public.events), 'events_usage counts every row');

-- 14. the migration is complete: four functions in private (it was applied twice by the runner)
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'), 4::bigint, 'schema private holds exactly four functions');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('events', 'event_meta') and c.relkind = 'r'), 2::bigint, 'both tables exist once');

select * from finish();
rollback;
