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
   them idempotent. Run `node tools/check-static.js`: the `migrations` check fails if
   `schema.sql` changed and no migration was added, if the file name is wrong, or if a migration
   already on `main` was touched.
2. **Apply it to the live project.** Dashboard → SQL → New query, paste the migration file, run.
   The pull request is still open; the deployed site is the old one.
3. **Verify with one of the queries below**, and check the old site still syncs: open the live
   account page signed in and confirm it does not say "Sync failed".
4. **Merge.** The new site deploys and finds the schema it needs.

The `migrations` check compares against the commit the branch left `main` at, not against
`--base` (which is the progress-keys base and older than every migration). On a topic branch that
needs nothing extra. Where `main` does not resolve, as in a shallow checkout, it falls back to
`--base` and prints a warning, because against that base it lets a schema change through.
Continuous integration must therefore pass the commit being merged into as
`--migrations-base=<ref>`: the build job of `.github/workflows/ci.yml` does, on every pull
request, as `--migrations-base="origin/$BASE_REF"`, with the branch the request merges into.

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
| 2. Applied, then the pull request changed the migration | The live project now holds the earlier version, and re-running the edited file does not fix that: `add column if not exists` skips a column that is already there, without an error, whatever its new definition says. Either reverse the applied statements by hand (next row) and run the edited file, or leave the applied file as it is and add a newer migration to the same pull request that makes the difference. Then verify again (step 3). |
| 2. Applied to the live project | Usually: leave it. A migration only adds, and the deployed site ignores columns and tables it does not know. If it must go, write the reverse statements by hand (`drop column`, `drop table`) and run them. That destroys whatever was stored there, so do it only before the site that writes it has shipped. Take the file out of the unmerged pull request as well. |
| 3. Verified | Nothing to undo. |
| 4. Merged | Revert the merge commit on `main` and let the revert deploy ([7.2](#72-a-bad-deploy)). Leave the database alone: the old site ran against the new schema before the merge and will again. |

A migration is frozen from the moment it has been applied to the live project, not from the
merge: after step 2, change it only by one of the two routes in the table. Once it is on `main`
the `migrations` check refuses any edit to it; fix it with a newer migration.

## 2. GitHub Pages

The site is served at <https://sophanasok.github.io/basic-mathematics/>.

### How it deploys

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) builds the site into `dist/` and deploys
that. A push to `main` (merging a pull request) triggers it, and so does **Run workflow** on
`main`. Its jobs are `build` (the Node checks, the build, the checks on `dist/`), `browser` (the
Chromium checks that need no WebGL), `webgl` (the 3D checks, retried, outside the gate),
`pages-source` (asks GitHub which Pages source is set) and `deploy`, which publishes that run's
`dist/` once `build` and `browser` have passed.

**The files in the repository are not the site.** Since the page-shell change (R0, item 5) a
page in the repository holds its content and two markers. Its `<head>` (every stylesheet and
script) and its top bar are written by the build
([README, "The shell of a page"](README.md#the-shell-of-a-page)), and since the module entries
(R0, item 6) its scripts are bundled from `src/entries/<kind>.js` into chunks under
`dist/bundle/`. Published as they are, the pages have no styles, no scripts and no top bar.
`dist/` is the only thing that can be published.

### What a deploy does to a page a browser already holds

GitHub Pages serves everything with `Cache-Control: max-age=600` (read with `curl -sI` on the
live site, 2026-10-04): a browser may keep any page, script or stylesheet for ten minutes without
asking again. So for ten minutes after a deploy some readers are on a page from before it, and
that page asks for its scripts and stylesheets by name. **Nothing in `dist/` is named by a
hash, on purpose.** A chunk is `bundle/<kinds>.js`, named by the page kinds that load what is in
it (`bundle/all.js` for what every page loads, `bundle/chapter.js` for what only chapters load,
`bundle/home-chapter.js` for what the contents page and the chapters share), a page's own entry
is `bundle/pages/<page>.js`, the stylesheets are `bundle/<kinds>.css` the same way
(`vite.config.ts` `bundleNames`; `npm run check:dist` holds every file to the name its contents
call for). A name therefore changes only when what loads a file changes, never because a file
was edited, and a cached page finds the current scripts after a deploy that edits scripts,
which is how the site behaved before the bundles, when every script was its own file. A reader
with one chunk from the last deploy and the next from this one is on the mixed footing the site
has always accepted ([README, "Stores, the bus, and accounts"](README.md#stores-the-bus-and-accounts));
the names a chunk imports from another are the files' own (`init_site`, `init_widgets`), not
letters a build hands out.

What a deploy can still take from a cached page, for those ten minutes: **adding, removing or
renaming a script or stylesheet, or changing which page kinds load one**, renames a chunk or
the function another chunk imports from it, and a page that holds the old graph then fails to
load its scripts (the inline boot script still runs, so the theme is right; nothing after it
is, until the page expires). That is accepted: it is rare, it is ten minutes, and it cannot be
avoided without keeping the previous deploy's chunks, which the build does not have. Do not
try to work around it by hand. If such a change must not touch a reader mid-session, deploy it
at a quiet hour.

### Scripts: the copies under dist/assets/ and dist/data/ are gone

For one release, the one that brought the module entries, the build copied every script under
`assets/` and `data/` into `dist/` unchanged, and `src/boot.js` to `assets/boot.js`, so that a
page cached from before that deploy (the ten minutes above) still found `assets/site.js` and the
rest by name. The release after it, the npm dependencies (R0, item 7), removed the copies: the
`legacyScripts` plugin is gone from `vite.config.ts`, and `npm run check:dist` (`scripts`) now
fails a build that has anything at those paths. Every page cached before the module entries has
long expired, and the built pages name only `bundle/`.

### Cached HTML after the npm-dependencies deploy

The deploy that moved the fonts, KaTeX and supabase-js from their CDNs into the bundle changed
what every page loads: `bundle/all.css` gained the fonts' and KaTeX's rules, `bundle/all.js`
KaTeX's script and a new module (`src/vendor/katex.js`) that every page's entry chunk now calls
by name, and the pages lost their CDN tags. The names of the chunks did not change, so a page a
browser already holds finds its files; but for up to ten minutes after that deploy a browser can
hold this deploy's entry chunk with the previous deploy's `all.js`, or the other way round, and a
page on that mixed footing can fail to load its scripts (the inline boot script still runs, so
the theme is right) until the files are fetched again: the accepted case described above,
nothing more. No copies are kept for it, and a page from before the deploy that does load runs
KaTeX twice, once from its CDN tags and once from the bundle, to the same result.

### Cached HTML after the Three.js deploy

The deploy that moved Three.js from its CDN into the bundle (the last of the npm dependencies)
changed no chunk's name: `assets/three-loader.js` is still in `bundle/home-chapter.js`, and now
imports a new chunk, `bundle/three.js`, on demand, which only that import fetches. A page a
browser holds from before the deploy runs the old loader, which fetches the pinned 0.160.1
build from its CDN as it did, and never asks for `bundle/three.js`; a page from after it, on a
cached `home-chapter.js` from before, does the same. Either way the course map draws (it is in
`home-chapter.js` with the loader, so the two are always of one version), and the site makes
no request of its own to a CDN once every page has expired (ten minutes). The chapter scenes
are the one thing the window touches: `assets/scenes3d.js` is in `bundle/chapter.js`, so a
chapter page can pair a `chapter.js` of one version with a `home-chapter.js` of the other, and
then the loader puts the library where the other version's scenes do not look (`window.THREE`
before, `BM3D.THREE` after). The scenes catch that and stay on the flat SVG painter, which is on
screen from the first paint anyway, with nothing said in the console, until the stale chunk is
fetched again. Nothing is kept for it. One thing to know when reading the loader's reasons:
`BM3D.why` still says `cdn` when the chunk could not be fetched or run, since the checks and
the map read that string; it no longer means a CDN.

### Cached HTML after the game-frame deploy

The deploy that brought the dark game frame and the token file (`src/styles/tokens.css`) added
a stylesheet to every page, but every page kind links it, so it went into `bundle/all.css` with
`site.css`, and no file was renamed. For the ten minutes, a page from before the deploy with the
new `all.css` gets the new look: its old boot script stamps no `data-panel`, and with none the
panel is the light paper, which is the default anyway. A page from after it with an `all.css`
from before gets the old look, with the boot script's `data-panel` doing nothing, until the
stylesheet is fetched again. Either way nothing breaks and nothing is kept for it. A reader who
chose the dark panel (`bm.prefs.v1` `panel: "dark"`) keeps the choice; there was no such choice
before this deploy, so a reader of the dark theme now sees light paper in a dark frame.

### Cached HTML after the HUD deploy

The deploy that made the HUD and the settings sheet part of every page's top bar
(`tools/lib/shell.js`, with the HUD script after it) renamed no file either, so for the ten
minutes both mixes can happen, and neither loses anything a reader saved:

- A page from before it with the bundle from after it has the old top bar, which the game layer
  used to build its HUD into and no longer does: for those minutes it shows no HUD and no menu
  button. Its scripts run, because the bundle installs `window.BMHud` itself where no HUD script
  put it (`src/hud/install.js`); without that, `site.js` could not have counted the XP of an
  answer given on such a page. The `hud` suite of `check-browser.js` loads a chapter with the
  HUD script taken out and holds it to earning XP.
- A page from after it with a bundle from before it has the new top bar and the old `game.js`,
  which rebuilds the HUD its own way and cannot open the new sheet: the menu button does
  nothing until the bundle is fetched again. Settings chosen before are kept: the new ones
  (`volume`, `motion`, `transparency`, `gfx` in `bm.prefs.v1`) are keys the old `game.js`
  passes through untouched (R0's carry-through), and the boot script, which is in the page,
  stamps them.

### The Pages source: GitHub Actions, set before the page-shell change is merged

The Pages source is a repository setting and not a file, so it is set by hand:

1. Settings → Pages → Build and deployment → Source.
2. Set it to **GitHub Actions**. (Before the build existed the site used **Deploy from a
   branch**, `main`, `/ (root)`, which publishes the repository's files as they are.)
3. Actions → CI → **Run workflow**, on `main`. When the run has finished, load the site.

**Do this before the pull request that brings the page shell is merged, not after.** With the
source still on "Deploy from a branch", that merge puts the incomplete pages in front of readers
at once, and they stay there until the source is changed and a run has deployed. Setting the
source first is safe at any time after the toolchain release is on `main`: the workflow then
publishes `dist/`, which is the same site.

From the page-shell change on, a run on `main` while the source is anything but GitHub Actions
fails in `pages-source`, with a message saying what to set, and deploys nothing. That step could
not be tried before the change reached `main`; the first run there is its test. In the toolchain
release it was a notice and a skipped deploy, which was right while the branch was still a site.

**There is no switching back.** "Deploy from a branch" was a fallback while the repository root
was a working site. It is not one any more, and setting it now publishes the broken pages. Undo a
deploy by reverting the commit ([7.2](#72-a-bad-deploy)).

### Re-running and triggering a deploy

- **Manual trigger:** Actions tab → CI → **Run workflow**, on `main`. It runs everything again
  and deploys, without a new commit.
- **Re-run:** Actions tab → CI → the run → **Re-run jobs** → **Re-run all jobs** (or
  **Re-run failed jobs**). A re-run uses the same commit as the original run, and is possible for
  30 days after it. With the GitHub CLI: `gh run rerun <run-id>`, adding `--failed` for only the
  failed jobs. The `deploy` job of a re-run publishes only when that commit is still the newest on
  `main`; a re-run of an older run fails there instead of putting an older site over a newer one.

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
| Pausing | "Free projects are paused after 1 week of inactivity" (pricing); "low activity in a 7-day period" (production checklist) | A paused project answers nothing: no sign-in, no sync. It is restored from the dashboard; the page read gives a 1-year window for that | [pricing](https://supabase.com/pricing), [production checklist](https://supabase.com/docs/guides/platform/going-into-prod), [restore window](https://supabase.com/docs/guides/platform/upgrading) |
| Edge Function invocations | 500,000 a month included | Nothing today: there are no functions. Billing and the tutor **[not yet: R5]** will each cost an invocation per call | [pricing](https://supabase.com/pricing), [billing](https://supabase.com/docs/guides/platform/billing-on-supabase) |
| Edge Function run limits | 256 MB memory, 2 s CPU time, 150 s wall clock on Free, 100 functions per project | The tutor function **[not yet: R5]** waits on a model reply, so the wall-clock limit is the one it can reach | [function limits](https://supabase.com/docs/guides/functions/limits) |
| Monthly active users | 50,000 | Far off | [pricing](https://supabase.com/pricing) |
| Egress | 5 GB a month | Every sync reads the reader's whole row | [pricing](https://supabase.com/pricing) |
| Backups | Automatic backups are not included | Nothing restores the `attempts` log if it is lost | [pricing](https://supabase.com/pricing) |
| Log retention | 1 day for API and database logs | Look at the logs the day something breaks | [pricing](https://supabase.com/pricing) |
| Free projects | 2 | | [pricing](https://supabase.com/pricing) |

When a Free quota is exceeded, Supabase's
[billing FAQ](https://supabase.com/docs/guides/platform/billing-faq) (read 2026-10-04) gives the
sequence: "You will be notified when you exceed the Free Plan quota", then a grace period, then
service restrictions under the fair use policy. The restrictions it lists are pausing the
project, switching the database to read-only, blocking new projects and transfers, and answering
every API request with status 402. Service comes back by bringing usage under the quota or
changing the plan. To the site, a pause, read-only mode and the 402 all look like "sync failing
for everyone" ([7.1](#71-sync-is-failing-for-everyone)).

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

- **Pausing.** Supabase's production checklist says it "may pause applications on the Free Plan
  that exhibit low activity in a 7-day period". How low is not stated, so assume a week in which
  no signed-in reader syncs is enough. Do not count on a warning: the pages read do not promise an
  email before a project is paused. Once a week, open the dashboard or sign in on the live site
  and read the sync line; a paused project shows as paused in the dashboard and is restored there.
- **The account page.** Sign in on the live site now and then and read the sync line.

## 4. Secrets

**None of these ever goes into this repository.** [`assets/config.js`](assets/config.js) is
served to every visitor: it holds the project URL and the publishable (anon) key, which are meant
to be public, and must never hold anything else. Row-level security is what protects the data, not
that key.

| Secret | Exists | Where it lives | Created at |
| --- | --- | --- | --- |
| Sign-in services' client secrets (Google, GitHub) | today | Supabase dashboard → Authentication → Sign In / Providers | each service's developer console |
| Supabase service-role / secret key | today, unused by the site | Supabase only. Edge Functions are given it by Supabase; it is never copied anywhere | Supabase dashboard → Project Settings → API Keys |
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
| Watch Supabase usage and pausing | now | usage monthly, pausing weekly | [Section 3](#what-to-watch) |
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
4. **Every request is answered with status 402:** a Free quota has been exceeded and the grace
   period is over ([section 3](#free-plan-limits-that-matter-here)). Open the organization's Usage
   page in the dashboard to see which one; service returns when usage is back under the quota or
   the plan is changed.
5. **Writes are refused but reads work:** check the database size ([section 3](#what-to-watch)).
   Over 500 MB the Free plan is read-only; Supabase's
   [database size page](https://supabase.com/docs/guides/platform/database-size) gives the steps
   to delete data and leave read-only mode.
6. **It started right after a merge:** treat it as a bad deploy (7.2).
7. **Sign-in fails, rather than sync:** check the redirect allow-list
   ([section 3](#the-auth-redirect-allow-list)) and whether a sign-in service's secret has
   expired or been deleted.
8. Last resort, if it cannot be fixed soon and the errors are doing harm: set `supabaseUrl` and
   `supabaseAnonKey` to `""` and deploy. Accounts are off and the site works as it does for a
   signed-out visitor. Put the values back when the cause is fixed.

Afterwards, write down what happened and add the missing step to this file.

### 7.2 A bad deploy

1. Confirm it is the deploy: load the live site in a private window and compare with the last
   merge.
2. Revert the merge commit on `main` (GitHub's **Revert** button on the merged pull request opens
   a pull request that does it) and merge the revert. The previous site is built and deployed by
   that merge's run.
3. There is no quicker way back. Re-running the last good run does not redeploy it: once `main`
   has moved on, the `deploy` job of an older run refuses. And setting the Pages source to
   "Deploy from a branch" publishes the repository's files, which are not a complete site
   ([section 2](#2-github-pages)).
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
