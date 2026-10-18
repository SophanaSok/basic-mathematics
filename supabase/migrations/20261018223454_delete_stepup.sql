-- delete_my_account() now requires a fresh sign-in (docs/decisions/0010, T4): it raises
-- 'stale sign-in' like learner_delete and learner_export. Needs private.fresh_auth()
-- (20261016194703_learners.sql). Rule 5: apply only after the site that shows the retry wording
-- on that refusal (PA-6b) is live, because the deployed site before it would show a bare error.
-- Idempotent.
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
