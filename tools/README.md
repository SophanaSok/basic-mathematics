# tools/ — the verification harness

Three general scripts (the source tree, the built `dist/`, and the site in a browser), plus
focused ones for the 3D scenes, the Arena's generators and the game layer. They are plain Node
scripts, CommonJS (`tools/package.json` says so, because the repo's own `package.json` is
`"type": "module"`), and the repo's npm scripts are the way to run them:

```sh
npm ci                                     # once; then `npx playwright install chromium` for the browser ones
npm run check                              # ~15 s, no browser: typecheck, check-static, check-gen,
                                           # smoke-scenes, and the merge, sync and rules tests
npm run build && npm run check:dist        # dist/, and that it is the source's site
npm run test:browser                       # the tools/game Chromium scripts, ~2 min
npm run check:browser                      # check-browser.js on dist/, ~8 min
npm run check:all                          # all of it, in that order
```

`node tools/<script>.js` works just as well, and `npm run <name> -- --flag` passes a flag through.
Every script exits 1 on any failure. Run `npm run check` on every edit and the rest before a
push; CI (`.github/workflows/ci.yml`) runs all of it on every pull request.

## Which tree the browser scripts load

`check-browser.js` and the Chromium scripts under `game/` load the site over http from an
in-process server (`lib/serve.js`), on the tree `lib/target.js` picks:

- `--root=<dir>` or `BM_ROOT=<dir>` names it: `--root=dist` for the built site, `--root=.` for
  the source tree. `npm run check:browser` passes `--root=dist`, and CI sets `BM_ROOT=dist`.
- with neither, `dist/` when it has been built and nothing it is built from is newer than it (a
  page, a file under `assets/` or `data/`, `lib/shell.js`); otherwise the source tree, with a
  note saying which file is newer. So a script run straight after an edit never quietly tests an
  old build.

