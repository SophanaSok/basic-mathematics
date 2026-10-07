# Operations

A runbook for the one person who runs this site. It covers what has to be done by hand, in what
order, and what to do when something breaks.

Parts of it describe things the plan introduces in later releases (R0 to R5). Those parts are
marked **[not yet: Rn]** with the release that brings them. Anything unmarked is true of the
repository today. Where a step will need a command from a tool that is not in the repository yet,
it says so instead of guessing the command.

Contents: [1. Releasing a change that needs SQL](#1-releasing-a-change-that-needs-sql) ·
[2. Deploys](#2-deploys) · [3. Supabase](#3-supabase) · [4. Secrets](#4-secrets) ·
[5. Recurring duties](#5-recurring-duties) · [6. Kill switches](#6-kill-switches) ·
[7. Incidents](#7-incidents) · [8. Hosting](#8-hosting)

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

## 2. Deploys

The course is served from one place: **Cloudflare Pages, at <https://learn.groundupmath.org>**
([section 8](#8-hosting) is the runbook for the hosting). GitHub Pages, at the old address
<https://sophanasok.github.io/basic-mathematics/>, serves only `dist-redirects/`
(`tools/build-redirects.js`): one small page per page path that sends its reader to the same page
at the new address, and nothing of the course.

### How it deploys

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) builds the site into `dist/` and deploys
that. A push to `main` (merging a pull request) triggers it, unless it changes only Markdown and
`docs/` ([When CI runs](#when-ci-runs)), and so does **Run workflow** on `main`. Its jobs are `build` (the Node checks, the build, the checks on `dist/`, the redirect site
and its checks), `browser` (the Chromium checks that need no WebGL, as one job per part, side by
side, today `browser (axe)`, `browser (pages)`, `browser (exercises)` and `browser (rest)`; the
parts are `PARTS` in `tools/check-browser.js`, [`tools/README.md`](tools/README.md)), `webgl`
(the 3D checks, retried, outside the gate), `cloudflare`, which publishes that run's `dist/` to
Cloudflare Pages once `build` and every `browser` job have passed (production from `main`, a
preview under `pr-<number>` from a pull request), `pages-source` (asks GitHub which Pages source
is set) and `deploy`, which publishes `dist-redirects/` to GitHub Pages after the same jobs. A
failed `browser` job is re-run like any other (**Re-run failed jobs** re-runs only that part).

**The files in the repository are not the site.** Since the page-shell change (R0, item 5) a
page in the repository holds its content and two markers. Its `<head>` (every stylesheet and
script) and its top bar are written by the build
([README, "The shell of a page"](README.md#the-shell-of-a-page)), and since the module entries
(R0, item 6) its scripts are bundled from `src/entries/<kind>.js` into chunks under
`dist/bundle/`. Published as they are, the pages have no styles, no scripts and no top bar.
`dist/` is the only thing that can be published.

### What a deploy does to a page a browser already holds

Cloudflare Pages sends every page, script and stylesheet with `Cache-Control: public, max-age=0,
must-revalidate` (`dist/_headers`, `tools/lib/headers.js`): a browser asks again each time it
loads one, so a page loaded after a deploy gets that deploy's files. What can still be from
before it is a page that was already open, or that the browser restores from its back/forward
cache, and that page asks for what it loads later (a chunk imported on demand: the course
world, Three.js, supabase-js) by name. **Nothing in `dist/` is named by a hash, on purpose.** A
chunk is `bundle/<kinds>.js`, named by the page kinds that load what is in it (`bundle/all.js` for what every page loads, `bundle/chapter.js` for what only chapters load,
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

What a deploy can still take from such a page: **adding, removing or renaming a script or
stylesheet, or changing which page kinds load one**, renames a chunk or the function another
chunk imports from it, and a page that holds the old graph then fails to load what it fetches
later (the inline boot script has run, so the theme is right) until it is reloaded. That is
accepted: it is rare, it lasts only as long as that page stays open, and it cannot be avoided
without keeping the previous deploy's chunks, which the build does not have. Do not
try to work around it by hand. If such a change must not touch a reader mid-session, deploy it
at a quiet hour.

The deploy notes below were written while GitHub Pages served the course with
`Cache-Control: max-age=600`, so each speaks of a ten-minute window after its deploy. That window
is over for all of them; on Cloudflare Pages the same mixes can only happen on a page left open
across a deploy (above).

### Deploy R0 before R1: the help ladder's `rung`

R1 (the help ladder, item 8) adds a field to every exercise's attempt record that a reader opens
a clue on: `rung`, the highest clue opened while the exercise was unsolved, synced like the rest
of `bm.attempts.v1` and merged by the larger number (`assets/account.js` `maxRung`). It needs no
SQL: it lives inside the `attempts` column's JSON.

**Deploy R0 (the sync hardening that carries unknown fields through a merge) first, and let it
be live for a while, before R1.** A copy of the site from before R0 (a tab left open, a browser
holding last week's scripts, another device) rebuilds each attempt record from the fields it
knows when it merges, so it drops `rung` and writes the record back without it. From R0 on, a
copy that does not know a field carries it. What such a loss costs is small and bounded: the
clues a reader had opened show closed again on their next visit, and a right first answer after
clue 2 or 3 opened on another device can pay the first-time rate. It never touches solved work,
XP, medals, hearts or the attempt log, and it mends itself as soon as that reader opens the clue
again on a current copy.

The R1 deploy also adds a stylesheet (`bundle/chapter.css`, from `assets/ladder.css`) and new
modules in `bundle/chapter.js`: the case in the section above. For the ten minutes a chapter page
from before the deploy can meet a `chapter.js` from after it, its clues are drawn without their own
stylesheet (as a plain ghost button and the hint panel `game.css` already styles) or, the other
way round, it has no clue button; either way the card grades as before.

### The due review and the next-step card (R1 item 13)

No SQL and no new synced field: the due review reads the Arena boxes `bm.game.v1.sec` already
holds, and the two new values (`arenaDay`, the day's Arena XP counts, and `nextHide`, the day the
next-step card was hidden) live in `bm.run.v1`, which never leaves the device. A sign-out or a
reset empties that store, so each one starts the day's XP counts again, as many times as it is
done, and so does setting the device clock forward to another day. That is accepted: the counts
only slow XP for practice massed into one day, XP buys nothing and is compared with no one, and
keeping the counts across a sign-out would charge the next person to sign in on that device
for the last one's practice.

The deploy moves files between chunks, the case two sections up. The review's modules
(`src/learn/recall.ts`, `review.ts`, `practice.ts`, `constants.ts`, `src/data/arena-sections.ts`
and `src/ui/review.ts`, which puts them up as `window.BMReview`) are in every entry, so they go
into `bundle/all.js` beside `game.js`, which needs them; the card (`src/learn/next.ts`,
`src/ui/next.ts`) goes into `bundle/home-chapter.js`; and a new stylesheet, `assets/review.css`,
is linked on the contents page, the Arena and the chapters. `constants.ts` was in
`bundle/chapter.js` and is now in `all.js`, so for the ten minutes a cached page can pair chunks
of the two deploys, a chapter page can fail to load its scripts (a new `chapter.js` asks the old
`all.js` for a function it does not have), the accepted case above. Short of that, a page
without the new stylesheet draws the card unstyled, and an Arena page whose `all.js` has no
`BMReview` says "The problem generators did not load" until it is reloaded. Nothing is lost
either way: no saved state changes shape.

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

### Cached HTML after the view-transitions deploy

The deploy that brought the fade between pages (README, "Between pages") renamed no file: the
opt-in is inline in every page's `<head>` and the rest is in `game.css`, inside
`bundle/all.css`. A transition needs both pages to opt in, so for the ten minutes a page from
before the deploy never has one, coming or going. A page from after it with an `all.css` from
before it opts in but has none of `game.css`'s rules for it, so the browser's own cross-fade of
the whole page runs (about a quarter of a second, the header fading with the rest); its boot
script is the new one, so Study mode and Reduce motion still skip it, and reduced motion on the
device never opts in. Nothing is stored for it and nothing can break. To take the fade off
everywhere, remove `OPT_IN` from `tools/lib/shell.js`'s head and deploy; every page then
navigates as before.

### Cached HTML after the course-world deploy

The deploy that grew the course map into the course world (README, "The course world") renamed
no file and added one chunk, `bundle/world.js`, which only `assets/map3d.js`'s `import()`
fetches. `map3d.js` and the module it now needs before anything 3D is fetched
(`src/world/tiers.ts`) are both in `bundle/home.js`, so they are always of one version. For the
ten minutes:

- A contents page from before the deploy runs the old map from its cached `home.js` and never
  asks for `bundle/world.js`; it draws the old map, beside the list as it was laid out then.
- A page from after it with a `home-chapter.js` from before has the old loader, which does not
  say the WebGL renderer's name (`BM3D.renderer`): a software renderer then reads as a hardware
  one and gets the medium tier instead of low, and the watchdog steps it down if it is slow.
- The settings sheet's Graphics quality Low used to keep the list; it is the world's low tier
  now, and the 3D course map switch is what keeps the list. That meaning of Low was never on
  `main` (the setting arrived on the branch before this one), so no deployed reader has it
  stored. Should one have it, the world is drawn at its lowest, and if even that is too slow the
  watchdog gives the list back and keeps it (`gfxAuto: "list"`, whether or not the quality was
  chosen), so the cost is paid once, not on every visit.
- A low-end device (2 GB of memory or less) got the list by default before; it gets the low tier
  now, as the plan's tier rule says, and the watchdog takes it to the list if it is too slow.
- `bm.prefs.v1` gains `gfxAuto`, written by the watchdog. A tab from before the deploy keeps it
  through its own writes (R0's unknown-key rule) and does not read it.

Nothing is kept for it. A later deploy that changes what `src/world/index.ts` exports is the
case to watch: a contents page left open from before it, whose `home.js` then fetches the new
`world.js`, would find the two disagreeing, and fall back to the list (`BMMap3D.why()` says
`error`) until it is reloaded; keep the exports' names when changing the world, or accept that.

### The Pages source: GitHub Actions

The GitHub Pages source is a repository setting and not a file: Settings → Pages → Build and
deployment → Source must be **GitHub Actions** (it is). With **Deploy from a branch**, GitHub
Pages would publish the repository's own files at the old address, the course's pages without
their head and top bar, in place of the redirects. A run on `main` while the source is anything
but GitHub Actions fails in `pages-source`, with a message saying what to set, and deploys
nothing to GitHub Pages. If the source was changed, set it back and use **Run workflow** on
`main`.

### Re-running and triggering a deploy

- **Manual trigger:** Actions tab → CI → **Run workflow**, on `main`. It runs everything again
  and deploys, without a new commit.
- **Re-run:** Actions tab → CI → the run → **Re-run jobs** → **Re-run all jobs** (or
  **Re-run failed jobs**). A re-run uses the same commit as the original run, and is possible for
  30 days after it. With the GitHub CLI: `gh run rerun <run-id>`, adding `--failed` for only the
  failed jobs. The `cloudflare` job of a re-run deploys to production only when that commit is
  still the newest on `main`; a re-run of an older run fails there instead of putting an older
  site over a newer one, and `npm run check:ci` (`rerun`) fails if that step is taken out. The
  `deploy` job does the same for the redirect site.

GitHub's pages on this, read 2026-10-04:
[publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site),
[re-running workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

### When CI runs

`ci.yml` runs for every pull request and every push to `main` **except one that changes only
Markdown and `docs/`** (`paths-ignore: ["**/*.md", "docs/**"]` on both events). Such a change
costs no Actions minutes (a full run is about 30), gets no Cloudflare preview, and deploys
nothing, which is right: `dist/` and `dist-redirects/` are built from none of those files, so
production already matches it.

- **What still runs CI:** any change with at least one other file in it. For a pull request
  GitHub compares the whole pull request with its base, so a Markdown-only push to a pull request
  that also changes code still gets a full run.
- **Why these files are safe to skip:** no check reads `README.md`, `OPERATIONS.md` or anything
  in `docs/` (they are named only in comments and messages), and the migrations check passes over
  `supabase/migrations/README.md`. `npm run check:ci` (`skip`) keeps it so: it fails if either
  list changes, if there is a Markdown file in `public/` (copied into `dist/` as it is, so it
  would be published), `src/`, `assets/`, `data/` or `parts/`, and if `docs/` holds anything
  but Markdown.
- **Required checks:** `main` has no branch protection and no ruleset (checked 2026-10-06). If a
  CI job is ever made a required check, a Markdown-only pull request never gets it and waits on
  "Expected" forever (GitHub: a workflow skipped by path filtering leaves its checks pending);
  then replace `paths-ignore` with GitHub's documented alternative, a job that always runs and
  reports, with the expensive jobs skipped by a job-level `if:`.
- **To run it anyway** (for instance to republish): **Run workflow** on `main`, which has no path
  filter.

GitHub's page, read 2026-10-06:
[path filters](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore).

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

The values are in [8.4](#84-sign-in-supabase-google-and-github): the Site URL is
`https://learn.groundupmath.org/`, and the Redirect URLs are the `account.html` of each address
the site is served from (learn, the project's `pages.dev` address and its previews) and
`http://localhost:8000/account.html` for local work. If the site is ever served from another
address (a new domain, a different local port), add its `account.html` here **before** the
change. The sign-in services' own callback URL is Supabase's and does not change (see "Sign-in
providers" in [`supabase/README.md`](supabase/README.md)).

Every address the site hands Supabase is built from the page's own address, never written in:
`assets/account.js` `pageUrl()` resolves `account.html` against `window.location`, for the
password sign-up, the email link, the services' buttons and the password reset alike. So the
same build sends readers back to `account.html` on whichever address it is served from: learn, a
preview, or `localhost:8000`. Each of those works only while it is on the
list.

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
| Cloudflare API token (`CLOUDFLARE_API_TOKEN`) and account ID (`CLOUDFLARE_ACCOUNT_ID`) | today ([section 8](#8-hosting)) | GitHub → the repository → Settings → Secrets and variables → Actions → Secrets. Only the `cloudflare` job of CI reads them | Cloudflare dashboard → Manage account → Account API Tokens; one permission, Account · Cloudflare Pages · Edit |
| Supabase service-role / secret key | today, unused by the site | Supabase only. Edge Functions are given it by Supabase; it is never copied anywhere | Supabase dashboard → Project Settings → API Keys |
| Anthropic API key for the hint pipeline | **[not yet: R2]** | an environment variable on the owner's machine while `tools/hints/` runs | Anthropic Console |
| Stripe secret key | **[not yet: R5]** | Supabase Edge Function secrets | Stripe dashboard |
| Stripe webhook signing secret | **[not yet: R5]** | Supabase Edge Function secrets | Stripe dashboard, on the webhook endpoint |
| Anthropic API key for the tutor | **[not yet: R5]** | Supabase Edge Function secrets | Anthropic Console, in the workspace that carries the spend limit |

Edge Function secrets are set on the dashboard's "Edge Function Secrets" page or with the
Supabase CLI. The CLI is not part of this repository yet, so no command is given here; the
release that adds the first function adds the exact steps. Supabase's page:
[function secrets](https://supabase.com/docs/guides/functions/secrets).

To rotate the Cloudflare token: create a new one with the same permission, replace the
`CLOUDFLARE_API_TOKEN` secret, run CI on `main` (Run workflow) and check the `cloudflare` job
deployed, then delete the old token in Cloudflare. A leaked one can deploy any content to the
site, so revoke it at once ([7.3](#73-a-leaked-key)).

The GitHub Pages deploy (the redirect site) needs no secret of its own. If a later release has GitHub Actions deploy
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
| Keep `groundupmath.org` renewed | from the purchase | yearly; auto-renew on | Porkbun → Domain Management → the domain → Auto Renew on, with a card that will still be valid. A lapsed domain takes the site and every reader's saved progress with it, and lets someone else take the name. The bare domain and `www` forward to `learn` (Porkbun URL Forwarding, [8.3](#83-the-custom-domain-and-the-bare-domain)); after any DNS change there, rerun 8.3's check |
| Watch GitHub Actions minutes | once the repository is private | a week after, then monthly | GitHub → Settings → Billing → Usage. A private repository's runs use the account's included minutes; one full run of CI is about 30 billed minutes, and a change to only Markdown and `docs/` starts none ([When CI runs](#when-ci-runs)). Without a payment method GitHub blocks runs past the quota rather than billing them. If it is tight, run the `webgl` job only when 3D files change |
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
3. The quicker way back is Cloudflare's: the project's Deployments tab lists every production
   deployment, and **Rollback to this deployment** on an earlier one serves it again at once
   ([8.7](#87-rolling-back)); Cloudflare's page does not say whether a Direct Upload deployment
   can be a target, so if it refuses, the revert is the way back. Revert on `main` as well, or
   the next push deploys the bad change again. Re-running the last good run does not redeploy it: once `main` has moved on, the
   `cloudflare` job of an older run refuses.
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

## 8. Hosting

The course is served from one place: **Cloudflare Pages, at `https://learn.groundupmath.org`**.
The domain `groundupmath.org` is registered at Porkbun, and its DNS stays there: one CNAME record,
`learn`, points at the Pages project. CI uploads each build of `main` to the project as
production (Direct Upload: GitHub Actions builds and checks, Cloudflare only serves), and each
pull request as a preview. GitHub Pages, at the old address
`https://sophanasok.github.io/basic-mathematics/`, serves only redirects
([8.6](#86-the-old-address-redirects-on-github-pages)): no code of the course runs there, and
nothing of a reader's moves from there. A browser keeps `localStorage` per origin, so whatever a
browser once saved at the old address stays in that browser, at that address.

The values used below, in one place:

| What | Value |
| --- | --- |
| The address | `https://learn.groundupmath.org` (`ORIGIN` in [`tools/build-redirects.js`](tools/build-redirects.js), where the redirects point) |
| Old address | `https://sophanasok.github.io/basic-mathematics/`: redirects only |
| Cloudflare Pages project | `groundupmath` (the default of the variable `CLOUDFLARE_PROJECT_NAME`, written once, in the `cloudflare` job of `.github/workflows/ci.yml`) |
| Its own address | `https://groundupmath.pages.dev` |
| Previews | `https://pr-<number>.groundupmath.pages.dev` (one per pull request, whatever its branch) and `https://<hash>.groundupmath.pages.dev` |
| Repository secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Repository variables | `CLOUDFLARE_PROJECT_NAME` (optional, default `groundupmath`) |
| Supabase project | `https://jfidvrzonyzfstnykzly.supabase.co` (`assets/config.js`) |

Documentation read for this section on 2026-10-05: Cloudflare Pages
[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/),
[Direct Upload with CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/),
[headers](https://developers.cloudflare.com/pages/configuration/headers/),
[serving](https://developers.cloudflare.com/pages/configuration/serving-pages/),
[previews](https://developers.cloudflare.com/pages/configuration/preview-deployments/),
[rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/),
[wrangler pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/);
[cloudflare/wrangler-action](https://github.com/cloudflare/wrangler-action) v4.1.3 (wrangler
4.147.0, pinned in the workflow); Supabase
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls); GitHub
[secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
and [token permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens);
Porkbun [URL forwarding](https://kb.porkbun.com/article/39-how-to-set-up-url-forwarding).

### 8.1 Cloudflare account, token and GitHub settings

**Done** (by 2026-10-05): the Cloudflare account, the token, and the repository secrets
`CLOUDFLARE_API_TOKEN` (one permission, **Account** · **Cloudflare Pages** · **Edit**, this
account only) and `CLOUDFLARE_ACCOUNT_ID`. Set the variable `CLOUDFLARE_PROJECT_NAME` only if
the project is ever called something other than `groundupmath`.

**Check it is still so:** the repository → Settings → Secrets and variables → Actions lists both
secrets; Cloudflare → Manage account → **Account API Tokens** lists the token as active, with
that one permission (and an end date, if you gave it one: put it in your calendar). Two-factor
authentication is on (My Profile → Authentication). Every deploy (8.2) is the token's test.

**To redo it** (a lost or expired token): Manage account → Account API Tokens → **Create Token**
→ *Custom token* **Get started**; one permission row, **Account** · **Cloudflare Pages** ·
**Edit**; Account Resources *Include* this account; no IP filter (GitHub's runners have no fixed
address). Copy it (it is shown once) into the secret `CLOUDFLARE_API_TOKEN`. The account ID is the
32-character hexadecimal string after `dash.cloudflare.com/` in the dashboard's address.

**Undo:** delete the two secrets; the `cloudflare` job goes back to a notice. Revoke the token in
Cloudflare.

### 8.2 The Pages project (Direct Upload)

**Done** (by 2026-10-05): the project `groundupmath`, created in the dashboard as a Direct
Upload project, at `https://groundupmath.pages.dev`, with production deployed from `main`.
Direct Upload is permanent: such a project can never be switched to Cloudflare's Git
integration. That is the intent: GitHub Actions builds, checks and uploads, and Cloudflare only
serves.

1. **The production branch must be `main`.** wrangler makes a deploy production only when the
   branch it is given equals the project's production branch, and otherwise makes it a preview
   without an error; the custom domain serves production only. A Direct Upload project has no
   setting for this in the dashboard (Cloudflare's [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
   page, *Production branch configuration*), so read it, and set it if needed, with the API, in
   a terminal of your own. The token needs Cloudflare Pages Edit: the one in the secret is shown
   only once, so if you no longer have it, make a second one as in 8.1 with an end date of
   tomorrow, and delete it afterwards.
   ```sh
   read -rs TOKEN      # paste the token; it is not shown and not kept in the shell history
   ACCOUNT=<the account ID>
   curl -s -H "Authorization: Bearer $TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/pages/projects/groundupmath" \
     | /usr/bin/jq '.success, .result.production_branch, .result.subdomain'
   ```
   It prints `true`, the production branch, and the project's own address. If the branch is not
   `"main"`:
   ```sh
   curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     --data '{"production_branch":"main"}' \
     "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/pages/projects/groundupmath" \
     | /usr/bin/jq '.success, .result.production_branch'
   unset TOKEN
   ```
   The workflow checks this as well: a deploy of `main` that Cloudflare did not make production
   fails the `cloudflare` job with this same fix in its error.
2. **How it is deployed.** Every pull request from a branch of this repository deploys as a
   preview, at `https://pr-<number>.groundupmath.pages.dev` (under `pr-<number>`, never under its
   branch's name, so none can reach production), and the run comments that address on the pull
   request. Production follows each merge to `main`. **Run workflow** on `main` deploys again
   without a new commit.

**Verify:** after a pull request's run, its `cloudflare` job is green and its summary says
*Cloudflare Pages: preview (groundupmath, branch pr-<number>)*; the preview address opens the
course. After a merge, the `main` run's summary says *Cloudflare Pages: production
(groundupmath, branch main)*. Open `https://groundupmath.pages.dev/`: the course, working. In a
terminal, `curl -sI https://groundupmath.pages.dev/ | grep -i -E 'content-security-policy|cache-control'`
shows the policy and `public, max-age=0, must-revalidate` (from `dist/_headers`). **Undo:**
Workers & Pages → the project → Settings → **Delete project** (it deletes every deployment); the
workflow then fails at the deploy until the secrets are removed too.

### 8.3 The custom domain, and the bare domain

**Done** (by 2026-10-05): the custom domain `learn.groundupmath.org` is set up on the project,
and Porkbun's DNS has the record `learn` CNAME `groundupmath.pages.dev` (public DNS shows it).
Cloudflare's order was kept: the domain on the project first, then the DNS record.

1. **Check it.** Workers & Pages → `groundupmath` → **Custom domains** lists
   `learn.groundupmath.org` as *Active*, with a certificate. `dig +short CNAME
   learn.groundupmath.org` prints `groundupmath.pages.dev.`.
2. **Porkbun's parking records** (an `ALIAS` for the bare domain and a `*` CNAME, both to
   `pixie.porkbun.com`) were **deleted on 2026-10-06**. Until then the bare domain showed
   Porkbun's parking page over HTTP and failed the TLS handshake over HTTPS. Porkbun's
   instructions say to remove records that conflict with a URL forward before adding one. The
   DNS list now holds only `learn` CNAME `groundupmath.pages.dev`; the forwards in step 3 add
   their own records, which the DNS list does not show. Do not add an `ALIAS`, `A` or `*` record
   for the bare domain or `www` while the forwards exist.
3. **The bare domain and `www`** (**done** 2026-10-06; required, since a visitor who types the
   domain must not land on a parking page or a certificate error): Porkbun's free URL
   forwarding sends both to the site. Domain Management → the domain → Details → **URL
   Forwarding** (edit), two forwards, each with Forward Traffic To
   `https://learn.groundupmath.org`, **Wildcard Forwarding off**, and under advanced settings
   **Permanent Redirect (301)** and **Include the requested URI path**:
   - Hostname empty (the bare domain);
   - Hostname `www`.

   Wildcard forwarding is **ticked by default**: untick it, or the forward also takes `learn` and
   the site goes down. Porkbun warns that the domain "already has DNS records for another
   service" (that is `learn`); with wildcard off the warning does not apply. The *Current
   Forwards* table then lists both hosts as `permanent`, path `yes`, wildcard `no`. HTTP
   redirects at once; HTTPS needs the certificate Porkbun issues for the forward:
   on 2026-10-06 it took about 5 minutes. It is a Let's Encrypt certificate for
   `groundupmath.org` and `*.groundupmath.org`, valid 90 days, and Porkbun renews it while the
   domain uses Porkbun's DNS. Until it exists, HTTPS on these names gets no answer at all.

**Verify:** `https://learn.groundupmath.org/` opens the course with a padlock;
`curl -sI https://learn.groundupmath.org/about.html` answers a redirect (3xx) with
`location: /about` (Pages' own redirect to the address without `.html`); and the bare domain
and `www` redirect, keeping the path, over both schemes:
```sh
for u in http://groundupmath.org/ https://groundupmath.org/ https://groundupmath.org/about \
         http://www.groundupmath.org/ https://www.groundupmath.org/arena; do
  echo "$u -> $(curl -s -o /dev/null -m 10 -w '%{http_code} %{redirect_url}' "$u")"; done
```
Every line prints `301 https://learn.groundupmath.org/<the same path>`; `000` means no answer
(over HTTPS: no certificate yet). **Undo:** delete the CNAME at Porkbun and remove the domain
in the project's Custom domains (Cloudflare's order: DNS record first, then the domain); delete
the two URL forwards.

### 8.4 Sign-in: Supabase, Google and GitHub

The site builds every sign-in address from its own location (section 3, "The auth redirect
allow-list"), so nothing in the code names an address; only these lists do. The old address
serves no page that signs anyone in, so it has no entry in any of them.

1. **Supabase** → the project → Authentication → **URL Configuration**.
   - *Site URL*: `https://learn.groundupmath.org/`. Supabase uses it when a request names no
     address, and in the emails it sends. While `emailDelivery` is `false` in `assets/config.js`
     no email goes out; before turning it on, check the email templates use
     `{{ .RedirectTo }}` rather than `{{ .SiteURL }}`.
   - *Redirect URLs*:
     - `https://learn.groundupmath.org/account.html`
     - `https://groundupmath.pages.dev/account.html` (the project's own address from 8.2)
     - `https://*.groundupmath.pages.dev/**` (previews: `*` stands for one label, which is what a
       preview's branch or hash is)
     - `http://localhost:8000/account.html` (local work)
2. **Google** → Google Cloud console → Google Auth Platform → **Clients** → the web client →
   *Authorized JavaScript origins*: `https://learn.groundupmath.org` (and
   `https://groundupmath.pages.dev`, if it was added to test there). *Authorized redirect URIs*
   is the Supabase callback, `https://jfidvrzonyzfstnykzly.supabase.co/auth/v1/callback`. Google
   takes no wildcards, so previews are not listed: Google sign-in on a preview fails at Google,
   which is expected. Google says a change can take from five minutes to a few hours.
3. **GitHub** → Settings → Developer settings → OAuth Apps → the app: its callback is Supabase's,
   so nothing there depends on the address; the *Homepage URL* is
   `https://learn.groundupmath.org`.

Any entry for `https://sophanasok.github.io` still in these lists (Supabase's Site URL and
Redirect URLs, Google's origins, GitHub's Homepage URL) was there for the course at the old
address: change or remove it.

**Verify:** on `https://learn.groundupmath.org/account.html`, sign in with Google, sign out, sign
in with GitHub; the account page says *Synced at …*. **Undo:** put back the entries you took out.

### 8.5 Checking the live site

On `https://learn.groundupmath.org` (and once on `https://groundupmath.pages.dev`):

1. **Pages and headers.** Open the contents page, a chapter, the Arena, progress, account; the
   3D world and a chapter's 3D figures appear. In the browser's console there is no
   *Content Security Policy* error. (CI already runs every browser check under this policy;
   this is the real server.) `curl -sI https://learn.groundupmath.org/ | grep -i -E 'content-security-policy|cross-origin-opener|cache-control'`
   shows the policy, `cross-origin-opener-policy: same-origin` and
   `public, max-age=0, must-revalidate` (from `dist/_headers`).
2. **Sign-in and sync.** As in 8.4's check; solve one exercise, and on a second browser signed
   in to the same account it is solved too.
3. **Rollback works** (worth trying once): the project → Deployments → the previous production
   deployment → ⋯ → **Rollback to this deployment**; the site serves it; then roll forward to
   the newest the same way. If Cloudflare refuses for a Direct Upload deployment, note it here:
   the way back is then the revert on `main` (7.2).

### 8.6 The old address: redirects on GitHub Pages

The `deploy` job publishes `dist-redirects/` (`tools/build-redirects.js`) to GitHub Pages on
every push to `main`, after the same gate as the `cloudflare` job: one page at the path of every
page of the site, whose one inline script sends the reader to the same page at
`https://learn.groundupmath.org` with the old address's query and fragment (so a link to an
exercise or to `arena.html?mode=review` still lands on it), and a `404.html` that sends any other
path (a folder, a mistyped address) to the front page. Each page has a canonical link to its new
address, robots `noindex`, a `<noscript>` refresh and a visible link for a browser without
scripts, and a Content-Security-Policy `<meta>` that lets nothing load but its own script.
`npm run check:redirects` holds `dist-redirects/` to that, and `npm run check:ci` fails a
workflow that would publish anything else to GitHub Pages. GitHub Pages needs its source set to
**GitHub Actions** (section 2). It keeps serving the redirects when the repository is private (on
a paid plan, as the account's other private Pages site does).

**Verify** (after a push to `main`): the run's `deploy` summary says *GitHub Pages: redirects to
learn.groundupmath.org*, and
```sh
curl -s https://sophanasok.github.io/basic-mathematics/about.html | grep canonical
```
shows `https://learn.groundupmath.org/about`. In a browser,
`https://sophanasok.github.io/basic-mathematics/parts/1-algebra/02-linear-equations.html?x=1#e3`
lands on `https://learn.groundupmath.org/parts/1-algebra/02-linear-equations?x=1#e3`, and
`https://sophanasok.github.io/basic-mathematics/nope` on the front page.

**Taking the old address down** (whenever you choose; nothing depends on it): Settings → Pages →
**Unpublish site**, then remove the `pages-source` and `deploy` jobs and the redirect site's
build from the workflow in the same change, or every run on `main` warns that Pages is not
enabled. The same change removes what holds the workflow to that build, or `npm run check` fails
in the build job and stops the Cloudflare deploy with it: the `pages` check in
`tools/check-ci.js` and its row in `tools/README.md`, and `build:redirects` and
`check:redirects` from the npm scripts and `check:all` (`tools/build-redirects.js` and
`tools/check-redirects.js` can go too). Links to the old address then end at GitHub's own
not-found page.

### 8.7 Rolling back

| Stage | To undo it |
| --- | --- |
| 8.1 token and secrets | Delete the secrets (the `cloudflare` job goes back to a notice); revoke the token in Cloudflare |
| 8.2 project | Delete the project in Cloudflare (all its deployments go with it); delete the secrets so CI does not fail on the missing project. The site is then down: there is no other copy of it |
| 8.3 domain | Delete the `learn` CNAME at Porkbun, then remove the custom domain from the project; delete the URL forward |
| 8.4 sign-in lists | Put back the entries you changed or removed |
| A bad deploy on Cloudflare | Rollback in the project's Deployments (8.5), and revert the commit on `main` (7.2). Re-running an older run on `main` deploys nothing: its `cloudflare` job stops when `main` has moved on |
| A bad redirect site | Revert the commit on `main`; the next run publishes the previous `dist-redirects/` |
