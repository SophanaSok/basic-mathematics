-- Migration 20261008081415_diag: adds user_state.diag, where the placement check's results sync
-- (bm.diag.v1). Apply it in the SQL editor on the live project before the pull request that
-- syncs the key (D-5) is merged. It is backward compatible: the site now live never names
-- the column, so it keeps working with the column there. A reset does not clear it
-- (docs/decisions/0003-placement-check.md).

alter table public.user_state add column if not exists diag jsonb not null default '{}'::jsonb;
