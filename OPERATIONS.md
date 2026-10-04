# Operations

A runbook for the one person who runs this site. It covers what has to be done by hand, in what
order, and what to do when something breaks.

Parts of it describe things the plan introduces in later releases (R0 to R5). Those parts are
marked **[not yet: Rn]** with the release that brings them. Anything unmarked is true of the
repository today. Where a step will need a command from a tool that is not in the repository yet,
it says so instead of guessing the command.

Contents: [1. Releasing a change that needs SQL](#1-releasing-a-change-that-needs-sql) ·
[2. GitHub Pages](#2-github-pages) · [3. Supabase](#3-supabase) · [4. Secrets](#4-secrets) ·
[5. Recurring duties](#5-recurring-duties) · [6. Kill switches](#6-kill-switches) ·
[7. Incidents](#7-incidents)

## 1. Releasing a change that needs SQL

The site deploys when a pull request is merged. The database does not: someone has to run the
SQL. If the new site arrives first, it writes a column or table that is not there and every
signed-in sync fails. So the database always moves first, and every database change is one the
old site can live with. The rule itself is in
[`supabase/migrations/README.md`](supabase/migrations/README.md).

### The order

1. **Write the migration.** On the topic branch, change [`supabase/schema.sql`](supabase/schema.sql)
   and add `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` with only the new statements, all of
   them idempotent. Run `node tools/check-static.js --base=main`: the `migrations` check fails if
   `schema.sql` changed and no migration was added, or if the file name is wrong.
2. **Apply it to the live project.** Dashboard → SQL → New query, paste the migration file, run.
   The pull request is still open; the deployed site is the old one.
3. **Verify with one of the queries below**, and check the old site still syncs: open the live
   account page signed in and confirm it does not say "Sync failed".
4. **Merge.** The new site deploys and finds the schema it needs.

The `migrations` check compares against `--base`, so it only bites when the base is the branch
being merged into. Against the script's old default base, any migration added since then
satisfies it. Continuous integration **[not yet: R0, item 3]** must pass the pull request's
target as `--base`.

A change that also needs an Edge Function **[not yet: R5]** goes database, then function, then
site. The function deploy step will be written here by the release that adds the first function.

### The verification queries

Run in the SQL editor. They only read. They are standard Postgres catalog queries; they have not
been run against the live project from this repository, which has no database connection.

**Q-columns**: the columns of one table (change the table name).

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'user_state'
order by ordinal_position;
```

**Q-tables**: every table, and whether row-level security is on. `rowsecurity` must be `true`
for all of them.

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
```

**Q-policies**: who may do what.

```sql
select tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public' order by tablename, policyname;
```

**Q-functions**: the functions the site calls.

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by p.proname;
```

If the SQL ran but the site still reports a column or table as not found, the API layer may be
holding an old picture of the schema. Run `notify pgrst, 'reload schema';` in the SQL editor and
try again.

### Rolling back each step

| Step | To undo it |
| --- | --- |
| 1. Migration written | Nothing is live. Change or delete the file on the branch. |
| 2. Applied to the live project | Usually: leave it. A migration only adds, and the deployed site ignores columns and tables it does not know. If it must go, write the reverse statements by hand (`drop column`, `drop table`) and run them. That destroys whatever was stored there, so do it only before the site that writes it has shipped. Take the file out of the unmerged pull request as well. |
| 3. Verified | Nothing to undo. |
| 4. Merged | Revert the merge commit on `main` and let the revert deploy ([7.2](#72-a-bad-deploy)). Leave the database alone: the old site ran against the new schema before the merge and will again. |

Once a migration has been merged, never edit it. Fix it with a newer migration.

## 2. GitHub Pages

The site is served at <https://sophanasok.github.io/basic-mathematics/>.

### How it deploys

**Today.** There is no workflow in the repository and nothing is built. GitHub Pages publishes
the files as they are in the repository (`.nojekyll` stops it running them through Jekyll). That
is the "Deploy from a branch" source; the repository layout implies `main` and `/ (root)`. This
was not read from the repository settings when this runbook was written, so confirm it under
Settings → Pages.

**After the toolchain release [not yet: R0, item 3].** A GitHub Actions workflow builds the site
into `dist/` and deploys that. Pushing to `main` (merging a pull request) is what triggers it. The
workflow file does not exist on this branch; when it lands, add its file name and job names here.

### The one-time switch

The toolchain release needs the Pages source changed once, by hand, because it is a repository
setting and not a file:

1. Settings → Pages → Build and deployment → Source.
2. Change **Deploy from a branch** to **GitHub Actions**.

Do it when the toolchain pull request is merged, then watch the first run in the Actions tab and
load the site. What the workflow's deploy job does while the source is still "Deploy from a
branch" has not been tested here; expect it not to publish.

**Switching back:** the same setting, set to **Deploy from a branch**, branch `main`, folder
`/ (root)`, Save. This publishes the repository root again. It is a real fallback only while the
root is still a working site, which is true through R0 item 3. From the releases that make pages
depend on the build **[not yet: R0, items 5 and 6]**, the root is source and not the site, and
switching back would publish something broken. From then on, undo a deploy by reverting the
commit.

### Re-running and triggering a deploy [not yet: R0, item 3]

- **Re-run:** Actions tab → the workflow → the run → **Re-run jobs** → **Re-run all jobs** (or
  **Re-run failed jobs**). A re-run uses the same commit as the original run, and is possible for
  30 days after it. With the GitHub CLI: `gh run rerun <run-id>`, adding `--failed` for only the
  failed jobs.
- **Manual trigger:** possible only if the workflow declares a `workflow_dispatch` trigger, in
  which case the Actions tab shows a **Run workflow** button. Whether it does depends on the
  toolchain release. Without it, pushing a commit to `main` is the trigger.
- Today, with "Deploy from a branch", GitHub runs its own Pages build on every push to `main`. It
  shows in the Actions tab and can be re-run the same way.

GitHub's pages on this, read 2026-10-04:
[publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site),
[re-running workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

## 3. Supabase

### What is stored

See "What is stored" in [`supabase/README.md`](supabase/README.md). It is not repeated here so
the two cannot drift apart.

One fact from it matters for operations: `user_state` is a copy of what each reader's browser
already holds, and sync is a merge, so a reader's browser can put their row back. The `attempts`
log exists only on the server.

### The auth redirect allow-list

Dashboard → Authentication → URL Configuration. The site sends every sign-in, sign-up
confirmation and password reset back to its own `account.html`, and Supabase refuses to send
anyone to an address that is not listed.

- Site URL: `https://sophanasok.github.io/basic-mathematics/`
- Redirect URLs: `https://sophanasok.github.io/basic-mathematics/account.html`, and
  `http://localhost:8000/account.html` for local work

If the site ever moves (a custom domain, a renamed repository, a different local port), add the
new `account.html` address here **before** the move, and keep the old one until the old address
stops serving. The sign-in services' own callback URL is Supabase's and does not change
(see "Sign-in providers" in [`supabase/README.md`](supabase/README.md)).

### Free-plan limits that matter here

Read on 2026-10-04 from the pages linked in the last column. They change; re-read them before
relying on a number.

| Limit (Free plan) | Number | Why it matters here | Source |
| --- | --- | --- | --- |
| Database size | 500 MB per project. Above it the project goes read-only | Every save fails while read-only. `attempts` grows by one row per answer check, and the `events` table **[not yet: R2]** will grow faster | [pricing](https://supabase.com/pricing), [database size](https://supabase.com/docs/guides/platform/database-size) |
| Pausing | "Free projects are paused after 1 week of inactivity" | A paused project answers nothing: no sign-in, no sync. The page read gives a 1-year window to restore a paused project from the dashboard | [pricing](https://supabase.com/pricing), [restore window](https://supabase.com/docs/guides/platform/upgrading) |
| Edge Function invocations | 500,000 a month included | Nothing today: there are no functions. Billing and the tutor **[not yet: R5]** will each cost an invocation per call | [pricing](https://supabase.com/pricing), [billing](https://supabase.com/docs/guides/platform/billing-on-supabase) |
| Edge Function run limits | 256 MB memory, 2 s CPU time, 150 s wall clock on Free, 100 functions per project | The tutor function **[not yet: R5]** waits on a model reply, so the wall-clock limit is the one it can reach | [function limits](https://supabase.com/docs/guides/functions/limits) |
| Monthly active users | 50,000 | Far off | [pricing](https://supabase.com/pricing) |
| Egress | 5 GB a month | Every sync reads the reader's whole row | [pricing](https://supabase.com/pricing) |
| Backups | Automatic backups are not included | Nothing restores the `attempts` log if it is lost | [pricing](https://supabase.com/pricing) |
| Log retention | 1 day for API and database logs | Look at the logs the day something breaks | [pricing](https://supabase.com/pricing) |
| Free projects | 2 | | [pricing](https://supabase.com/pricing) |

The pages read do not say what happens on the Free plan when a monthly quota other than database
size is passed. Assume the service is restricted until the month ends or the plan changes.

The plan's go-live checklist moves the project to a paid plan before the tutor is switched on
**[not yet: R5, item 28]**. These numbers then need re-reading.

### What to watch

- **Usage.** The organization's Usage page in the dashboard, once a month: database size, egress,
  and function invocations once functions exist.
- **Database size**, from the SQL editor (the first query is the one Supabase's page gives):

  ```sql
  select pg_size_pretty(sum(pg_database_size(pg_database.datname))) from pg_database;

  select relname, pg_size_pretty(pg_total_relation_size(relid)) as size
  from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc;
  ```

- **Pausing.** Mail from Supabase to the owner's address. The pricing page does not define
  inactivity; assume a week in which no signed-in reader syncs is enough to pause the project.
- **The account page.** Sign in on the live site now and then and read the sync line.

## 4. Secrets

**None of these ever goes into this repository.** [`assets/config.js`](assets/config.js) is
served to every visitor: it holds the project URL and the publishable (anon) key, which are meant
to be public, and must never hold anything else. Row-level security is what protects the data, not
that key.

| Secret | Exists | Where it lives | Created at |
| --- | --- | --- | --- |
| Sign-in services' client secrets (Google, GitHub) | today | Supabase dashboard → Authentication → Sign In / Providers | each service's developer console |
| Supabase service-role / secret key | today, unused by the site | Supabase only. Edge Functions are given it by Supabase; it is never copied anywhere | Supabase dashboard → Project Settings → API |
| Anthropic API key for the hint pipeline | **[not yet: R2]** | an environment variable on the owner's machine while `tools/hints/` runs | Anthropic Console |
| Stripe secret key | **[not yet: R5]** | Supabase Edge Function secrets | Stripe dashboard |
| Stripe webhook signing secret | **[not yet: R5]** | Supabase Edge Function secrets | Stripe dashboard, on the webhook endpoint |
| Anthropic API key for the tutor | **[not yet: R5]** | Supabase Edge Function secrets | Anthropic Console, in the workspace that carries the spend limit |

Edge Function secrets are set on the dashboard's "Edge Function Secrets" page or with the
Supabase CLI. The CLI is not part of this repository yet, so no command is given here; the
release that adds the first function adds the exact steps. Supabase's page:
[function secrets](https://supabase.com/docs/guides/functions/secrets).

The Pages deploy needs no secret of its own. If a later release has GitHub Actions deploy
functions or run migrations, that would add a Supabase access token to the repository's Actions
secrets. The plan does not call for it.

### Rotation, in outline

The pattern is always: make the new one, put it where it is used, check the feature works, then
revoke the old one. Revoking first means an outage.

- **A sign-in service's client secret.** Generate a new secret at the service, paste it into the
  provider's settings in the Supabase dashboard, sign in through that service on the live site,
  then delete the old secret at the service. Microsoft's expires on a date
  ([`supabase/README.md`](supabase/README.md)); it is not enabled today.
- **Stripe secret key [not yet: R5].** Roll it in the Stripe dashboard, set the new value in the
  function secrets, run one checkout in Stripe's test environment, then let the old key expire.
- **Stripe webhook signing secret [not yet: R5].** Roll it on the endpoint in the Stripe
  dashboard, set the new value in the function secrets, and confirm the next webhook is accepted.
- **Anthropic API key [not yet: R2 and R5].** Create a new key in the Console, replace it (the
  local environment for the hint pipeline, the function secrets for the tutor), make one call,
  delete the old key.
- **Supabase publishable key.** It is public, so rotate it only if Supabase requires it. Put the
  new key in `assets/config.js`, merge and deploy, and only then revoke the old one.
- **Supabase service-role / secret key.** Rotate it in the dashboard. Nothing in the repository
  holds it. Check any function that uses it afterwards **[not yet: R5]**.

Whether a function must be redeployed to pick up a changed secret is on Supabase's secrets page;
check it when the first function exists.

## 5. Recurring duties

| Duty | From | How often | What it is |
| --- | --- | --- | --- |
| Apply migrations | R0 (now) | every change to `schema.sql` | [Section 1](#1-releasing-a-change-that-needs-sql). The first real one is the `events` table in R2 |
| Watch Supabase usage and pausing | now | monthly | [Section 3](#what-to-watch) |
| Renew expiring provider secrets | now, if Microsoft is enabled | before the expiry date | [Section 4](#rotation-in-outline) |
| The hint review queue | **[not yet: R2]** | each content wave | Generated hints wait in a review queue; nothing ships unapproved. Approving or rejecting them is the owner's job |
| League abuse handling | **[not yet: R4]** | weekly, and on a report | Offensive or impersonating behaviour, and scores that look farmed. The tools for removing someone from a cohort come with R4 |
| Deploy Edge Functions in step with content | **[not yet: R5]** | every merge that changes exercises, solutions or hints | The tutor function bundles its own index of questions, solutions and rungs, and requests carry a content hash. If the site changes and the function is not redeployed, the hashes differ and the tutor falls back to the authored rungs for those exercises |
| Watch the Anthropic workspace spend limit | **[not yet: R5]** | weekly at first | Usage against the limit in the Anthropic Console. Once the limit is reached the tutor's calls fail; by the plan's design readers then get the authored rungs |
| Stripe support, refunds and disputes | **[not yet: R5]** | as they arrive; disputes have deadlines | Answer billing mail, issue refunds from the Stripe dashboard, respond to disputes. A dispute ends that reader's access |
| Tax filings | **[not yet: R5]** | as the tax setup chosen at go-live requires | Stripe Tax or a merchant of record (plan item 28) decides what has to be filed and by whom |
| Daily reconciliation check | **[not yet: R5]** | glance weekly | The plan reconciles entitlements with Stripe daily; confirm it is still running |

## 6. Kill switches

Flags in `window.BM_CONFIG` ([`assets/config.js`](assets/config.js)) that turn a feature off
without removing its code.

**Today:**

| Flag | Effect of turning it off |
| --- | --- |
| `supabaseUrl` and `supabaseAnonKey` both `""` | No accounts at all. Nothing is loaded from or sent to Supabase; progress stays in each browser |
| an id removed from `providers` | That sign-in button disappears. Remove it here first, then disable the service in Supabase |
| `emailDelivery: false` | No "Email me a sign-in link", no "Forgot password" |

**Planned [not yet]:** the plan adds `tutor.enabled` (R5; the tutor is built with it `false`) and
one flag each for leagues (R4), the shop (R3), gates (R3) and streak reminders (R3). Only
`tutor.enabled` has a settled name; the others are named by the release that adds them, which
also adds a row to the table above.

**Flipping one is a normal commit and deploy:** edit `assets/config.js`, open a pull request, let
the checks run, merge, wait for the deploy. There is no faster path and no server to restart.

Two limits to keep in mind:

- A page that is already open keeps the old value until it is reloaded, and a browser may keep a
  cached `config.js` for a short while.
- A flag in the browser hides a feature; it does not stop a server from answering. For anything
  that costs money per call **[not yet: R5]**, the hard stop is on the server (the tutor's caps,
  the Anthropic spend limit), and the R5 release must document it here.

## 7. Incidents

### 7.1 Sync is failing for everyone

Readers lose nothing while this lasts: progress is kept in the browser and merged into the
account the next time a sync works. So take the time to find the cause.

1. Sign in on the live site and read the account page. It says "Sync failed:" followed by the
   server's message.
2. **Cannot reach the service, or every request fails:** open the Supabase dashboard. If the
   project is paused, restore it there. If Supabase reports an outage, wait.
3. **The message names a column or table that does not exist:** a site was deployed before its
   migration ran. Apply the migration now ([section 1](#1-releasing-a-change-that-needs-sql));
   it is idempotent, so running it twice is safe. Verify with Q-columns or Q-tables. If the error
   persists, run `notify pgrst, 'reload schema';`.
4. **Writes are refused but reads work:** check the database size ([section 3](#what-to-watch)).
   Over 500 MB the Free plan is read-only; Supabase's
   [database size page](https://supabase.com/docs/guides/platform/database-size) gives the steps
   to delete data and leave read-only mode.
5. **It started right after a merge:** treat it as a bad deploy (7.2).
6. **Sign-in fails, rather than sync:** check the redirect allow-list
   ([section 3](#the-auth-redirect-allow-list)) and whether a sign-in service's secret has
   expired or been deleted.
7. Last resort, if it cannot be fixed soon and the errors are doing harm: set `supabaseUrl` and
   `supabaseAnonKey` to `""` and deploy. Accounts are off and the site works as it does for a
   signed-out visitor. Put the values back when the cause is fixed.

Afterwards, write down what happened and add the missing step to this file.

### 7.2 A bad deploy

1. Confirm it is the deploy: load the live site in a private window and compare with the last
   merge.
2. Revert the merge commit on `main` (GitHub's **Revert** button on the merged pull request opens
   a pull request that does it) and merge the revert. The previous site deploys. This works under
   either Pages source.
3. Once deploys run through GitHub Actions **[not yet: R0, item 3]**, a quicker stopgap is to
   re-run the last good run in the Actions tab, which redeploys that run's commit. `main` is
   still ahead of what is deployed, so do step 2 anyway.
4. Leave the database as it is. Migrations are backward compatible, so the older site runs
   against the newer schema.
5. If the deploy changed exercises, run `node tools/check-static.js --base=<last good commit>`
   on the fix before merging it: the `progress-keys` check shows whether any reader's saved
   progress would stop matching.

### 7.3 A leaked key

First decide which key it is.

- **The publishable (anon) key or the project URL.** These are public by design and are in
  `assets/config.js`. Nothing to do, provided Q-tables shows row-level security on for every
  table.
- **Anything else** (service-role or secret key, a sign-in service's client secret, and later a
  Stripe or Anthropic key): treat it as compromised from the moment it was exposed. Removing the
  commit or the message is not enough.
  1. Revoke or roll it where it was created ([section 4](#4-secrets)), and put the new value
     where it is used. Here an outage is the lesser harm: revoke first if the new value cannot be
     in place within minutes.
  2. Look for use by someone else: Supabase logs (kept one day on Free) and Q-tables and
     Q-policies for changes; Stripe's dashboard for payments, refunds and payouts you did not
     make **[not yet: R5]**; the Anthropic Console's usage **[not yet: R2]**.
  3. If it was committed, the key is in the repository's history and in every clone and fork.
     Rotation is the fix; rewriting history is optional tidying.
  4. If reader data may have been read (a leaked service-role key bypasses row-level security),
     say so to the readers affected. The privacy text on `about.html` describes what is held.
