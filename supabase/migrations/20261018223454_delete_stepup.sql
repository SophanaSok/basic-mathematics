-- delete_my_account() now requires a fresh sign-in (docs/decisions/0010, T4): it raises
-- 'stale sign-in' like learner_delete and learner_export. Needs private.fresh_auth()
-- (20261016194703_learners.sql). Rule 5: apply only after the site that shows the retry wording
-- on that refusal (PA-6b) is live, because the deployed site before it would show a bare error.
-- Also private.fresh_auth() counts first-factor sign-ins only (see its comment): a second factor is not a sign-in.
-- Idempotent.
-- True when the caller's JWT shows a first-factor sign-in (an amr entry) within the last 10 minutes. A second factor
-- (totp, mfa/totp, mfa/phone) is not a sign-in: a stale session can enrol and verify one with no credential. The method
-- list is the first-factor methods GoTrue records in amr. Fails closed: no claim (read from request.jwt.claims, as
-- auth.jwt() does), a claim that is not an array, or entries without a number timestamp -> false.
create or replace function private.fresh_auth()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select max((a.value->>'timestamp')::numeric) between extract(epoch from pg_catalog.now()) - 600
                                                     and extract(epoch from pg_catalog.now()) + 60
    from jsonb_array_elements(case when jsonb_typeof(j.amr) = 'array' then j.amr else '[]'::jsonb end) a
    where jsonb_typeof(a.value) = 'object' and jsonb_typeof(a.value->'timestamp') = 'number'
      and a.value->>'method' in ('password', 'oauth', 'otp', 'magiclink', 'sso/saml', 'recovery', 'invite', 'web3')
  ), false)
  from (select nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb -> 'amr' as amr) j;
$$;
revoke all on function private.fresh_auth() from public, anon, authenticated;


create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  if not private.fresh_auth() then
    raise exception 'stale sign-in';
  end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