A source page is not a whole document: it holds two markers where `lib/shell.js` writes its
`<head>` and top bar ([The shell](#the-shell-libshelljs), below). `lib/serve.js` writes them as
it serves the page, the way the build does, so the source tree can be loaded without a build; a
page the shell refuses is answered with a 500 and the reason.

Each script prints the tree it is serving on its first line. `tools/fixtures/` is always served
from the source tree, at the same URL, and never copied into `dist/`; `/__base/<path>` is always
read from this checkout's git history, a marked page there written by that commit's own
`lib/shell.js`. Only the `file` suite of `check-browser.js` does not go
through the server: it opens `dist/` from `file://`, which is what it is there to prove, and so
it needs a build whatever `--root` says.

## The shell (lib/shell.js)

No page in the source tree writes its own `<head>` or top bar. A page holds `<!--bm:head-->`
(first in `<head>`, before its own `<title>`, description and, on one page, robots tag) and
`<!--bm:topbar-->` (first in `<body>`), and says on `<body>` what it is: `data-depth`, then
`data-chapter` or `data-page`, and optionally `data-scenes` and `data-nav`. The README's "The
shell of a page" is the author's guide. `lib/shell.js` is the one implementation:

- `PAGE_KINDS` lists, per kind of page (`home`, `page`, `dashboard`, `arena`, `chapter`), the
  site's stylesheets and every script, in the order they load. `boot.js` is the only script not
  deferred. A chapter's scenes go where the list says `SCENES`: `assets/scenes3d.js` and one file
  per name in `data-scenes`, or nothing.
- `renderShell(src, relPath)` returns the whole document. Everything outside the three places it
  writes (the head, the `<body>` tag, the top-bar marker) is the source byte for byte; from the
  `<body>` tag it takes off `data-page`, `data-scenes` and `data-nav`, which only it reads.
  `expand(src, relPath)` gives the same document with `lineOf(line)`, the line of the source file
  a line of it came from.
- It throws, with the page's path first, for a page that has `<main id="main">` and no head
  marker, one marker without the other, a marker that is not first, anything in `<head>` besides
  the page's own three tags, a `data-depth` that is not the file's depth, an unknown kind or top
  bar, or `data-scenes` on a page that is not a chapter. A file with no marker and no
  `<main id="main">` (a fixture, a report) comes back as it is.
- It requires nothing and reads no file, so `vite.config.ts` imports it as it is, and a commit's
  own copy can be run from `git show` (`lib/site.js` `shellAt`). `lib/shell.d.ts` gives the config
  its types (TypeScript 7 takes a CommonJS `.js` import as `any` otherwise); `checks.test.js`
  fails when the two files export different names.

Three callers, one function: the build and the dev server (`vite.config.ts`, a
`transformIndexHtml` hook that runs before Vite reads the page), `lib/serve.js`, and
`lib/site.js` `readPage`, through which `check-static.js`, `check-dist.js` and `check-browser.js`
read every page. So the checks see the stylesheet links, script tags and top-bar links that no
source file holds. The nodes they get carry the line of the **source file** (`lineOf`), so a
message such as `parts/…/08-coordinates.html:412` still points at the line to edit; a tag the shell
wrote has the line of its marker.

Two checks hold it, one on each side of the build. `shell` in `check-static.js` holds what the
shell writes to what readers have (`tools/shell.json`). `shell`, `scripts` and `stylesheets` in
`check-dist.js` hold `dist/` to what the shell writes. A list reordered in `PAGE_KINDS` passes
the second, since the build and the check expand alike, and fails the first.

## check-static.js

Usage: `node tools/check-static.js [--base=<git ref>] [--only=<check,check>] [--strict] [--accept-steps] [--accept-shell] [--migrations-base=<git ref>] [--shell-base=<git ref>]`

One line per check, `PASS`/`FAIL`/`WARN` plus the number of things examined, then the details.
`--base` is the commit the progress keys are compared against (default `8ff7abc`, the tree the
harness was written on — move it forward when a change to the exercises is deliberate).
`--strict` makes warnings fail; a clean tree passes with it. `--accept-steps` rewrites
`tools/lesson-steps.json` and `--accept-shell` rewrites `tools/shell.json` (both below); they are
the only flags that write anything. Every page is read with its shell written, and a page the
shell refuses stops the run before any check (`FAIL  setup:` and the reason).

| check | what it guards |
| --- | --- |
| `syntax` | `node --check` on every `.js` under `assets/` (recursively), `data/`, `tools/` |
| `es5` | no arrow functions, `let`, `const`, template literals or `class` in `assets/` and `data/` (strings, regex literals and comments are stripped first; `{ class: … }` property names are allowed) |
| `progress-keys` | every scored exercise key at `--base`, and every inline one that had an `id` there, still exists in the working tree with the same answer and question text; every exercise in the working tree, scored or inline, has an `id`; no duplicate keys. Uses the key rule of `site.js initExercises` exactly (`lib/keys.js`), whose positional fallback (`e1`, `e2`, …) is now only what reads a base from before the ids were written in |
| `ids` | on every page, no `id` value is on more than one element — an `id` is a link target and, on an exercise, the key its progress is saved under |
| `lesson-steps` | `startsStep`/`endsStep` of `assets/lesson.js` applied to the direct children of `<main id="main">`: WARN for each chapter whose steps are not the ones recorded in `tools/lesson-steps.json` (a FAIL under `--strict`), naming the first step that differs, because `bm.lesson.v1` remembers a reader's place as a step number |
| `shell` | for every page, what `lib/shell.js` writes around the content is what `tools/shell.json` records for it: every tag of `<head>` in order with its attributes (so the title, the description, each stylesheet, each script and whether it is deferred), the `<body>` tag without the three attributes only the shell reads, and the skip link and top bar as link texts and targets. A page with no record, and a record with no page, fail too. `--shell-base=<ref>` compares with the pages of a commit instead, each as a reader of that commit got it |
| `curriculum` | every chapter in `data/curriculum.js` has its file, the right `data-chapter` and `data-depth`, and every section id as an `<h2 id>` (an id on another element is a WARN) |
| `links` | every relative `href`/`src` resolves to a file, and its `#anchor` to an id in that file; ids created at runtime are allowlisted in `RUNTIME_IDS` with a note on where they come from. The stylesheets, scripts and top-bar links the shell writes are among them, so a scene named in `data-scenes` that has no file fails here, on the line of the head marker |
| `widgets` | every `data-widget` / `data-figure` names a `W.<name> = function` in `assets/widgets.js` or a `BM3D.define("<name>"` in `assets/scenes/*.js` |
| `sections` | every `data-section` is a section of the same chapter or `chNN#section` of a real one; scored exercises without one are listed as a WARN |
| `choices` | choice/multi answer indices lie within the `<li>` options |
| `order` | order lists have at least two items; every `.blank` carries a key |
| `migrations` | if `supabase/schema.sql` differs from its content at the base, at least one file in `supabase/migrations/` is new since the base; every file there is named `<YYYYMMDDHHMMSS>_<name>.sql` with a real UTC date and a lower-case name, and no two share a timestamp; every migration that was at the base is still there, byte for byte; a new one is not empty and its timestamp is later than every one at the base. The base is not `--base`: it is `--migrations-base=<ref>` if given, otherwise the commit `HEAD` left `main` (or `origin/main`) at. Only where neither resolves does it fall back to `--base`, with a WARN, because against a base older than the migrations it lets a schema change through. It cannot see whether the migration was applied, which is a step in [`../OPERATIONS.md`](../OPERATIONS.md) |
| `placeholders` | no typed exercise's `data-placeholder` shows an example that its own key accepts: the whole placeholder and the part after `e.g.` are run through the site's grader (`BMSite.grade`, loaded from `assets/site.js` under a stub `window`) with the exercise's type and `data-tol` |
| `merge` | `BMAccount.merge` (loaded from `assets/account.js` under a stub `window`) is commutative, associative and idempotent over 2000 seeded random store states, after dropping the deliberately local-first fields (`last`, `activity.goal`, `lesson.mode`, `play[ch].guess`). The states include a `game` object, and what a later version of the site might add: fields no rule knows at every level where the merge builds a record afresh, values that are not records under unknown keys of the keyed stores, and a shape number `game.v`. One of the unknown keys is named like a property every object inherits (`constructor`). The laws must hold with those in, every unknown key, at whatever level it sits, must come out as the later canonical JSON of the two sides, and `game.v` as the larger number |
| `animations` | WARN for every `animation … infinite` in `assets/*.css` (a FAIL under `--strict`) |
| `contrast` | WCAG 2.x contrast for every pair in `tools/contrast-pairs.json`, in the light and dark token tables and, for pairs with `parts: true`, under each Part's overrides. Pairs naming a token that is not defined yet are reported as SKIP; non-opaque or unparseable values are skipped with a note |

`tools/contrast-pairs.json` is a list of `{ fg, bg, min, themes?, parts? }` using token names. Add a
pair when a new token appears; delete nothing — a pair that goes undefined is a SKIP, not a failure.

`tools/lesson-steps.json` is the steps each chapter is cut into as readers have them, by chapter
id, one entry per step: the step's first and last top-level element (`h2#integers to div#t1`), each
named by its `id`, or by tag and classes when it has none. Every cut is made by one of those two
elements, so a cut that moves shows even when the number of steps stays the same, and text added
inside a step does not. It is a file rather than a comparison with `--base` because the base is
older than chapters that have since gained steps: against it the check warned on nine chapters at
all times and could not signal a tenth change. When a change to the cuts is meant, run
`node tools/check-static.js --only=lesson-steps --accept-steps` and commit the file with it; a new
chapter is added the same way. Naming an element differently (an `id` given to a heading that opens
a step) also shows as a difference, and is accepted the same way.

`tools/shell.json` is the shell of each page as readers have it, by page path: `head` (one line
per tag, attributes in single quotes, a `<title>` with its text), `body` (the tag) and `topbar`
(`text -> href` per link, `button: label` per button). It was first written from the pages as
they were while each still carried its own copy of the head and top bar, so a difference from it
is a difference from the site before the shell. It is a file and not a comparison with `--base`
for the reason `lesson-steps.json` is: the default base is where the exercise keys were frozen,
and its pages load a different set of scripts. When a change is meant (a script added to a kind in
`PAGE_KINDS`, a new page, a new top-bar link), run
`node tools/check-static.js --only=shell --accept-shell` and commit the file with it: the diff
of the file is the list of pages whose head changed, and how.

### Exercise ids

Every exercise carries an `id`, and the `id` is the key its saved progress is stored under. The
201 exercises that predate ids were keyed by position; `assign-ids.js` (below) wrote each one's
key into the markup as its `id`, so positional keys exist only in history. An `id` that is retired
with its exercise must never be given to another. While `--base` still has the old exercise,
`progress-keys` fails the reuse — for an inline check as for a scored exercise, since `site.js`
marks an inline check solved from its attempt record — but nothing here can see one once `--base`
has moved past the commit that had it, so from then on that rule is kept by hand.

### Adding a check

Write `function checkThing(ctx, r)` in `check-static.js` — `ctx` has every page parsed
(`ctx.docs[rel]`, the whole document, with source-file line numbers), the chapter ids (`ctx.chapters[rel]`) and the curriculum; `r.fail(msg)`,
`r.warn(msg)`, `r.note(msg)` and `r.count` are the output — and append `{ name, run, what }` to
`CHECKS`. The HTML parser (`lib/html.js`) gives nodes with `queryAll(".ex, ol.order")`,
`getAttribute`, `textContent`, `id`, `line`.

## check-browser.js

Usage: `node tools/check-browser.js [--root=<dir>] [--only=<substring>] [--skip=<suite,suite>] [--theme=light|dark] [--vw=1280|360] [--base=<ref>] [--headed] [--strict-axe] [--list]`

Playwright and axe-core are dev dependencies (`package.json`, pinned by `package-lock.json`):
`npm ci` installs them and `npx playwright install chromium` downloads the browser, once per
Playwright version, into Playwright's own cache outside the repo. `lib/pw.js` resolves both from
the repo's `node_modules`. Only if that fails does it try `$BM_PLAYWRIGHT_FROM`, a `node_modules`
directory somewhere else that holds `playwright` with a downloaded Chromium (`axe-core` there is
optional); if neither resolves, the script says what it tried and exits 2. The scripts under
`game/` use the same resolver.

The site is served in-process on a free port (`lib/serve.js`), from the tree chosen as described
above; page discovery and everything read statically (exercise keys, the curriculum) always come
from the source tree. `/__base/<path>` serves the same path at `--base` through `git show`, so the
previous commit's site is browsable for comparison without a checkout (`node tools/lib/serve.js`
runs the server on its own).

The pages take fonts, KaTeX and Three.js from CDNs, and the run does not leave those requests to
Chromium. A stylesheet or deferred script that neither answers nor fails holds a page's scripts
and its load event, and one such stall among the several hundred page loads of a run used to end
it with `page.goto: Timeout 15000ms exceeded` on whichever page it hit. So `lib/browser.js`
answers every request that is not for the local server itself: Node fetches the URL under a
4-second deadline, once per run, and every later page gets the same bytes from memory. A request
that fails or runs out of time is aborted, which the page sees as a failed request and the suites
count as a third-party **warning**, and that host is then refused at once for the next 30 seconds.
The second part matters as much as the first: a page chains its CDNs (KaTeX from cdnjs holds the
deferred scripts, which then ask cdnjs and after it jsDelivr for Three.js), and three deadlines in
a row are a navigation timeout again. A run with no network therefore still passes, with warnings
and unrendered formulas, and so does one where every CDN hangs (tried: all proxy variables pointed
at a socket that accepts and never answers, `NODE_USE_ENV_PROXY=1`).

Output goes to `.cache/check/` (git-ignored): `report.json`, `index.html` (a contact sheet with
every screenshot and all results — open it in a browser), and `pages/*.png`.

| suite | what it does |
| --- | --- |
| `webgl` | runs first. Loads `fixtures/webgl-probe.html` under three Chromium arg sets in turn and launches the shared browser with the first that gives a WebGL context; reports the renderer. Also self-tests the `noWebGL` and `blockUrl` helpers |
| `thirdparty` | the paragraph above, held to: a local server plays a CDN that accepts a request and never answers, and one that sends headers and stops. The page must finish loading within the deadline with a third-party warning for each file and no failure; a second page asking the stalled host straight away must not wait for it again; a file that is there, used by two pages, must be fetched once. Also reads the suites' source: a context opened with `ctx.browser.newContext` goes around the deadline, and fails here |
| `pages` | every page × light/dark × 1280×800/360×740 with clean storage: console errors, uncaught errors, same-origin 404s, horizontal overflow, `body[data-lesson="steps"]` and the mode switch on chapter pages, then the switch to whole page and a full-page screenshot. Third-party requests (fonts, the KaTeX CDN) that fail or stall are warnings |
| `widgets` | every `[data-widget]` has an `svg`/`canvas` and no failure note; then each slider is set to min/max/min with `input` events, each `button.chip` is clicked, and a focusable SVG gets arrow keys and Space. Any exception fails |
| `missions` | with clean storage no `.missions li[data-done]` exists, headings read "0 of n", `BMPlay` is empty, `BMMissions.total()` matches the page |
| `exercises` | per chapter, in whole-page mode: a wrong answer on the first scored typed exercise shows feedback with the hint, then the key is accepted; then every exercise is answered with its own key (typed: type and Enter, trying `\|`-alternatives in the engine's order; choice/multi: tick and Check; blank: fill each; order: the up buttons; `figure` kinds are skipped and counted); the score line and completion banner agree; after a reload every solved scored exercise is `data-state="correct"` with `data-restored` and the lesson mode is remembered |
| `restore` | seeds `bm.progress.v1` with every scored key of the chapter **at `--base`** and loads the working-tree page: each card's engine key must equal the static rule's key for its position, each restored card's question must fingerprint the same as at base, and lesson mode must open every step for a reader with solved work |
| `upgrade` | a returning reader's whole saved state survives. `fixtures/state-v1.json` (every store, as the last release before the build step writes them) is put into localStorage once, on the served origin, before any page loads; then the home page, the progress page, a cleared chapter and a part-done one are opened in the same profile. After each, the fixture must be **contained** in what is in storage: every key still there with the same value. Not equal, because the site writes on load: objects and lists may have gained entries (backfilled achievements, banked medals, the run store), the counts a page re-derives each visit (`total`, `reached`) may have grown, and `bm.last` names the chapter once one has been opened. The pages must show it too: the saved theme against the system's, Continue on the home page, medals and XP on the progress page, every solved card solved and no other. The last line lists what loading added |
| `motion` | under `prefers-reduced-motion: reduce` no animation is running at load, after a wrong answer, or after a right one |
| `file` | `index.html` and the first chapter of **`dist/`** loaded from `file://` build themselves without errors, with the site's stylesheet applied and no file of the site refused (whatever `--root` is). No `dist/` is a failure; one older than the source is loaded with a warning |
| `axe` | axe-core on every page × theme at 1280 (whole-page mode on chapters); violations are warnings counted by rule, failures with `--strict-axe`; skipped when axe-core does not resolve |

`--only` takes suite names (`--only=pages,motion`) or a page-path substring (`--only=05-distance`),
or both; `--skip` takes suite names to leave out. The theme is forced the way the site reads it —
`localStorage["bm.theme"]` holds the JSON string `"dark"`/`"light"` (note the quotes: every store
value is `JSON.stringify`ed) and the context's `colorScheme` matches — so a `boot.js` that reads
the same key before paint is covered too.

### Adding a suite

Drop a file in `tools/suites/` exporting `{ name, order, description, run(ctx) }`. The runner
loads every file there; nothing is registered by hand. `ctx` carries the browser, the server URLs,
the page lists, the curriculum, the flags and the helpers in `lib/browser.js` (`newPage` with
theme/viewport/storage seeds/reduced motion/no-WebGL, `newContext`, `open`, `settle`, `wholePage`,
`screenshot`, `noWebGL`, `blockUrl`); results go through `ctx.report.pass/fail/warn/skip`. The full interface is
documented at the top of `check-browser.js`. `lib/drive.js` answers exercises by kind for suites
that need a solved or a wrong card. A `game`, `scenes` or `arena` suite is one more file.

`h.newPage({ storage })` writes its seeds on every page load, which suits a suite that opens one
page. A suite that follows state across pages seeds once instead, through the browser context's
`storageState` on `ctx.server.url`'s origin, as `suites/upgrade.js` does. It opens that context
with `h.newContext(options)`, never `ctx.browser.newContext`: the helper is what puts the
context's third-party requests under the deadline.

### The saved-state fixture

`fixtures/state-v1.json` is the proof every later release reuses: whatever changes, a reader who
last visited before it must find their work. Its `storage` object maps each localStorage key to
the value the real writers leave there (shapes: `src/types/state.ts`), with real chapter, section,
exercise and mission ids; its `about` says what the state is and what it leaves for the site to
backfill. When a release changes what is stored, the fixture stays as it is and the release has to
read it; a new fixture (`state-v2.json`) is added beside it for the new shape, and `upgrade`
grows a case, so each old shape keeps a test.

### WebGL in headless Chromium

Measured on this repo's pinned Playwright (1.63.0, Chromium 153 headless shell) on Arch Linux
with an NVIDIA card: the first argument set the `webgl` suite tries,
`--enable-unsafe-swiftshader --use-angle=swiftshader --ignore-gpu-blocklist`, gives a WebGL 2
context on SwiftShader (software, "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)
…)"), and that is what every suite then launches with; `game/map.test.js` uses the same three
flags. No other arguments were needed here: the suite's two fallback sets, including launching
with no arguments at all, give the same SwiftShader context, as do `--use-gl=egl` and
`--disable-gpu`, so headless Chromium never uses the machine's GPU and the result does not depend
on the graphics driver. If a future Chromium stops handing out a context without a flag, the
`webgl` suite fails with every set it tried listed, and `ARG_SETS` in `suites/webgl.js` is the
one place to add the new set.
Software WebGL is slow and can lose its context under load, which is why CI runs the 3D checks
(`npm run test:browser:3d`: `game/map.test.js`, and `game/scenes.test.js` with it, though that one
draws on the SVG painter) and the `webgl` suite in a job of their own, retried, outside the gate
a deploy waits for; `npm run test:browser:core` and `check-browser.js --skip=webgl` are the gate.
The gate is not retried, and does not need to be on a CDN's account: see the paragraph on
third-party requests above.
Nothing here needs a GPU or a display.

## check-dist.js

Usage: `node tools/check-dist.js [--dist=<dir>] [--only=<check,check>]` (after `npm run build`)

The build is meant to change nothing a reader can see. This is the check that it did not: same
output format as `check-static.js`, Node built-ins only, under a second. It is strict on purpose
while the build is a pass-through; a later item that moves the scripts into the build changes the
check it trips in the same commit.

The build does write each page's head and top bar (`lib/shell.js`). So "the source" of a page,
in every row below, is the source page with its shell written, read through the same
`lib/site.js` `readPage` as `check-static.js` uses: the document the build is handed. These checks
then say what they always said, that Vite passed that document through. They cannot say that the
shell wrote the right head, because the build and the check expand alike; that is `shell` in
`check-static.js`, against `tools/shell.json`.

| check | what it guards |
| --- | --- |
| `pages` | every page of the source tree (the `htmlPages` rule in `lib/site.js`, which `vite.config.ts` repeats) is in `dist/` at the same path, and `dist/.nojekyll` is there. Nothing else is in `dist/` but what the site is made of: a page, a script of `assets/` or `data/`, a file of `public/`, a file a built page links or a built stylesheet names, and a source map beside one of those. Everything in `dist/` is published, so a stray `.env` or `tools/` fails here |
| `links` | every relative `href`/`src` in the built pages resolves to a file inside `dist/`, and its `#anchor` to an id: the same walk `check-static.js` does on the source (`lib/links.js`) |
| `root-absolute` | no attribute value is a root-absolute path (`/assets/…`): the site is published under a sub-path, where `/` is not its root. Any value starting with a single `/` on a URL attribute fails; on any other attribute, one that names something in the top level of `dist/`. The same for CSS: no `url(/…)` or `@import "/…"` in a built stylesheet, a `<style>` or a `style` attribute |
| `main` | for every page, the text from `<main` to `</main>` is the source's, by whitespace-normalised fingerprint: the build may rewrite a `<head>`, never the content (`lesson.js` and the exercise keys depend on it) |
| `shell` | for every page, everything around `<main>` is the source's too: the head (viewport, title, the CDN tags, inline scripts), the attributes of `<body>`, the top bar, the footer. The links to the site's own stylesheets and icon, which the build does rewrite and `links` and `stylesheets` answer for, are taken out of both sides first. Since the head and top bar come from the shell, this is also what fails a build that did not write them, or wrote them differently from the checks: a marker left in the page, `data-page` left on `<body>` |
| `scripts` | every page has the same `<script>` tags as its source, in the same order: the same `src`, the same attributes (a dropped `defer` or an added `type="module"` fails), inline and CDN scripts included. And every `.js` under `assets/` and `data/` is in `dist/` byte for byte |
| `secrets` | no file in `dist/` contains `service_role` (in any case, so `SUPABASE_SERVICE_ROLE_KEY` too), `sb_secret_`, `whsec_`, `sk-ant-`, or a Stripe-style `sk_live_…`/`rk_test_…` key. A legacy Supabase key is a JWT, whose role is base64-encoded and matches no pattern, so every JWT-shaped token is decoded as well and fails unless its role is `anon`. (The Supabase anon key in `assets/config.js` is public by design and passes) |
| `stylesheets` | reports how many distinct stylesheets the built pages link, and fails if two chapter pages link different ones. Also the cascade: Vite splits the CSS into shared files and, left alone, links a page's own file before the shared ones, the reverse of the source (`vite.config.ts` puts them back). So for every page, the class names only one source stylesheet uses must all come, in the built CSS the page links, before those of the next source stylesheet. And the text: each stylesheet a source page links must be, byte for byte, inside one of the stylesheets the built page links. `vite.config.ts` sets `build.cssMinify: false` for that: Vite's minifier (Lightning CSS) rewrites values the scripts read (`--plot-fill: rgba(38, 70, 212, .14)` becomes `#2646d424`, which `parseColor` in `assets/scenes3d.js` returns `null` for) and merges selectors into `:is()`, changing their weight. Last, the link: a built link to one of the site's stylesheets carries `rel` and `href` and nothing else, as the source's do. Vite adds `crossorigin`, with which a page opened from disk is refused its stylesheets, and `vite.config.ts` takes it off again |

## Deliberately not covered

- Firefox and WebKit/Safari (Chromium only: it is the one browser `npx playwright install chromium` downloads).
- Real devices and touch: the 360px cell is a resized Chromium, not a phone.
- Screen readers and focus order beyond what axe-core can see statically.
- Answers given on a figure (`data-type="figure"`): the sweep counts and skips them.
- Visual regression against the base commit: screenshots are taken for eyes, not diffed.
- The real Supabase account path and the round trip to a real sign-in service: the browser
  suites never sign in, and `game/sync.test.js` and `game/account.test.js` run against
  stand-ins that mimic PostgREST and auth-js rather than the services themselves.

## apply-shell.js

Usage: `node tools/apply-shell.js --check | --write [--base=<git ref>]`

A one-off, kept as the record of how the pages were converted and of the proof that no document
changed. Every page used to carry its own copy of the `<head>` and the top bar (six variants of
the head, three of the bar). For each page this rewrites everything before the content wrapper
(`<div class="wrap">` or `"wrap-narrow"`) to the two markers, the page's own title, description
and robots tag, and a `<body>` tag with the attributes it had plus the ones the shell reads; every
byte from the wrapper to the end of the file is left as it is. The kind, top bar and scenes are
not guessed from the file's name: each combination `lib/shell.js` knows is tried, and the one is
taken whose expansion parses to the same document as the original, white space aside (on the 23
pages it was the original byte for byte). A page for which none does is refused, and one refused
page stops every page from being written.

`--check` changes nothing and exits 1 if there would be anything to change; since the shell now
refuses a page without markers, it should always report nothing to do. With `--base=<ref>`, the
commit the pages were converted from, it also expands each marked page and holds it to the whole
page at that commit: the same document, and not a byte different from the content wrapper on.
That stops being true, and is meant to, as soon as a page's content is edited.

## assign-ids.js

Usage: `node tools/assign-ids.js --check | --write`

A one-off, kept as the record of how the ids were derived. For each chapter page it takes every
scored exercise without an `id` and, on the line the parser reports for it, turns `<div class="ex"`
into `<div class="ex" id="<key>"`, the key being the one `lib/keys.js` gives it today. It refuses a
page where that line does not hold exactly one such tag or where some element already has the id,
and it re-parses the result and requires the same exercises in the same order — keys, inline flags,
fingerprints, lines — before anything is written. One page that is refused stops every page from
being written, and a page is reported as written only after it has been. `--check` changes nothing
and exits 1 if there would be anything to change; since `progress-keys` now fails an exercise
without an `id`, it should always report nothing to do.

## The focused checks

| script | what it guards |
| --- | --- |
| `smoke-scenes.js` | every 3D scene under a small DOM shim: mounts in figure and quiz mode, missions false at mount, every control driven, every `cases` answer reachable and graded right |
| `checks.test.js` | the checks themselves, on small pages written in the test: `progress-keys` (a changed, dropped or reused key fails, scored or inline; ids written onto positional keys pass), `ids` (an `id` such as `constructor` is only a name), `lesson-steps` (an added step and a cut that moves at the same count both show), `assign-ids.js` (nothing is written, or said to be, when one page cannot be converted), `lib/shell.js` (each kind of page gets its stylesheets, scripts, top bar and path prefix; the content is not touched; each way of writing a page wrong is refused with its reason; nodes carry source-file lines), the `shell` check (a dropped `defer`, two scripts swapped, a changed body attribute or top-bar link each show; `tools/shell.json` records every page) and `apply-shell.js` (whole pages are found again as the kind they were written from; a page no kind expands to, or one whose content differs from the base by a byte, fails and nothing is written) |
| `check-gen.js` | every Arena generator over 500 seeds: deterministic, no `NaN`/`undefined`, the key and every declared alternative graded right, near misses graded wrong, hints that do not give the answer, every chapter covered |
| `game/merge.test.js` | `BMAccount.merge` with the game store: commutative, associative, idempotent, over states that also carry fields this version has never heard of; every such field comes out of the merge, by the one rule for them (the later canonical JSON), and `game.v` is the larger number. Spot checks pin the limits of that rule: keys named like inherited properties are carried and `__proto__` is not, and an object under an unknown key of a keyed store is merged as a record of that kind. Last, the writers in `assets/site.js` (`BMProgress`, `BMPlay`, `BMAttempts`) write a fresh record over an entry that is not one, which a merge now passes through |
| `game/sync.test.js` | account sync in `assets/account.js` against an in-memory stand-in for Supabase, one vm per device: stale tabs and simultaneous saves never overwrite newer progress, resets are neither undone nor allowed to wipe later work, a sync never lands in the wrong reader's account, and signing out sets unsaved progress aside instead of wiping it. Other versions of the site and of the tables: fields a later version saved survive a sync from a device with changes of its own, at every level and in a column this version does not know; a row or a browser in a newer shape (`game.v`) is merged and never written, with the page asking for a reload; a server without the `game` column syncs the rest; a project without the `attempts` table syncs, keeps the log queued without sending it again with every save, and holds no more than the newest 500 checks; a reset leaves a column this version does not know. Two of these run on `account.html`, where the account-page half of the file shares its scope with the sync: a sign-in and sign-out there keep the account whole, and the page says to reload for a newer shape. A sync whose merge fails is never followed by a save of the unmerged copy. Also sign-in through another service: only configured services are offered, Microsoft is asked for the email address, and a reader with no email address still syncs |
| `game/account.test.js` | the account page in Chromium with `BM_CONFIG` pinned and a stand-in for the Supabase SDK: provider buttons in config order with text labels, the hand-over call, a refused sign-in explained and removed from the address, the signed-in panel with and without an email address, no overflow at 360px |
| `game/rules.test.js` | combo, levels, hearts, medals, achievements, recall and run records, as pure functions; play settings and game records keep keys this version does not know through every write, and switching a setting never announces a synced change |
| `game/browser.test.js` | the game layer in Chromium: XP and combo, hearts, the finale, reloads, calm mode, sound, older saved progress, toasts, the settings sheet |
| `game/arena.test.js` | the Arena in Chromium: scoring, par and the clock, hearts, Daily, Repair, resume, calm mode mid-run, two tabs |
| `game/scenes.test.js` | 3D stages in Chromium: keyboard and buttons, touch scrolling, contrast of meaningful marks in both themes |
| `game/content.test.js` | the new 3D exercises in chapters 8 and 16, answered through the page |
| `game/map.test.js` | the course map: every fallback, no rendering while idle, clicks that match the list links |

The browser ones resolve Playwright and choose the tree to load like `check-browser.js` (`--root`
or `BM_ROOT`, else `dist/` when current), and each aborts every request that does not go to the
local server, so none of them depends on a CDN (`map.test.js` answers the one Three.js request
from `.cache/`, fetching it once). Without that file `map.test.js` skips its checks and says so;
when the `CI` variable is set it fails instead, so a CI job cannot pass having tested no map.
