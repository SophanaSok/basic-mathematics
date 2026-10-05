# tools/ — the verification harness

Three general scripts (the source tree, the built `dist/`, and the site in a browser), plus
focused ones for the 3D scenes, the Arena's generators and the game layer. They are plain Node
scripts, CommonJS (`tools/package.json` says so, because the repo's own `package.json` is
`"type": "module"`), and the repo's npm scripts are the way to run them:

```sh
npm ci                                     # once; then `npx playwright install chromium` for the browser ones
npm run check                              # ~20 s, no browser: typecheck, check-static, check-gen,
                                           # smoke-scenes, the merge, sync and rules tests, and
                                           # the Vitest unit tests of src/ (npm run test:unit:
                                           # src/**/<module>.test.ts beside each module, the
                                           # help ladder's, and the review's: recall, review,
                                           # practice, next, and data/arena-sections against
                                           # the generators; and a11y/math-text, the line of
                                           # text a formula is named by, against every
                                           # formula of the course)
npm run build && npm run check:dist        # dist/, and that it is the source's site
npm run test:browser                       # the tools/game Chromium scripts, ~2 min
npm run check:browser                      # check-browser.js on dist/, ~8 min
npm run check:all                          # all of it, in that order
```

`node tools/<script>.js` works just as well, and `npm run <name> -- --flag` passes a flag through.
Every script exits 1 on any failure. Run `npm run check` on every edit and the rest before a
push; CI (`.github/workflows/ci.yml`) runs all of it on every pull request.

## What the browser scripts load: the build

`check-browser.js` and the Chromium scripts under `game/` load the built site, `dist/`, over http
from an in-process server (`lib/serve.js`). `lib/target.js` picks it and refuses anything else:

- the source tree is not a site. A page in it holds two markers where `lib/shell.js` writes its
  `<head>` and top bar ([The shell](#the-shell-libshelljs), below), and its scripts are the
  imports of a module entry that Vite bundles; so there is no raw tree to serve, and
  `--root=.` fails saying so.
- `dist/` must be there and newer than everything it is built from: the pages, `lib/shell.js`,
  everything under `src/`, `assets/`, `data/` and `public/`, `vite.config.ts` and
  `package-lock.json`. A
  build that is missing or older fails the script at once with `run npm run build first` and the
  file that is newer, so a script run straight after an edit never quietly tests an old build.
  `npm run check:all` builds before any browser script runs.
- `--root=<dir>` or `BM_ROOT=<dir>` names a build somewhere else (CI downloads the build job's
  `dist/` as an artifact and sets `BM_ROOT=dist`); the same test holds it to the source tree.

The served tree goes out as it is. An HTML file in it that still carries a shell marker (a source
page put where a build should be) is a 500 saying so, never served half-written. Each script
prints what it is serving on its first line. `tools/fixtures/` is always served from the source
tree, at the same URL, and never copied into `dist/`; `/__base/<path>` is always read from this
checkout's git history, a marked page there written by that commit's own `lib/shell.js` with that
commit's `src/boot.js` (`lib/site.js` `shellAt`).

Nothing opens `dist/` from `file://` any more: module scripts need an http origin, and the site
does not promise to open from disk.

## The shell (lib/shell.js)

No page in the source tree writes its own `<head>` or top bar. A page holds `<!--bm:head-->`
(first in `<head>`, before its own `<title>`, description and, on one page, robots tag) and
`<!--bm:topbar-->` (first in `<body>`), and says on `<body>` what it is: `data-depth`, then
`data-chapter` or `data-page`, and optionally `data-nav`. The README's "The shell of a page" is
the author's guide. `lib/shell.js` is the one implementation:

- `PAGE_KINDS` lists, per kind of page (`home`, `page`, `dashboard`, `arena`, `chapter`), the
  site's stylesheets in cascade order and its one module entry, `src/entries/<kind>.js`. The
  scripts of a kind, in the order they run, are the imports of that entry; the first is
  `src/vendor/katex.js`, KaTeX from npm, so `renderMathInElement` is there when `site.js` runs.
  Every page also gets the boot script (`src/boot.js`) inline, first in `<head>` and before the
  stylesheets, and before its kind's stylesheets the two vendor ones (`VENDOR_STYLES`:
  `src/vendor/fonts.css`, the `@font-face` rules `gen-fonts.js` writes from the fontsource
  packages, then `src/vendor/katex.css`, an `@import` of the npm package's CSS that the build
  inlines), ahead of the site's own so that `site.css`'s rules on `.katex` come after KaTeX's
  and win, as they did when these were links to Google Fonts and the KaTeX CDN.
  Nothing in a page's head names another server.
- `lib/vendor.js` says which file under `src/vendor/` brings in each npm package, with the
  package's dependencies read off the installed `package.json` files (`vendorModules()`,
  `vendorOf(rel)`): a script of `node_modules/` belongs to the vendor `.js` that imports its
  package, a stylesheet to the vendor `.css`. `vite.config.ts` names a `node_modules` file's chunk
  by it, and `check-dist.js` holds the chunks to it. `lib/vendor.d.ts` gives it types the way
  `shell.d.ts` does.
- `renderShell(src, relPath)` returns the whole document. Everything outside the three places it
  writes (the head, the `<body>` tag, the top-bar marker) is the source byte for byte; from the
  `<body>` tag it takes off `data-page` and `data-nav`, which only it reads.
  `expand(src, relPath)` gives the same document with `lineOf(line)`, the line of the source file
  a line of it came from.
- It throws, with the page's path first, for a page that has `<main id="main">` and no head
  marker, one marker without the other, a marker that is not first, anything in `<head>` besides
  the page's own three tags, a `data-depth` that is not the file's depth, an unknown kind or top
  bar, or `data-scenes` (every chapter's bundle carries every scene, so the attribute names
  nothing). A file with no marker and no `<main id="main">` (a fixture, a report) comes back as it
  is.
- It reads one file, the boot script it inlines (`bootScript()`), through `readSource`, which
  `useSource(fn)` replaces: `vite.config.ts` imports the file as it is, and a commit's own copy can
  be run from `git show` with that commit's `src/boot.js` (`lib/site.js` `shellAt`).
  `lib/shell.d.ts` gives the config its types (TypeScript 7 takes a CommonJS `.js` import as
  `any` otherwise); `checks.test.js` fails when the two files export different names.

Two callers, one function: the build and the dev server (`vite.config.ts`, a
`transformIndexHtml` hook that runs before Vite reads the page), and `lib/site.js` `readPage`,
through which `check-static.js`, `check-dist.js` and `check-browser.js` read every page. So the
checks see the stylesheet links, script tags and top-bar links that no source file holds. The
nodes they get carry the line of the **source file** (`lineOf`), so a message such as
`parts/…/08-coordinates.html:412` still points at the line to edit; a tag the shell wrote has the
line of its marker.

Two checks hold it, one on each side of the build. `shell` in `check-static.js` holds what the
shell writes to what readers have (`tools/shell.json`), and, whatever the record says, to the one
module entry of the page's kind. `shell`, `scripts` and `stylesheets` in `check-dist.js` hold
`dist/` to what the shell writes and to the entry's imports. An entry reordered under
`src/entries/` passes both, because the order is not in the built chunks (see `scripts` below);
the browser suites, which need `site.js` to have run after `widgets.js` and before `game.js`,
fail on it.

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
| `syntax` | `node --check` on every `.js` under `src/`, `assets/` (recursively), `data/`, `tools/`: the first three as ES modules (the repo's `package.json` is `"type": "module"`), `tools/` as CommonJS |
| `progress-keys` | every scored exercise key at `--base`, and every inline one that had an `id` there, still exists in the working tree with the same answer and question text; every exercise in the working tree, scored or inline, has an `id`; no duplicate keys. Uses the key rule of `site.js initExercises` exactly (`lib/keys.js`), whose positional fallback (`e1`, `e2`, …) is now only what reads a base from before the ids were written in |
| `ids` | on every page, no `id` value is on more than one element — an `id` is a link target and, on an exercise, the key its progress is saved under |
| `lesson-steps` | `startsStep`/`endsStep` of `assets/lesson.js` applied to the direct children of `<main id="main">`: WARN for each chapter whose steps are not the ones recorded in `tools/lesson-steps.json` (a FAIL under `--strict`), naming the first step that differs, because `bm.lesson.v1` remembers a reader's place as a step number |
| `shell` | for every page, what `lib/shell.js` writes around the content is what `tools/shell.json` records for it: every tag of `<head>` in order with its attributes (so the title, the description, each stylesheet, each script; the inline boot script as a fingerprint of its text), the `<body>` tag without the two attributes only the shell reads, and the skip link and top bar as link texts and targets. A page with no record, and a record with no page, fail too. And whatever the record says, the scripts of every page are the boot script inline (its text `src/boot.js`) and one `<script type="module">` naming the entry of the page's kind (`src/entries/<kind>.js`, a file that exists): any classic `<script src>`, of the site's own or from a CDN, a second module or another kind's entry fails. `--shell-base=<ref>` compares with the pages of a commit instead, each as a reader of that commit got it |
| `curriculum` | every chapter in `data/curriculum.js` has its file, the right `data-chapter` and `data-depth`, and every section id as an `<h2 id>` (an id on another element is a WARN) |
| `links` | every relative `href`/`src` resolves to a file, and its `#anchor` to an id in that file; ids created at runtime are allowlisted in `RUNTIME_IDS` with a note on where they come from. The stylesheets, the module entry and top-bar links the shell writes are among them, so an entry named in `PAGE_KINDS` that has no file fails here, on the line of the head marker |
| `widgets` | every `data-widget` / `data-figure` names a `W.<name> = function` in `assets/widgets.js` or a `BM3D.define("<name>"` in `assets/scenes/*.js` |
| `sections` | every `data-section` is a section of the same chapter or `chNN#section` of a real one; scored exercises without one are listed as a WARN |
| `choices` | choice/multi answer indices lie within the `<li>` options |
| `order` | order lists have at least two items; every `.blank` carries a key |
| `migrations` | if `supabase/schema.sql` differs from its content at the base, at least one file in `supabase/migrations/` is new since the base; every file there is named `<YYYYMMDDHHMMSS>_<name>.sql` with a real UTC date and a lower-case name, and no two share a timestamp; every migration that was at the base is still there, byte for byte; a new one is not empty and its timestamp is later than every one at the base. The base is not `--base`: it is `--migrations-base=<ref>` if given, otherwise the commit `HEAD` left `main` (or `origin/main`) at. Only where neither resolves does it fall back to `--base`, with a WARN, because against a base older than the migrations it lets a schema change through. It cannot see whether the migration was applied, which is a step in [`../OPERATIONS.md`](../OPERATIONS.md) |
| `placeholders` | no typed exercise's `data-placeholder` shows an example that its own key accepts: the whole placeholder and the part after `e.g.` are run through the site's grader (`BMSite.grade`, loaded from `assets/site.js` under a stub `window`) with the exercise's type and `data-tol` |
| `merge` | `BMAccount.merge` (loaded from `assets/account.js` under a stub `window`) is commutative, associative and idempotent over 2000 seeded random store states, after dropping the deliberately local-first fields (`last`, `activity.goal`, `lesson.mode`, `play[ch].guess`). The states include a `game` object, and what a later version of the site might add: fields no rule knows at every level where the merge builds a record afresh, values that are not records under unknown keys of the keyed stores, and a shape number `game.v`. One of the unknown keys is named like a property every object inherits (`constructor`). The laws must hold with those in, every unknown key, at whatever level it sits, must come out as the later canonical JSON of the two sides, and `game.v` as the larger number. One field of an attempt record has a rule of its own and is held to it: the help ladder's `rung`, the larger number, a number over anything that is not one, the later canonical JSON between two that are not (the states hold clue numbers and, now and then, damaged values); a hand case pins 10 over 9, where the fallback would keep `"9"` |
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

The build is served in-process on a free port (`lib/serve.js`), as described above; page discovery and everything read statically (exercise keys, the curriculum) always come
from the source tree. `/__base/<path>` serves the same path at `--base` through `git show`, so the
previous commit's site is browsable for comparison without a checkout (`node tools/lib/serve.js`
runs the server on its own).

The pages take nothing from another server (the fonts, KaTeX, supabase-js and Three.js used to
come from CDNs and are in the bundle now), and the run does not leave a request to one to
Chromium should a page start to make one. A request that neither answers nor fails holds
whatever waits on it, and one such stall among the several hundred page loads of a run used to
end it with `page.goto: Timeout 15000ms exceeded` on whichever page it hit. So `lib/browser.js`
answers every request that is not for the local server itself: Node fetches the URL under a
4-second deadline, once per run, and every later page gets the same bytes from memory. A
request that fails or runs out of time is aborted, which the page sees as a failed request and
the suites note as a third-party **warning**, and that host is then refused at once for the next
30 seconds. The second part matters as much as the first: a page that asks one host after
another would wait once per host, and two deadlines in a row are most of a navigation timeout.
So a page that does make such a request fails in the `pages` suite with that request named,
rather than ending the run (tried, when the fonts and KaTeX still came from CDNs: all proxy
variables pointed at a socket that accepts and never answers, `NODE_USE_ENV_PROXY=1`). Nothing
in the run needs the network.

Every request a page makes is recorded as well (`track()`'s `requests` for those off the local
server, `own` for those to it), and `unexpected()` is the former, each once. The `pages` suite
**fails** a page on any of them: a signed-out reader's browser contacts no third party at all.
It also fails a page with no 3D scene and no course map that fetched `bundle/three.js`, the chunk
`assets/three-loader.js` imports on demand for those. `tools/game/account.test.js` watches the
requests to the local server too, for the one chunk a signed-out page must never ask for.

Output goes to `.cache/check/` (git-ignored): `report.json`, `index.html` (a contact sheet with
every screenshot and all results — open it in a browser), and `pages/*.png`.

| suite | what it does |
| --- | --- |
| `webgl` | runs first. Loads `fixtures/webgl-probe.html` under three Chromium arg sets in turn and launches the shared browser with the first that gives a WebGL 2 context, the one `assets/three-loader.js` asks for (a launch with WebGL 1 alone counts as none, since it would draw no 3D picture while reading as WebGL here); reports the renderer. Also self-tests the `noWebGL` and `blockUrl` helpers (the latter by refusing every built chunk under `bundle/`, after which the page must load with none of the site's scripts) |
| `thirdparty` | the first paragraph above, held to: a local server plays another server that accepts a request and never answers, and one that sends headers and stops (a stylesheet and a deferred script, the hardest case, since they hold the load event), on a fixture page, since no page of the site makes such a request. The page must finish loading within the deadline with a third-party warning for each file and no failure; a second page asking the stalled host straight away must not wait for it again; a file that is there, used by two pages, must be fetched once. Also reads the suites' source: a context opened with `ctx.browser.newContext` goes around the deadline, and fails here |
| `pages` | every page × light/dark × 1280×800/360×740 with clean storage: console errors, uncaught errors, same-origin 404s, the theme on `<html>` at the first animation frame (which comes before the first paint: the inline boot script did its job, so a dark page never flashes light), `window.BMSite`, `BMGame`, `BMStore` and `BM_CURRICULUM` present (the module entry ran, and in order: `game.js` needs `BMStore` when it runs), `window.katex` and `renderMathInElement` present (KaTeX is in the bundle) and at least one formula rendered on a page that has any (auto-render was there when `site.js` ran), **no request to any server but the site's own** (a failure, not a warning: the fonts, KaTeX, supabase-js and Three.js come from the site itself, and a signed-out reader never fetches the account library), **`bundle/three.js` not fetched by a page with no 3D scene and no course map** (only `assets/three-loader.js` imports it, for one of those), horizontal overflow, `body[data-lesson="steps"]` and the mode switch on chapter pages, then the switch to whole page and a full-page screenshot |
| `widgets` | every `[data-widget]` has an `svg`/`canvas` and no failure note; then each slider is set to min/max/min with `input` events, each `button.chip` is clicked, and a focusable SVG gets arrow keys and Space. Any exception fails. On a chapter with 3D scenes, one more result, `painters`: every stage is scrolled to and left to settle on its painter first, and under a launch the `webgl` probe found WebGL 2 in, every one must be on the GL painter (`data-painter="gl" data-state="ready"`; `assets/scenes3d.js` falls back to the SVG painter without a console error when the GL one cannot start, and this is the check that sees it). Under `--skip=webgl` (the deploy gate, which is not retried) a stage off the GL painter is a warning that names every stage's painter, not a failure |
| `missions` | with clean storage no `.missions li[data-done]` exists, headings read "0 of n", `BMPlay` is empty, `BMMissions.total()` matches the page |
| `exercises` | per chapter, in whole-page mode: a wrong answer on the first scored typed exercise shows the verdict and an offer line and opens no clue, then **Show a clue** opens clue 1 with the hint's text, then the key is accepted; then every exercise is answered with its own key (typed: type and Enter, trying `\|`-alternatives in the engine's order; choice/multi: tick and Check; blank: fill each; order: the up buttons; `figure` kinds are skipped and counted); the score line and completion banner agree; after a reload every solved scored exercise is `data-state="correct"` with `data-restored` and the lesson mode is remembered |
| `restore` | seeds `bm.progress.v1` with every scored key of the chapter **at `--base`** and loads the working-tree page: each card's engine key must equal the static rule's key for its position, each restored card's question must fingerprint the same as at base, and lesson mode must open every step for a reader with solved work |
| `upgrade` | a returning reader's whole saved state survives. `fixtures/state-v1.json` (every store, as the last release before the build step writes them) is put into localStorage once, on the served origin, before any page loads; then the home page, the progress page, a cleared chapter and a part-done one are opened in the same profile. After each, the fixture must be **contained** in what is in storage: every key still there with the same value. Not equal, because the site writes on load: objects and lists may have gained entries (backfilled achievements, banked medals, the run store), the counts a page re-derives each visit (`total`, `reached`) may have grown, and `bm.last` names the chapter once one has been opened. The pages must show it too: the saved theme against the system's, Continue on the home page, medals and XP on the progress page, every solved card solved and no other. The last line lists what loading added |
| `motion` | under `prefers-reduced-motion: reduce` no animation is running at load, after a wrong answer, or after a right one |
| `axe` | axe-core on every page × theme × width, 1280 and 360 (`--vw` picks one; whole-page mode on chapters), with `color-contrast` on. A violation of one of the rules in `STRICT_RULES` (`suites/axe.js`) **fails** the run whatever the flags: `button-name`, `label`, `empty-table-header`, `heading-order` and `scrollable-region-focusable`, the five the site had violations of and fixed where they came from (below), so none of them can come back. Any other rule's violation is a warning counted by rule, and a failure with `--strict-axe`. Every violating node (page, theme, width, rule, selector, its markup and axe's reason) is written to `.cache/check/axe.json`, where the report shows two per rule. Skipped when axe-core does not resolve |

The five strict rules, and where each was fixed. The first four were found at 1280, where the
suite then ran alone: the run before the fix warned on 34 page loads (every chapter in both
themes) and in its by-rule summary, 153 nodes per theme: `label` 81 (the radio buttons of 22 choice
exercises whose options are formulas), `heading-order` 57 (the first worked example under each
section, an `h4` straight after the section's `h2`), `button-name` 8 (the opening puzzle's guess
chips of chapters 9, 11 and 16 that are formulas) and `empty-table-header` 7 (the header row of
chapter 11's table of values, all formulas).

- `button-name`, `label`, `empty-table-header`: an accessible name is plain text worked out from
  the element's content, and neither axe-core nor Chromium takes any text from KaTeX's `<math>`
  when it does so (Chromium named the chip `$(7,5)$` `""` and the chip `$\tfrac52$ — five times
  as much` `" — five times as much"`). `src/ui/math-names.ts`, run by `renderMath` in
  `assets/site.js` after every typesetting, puts a visually hidden line of text from
  `src/a11y/math-text.ts` (`(7, 5)`, `x ≤ −3`, `π/6`, read off the MathML, never a value worked
  out) into each formula inside a button, label, table header, heading, link, summary, legend or
  caption, and hides that formula's MathML from assistive technology so nothing is read twice.
  Nothing on screen changes, and the puzzle's names say no more than its chips show.
- `heading-order`: a `.worked` block's heading is an `h3`, one level below its section's `h2`, and
  `.worked > h3` in `site.css` sets every property `h3` sets, so it looks as the `h4` did (three
  chapters' full-page screenshots, before and after, differ in no pixel of a worked example).
- `scrollable-region-focusable`, found once the suite ran at 360 as well (39 boxes per theme on
  13 chapters, none at 1280): a display formula (`.katex-display`) or a table's wrapper
  (`.tbl-wrap`: chapter 11's table of values, the interlude's truth tables) wider than a phone's
  column scrolls sideways, and a keyboard could not reach what was past its edge, since nothing
  in it takes focus. `src/ui/scroll-regions.ts`, run by `renderMath` after the names above and
  once on load, makes such a box a tab stop (`tabindex="0"`, where the arrow keys scroll it) and a
  group named "Formula, scrolls sideways" or "Table, scrolls sideways", only while it overflows:
  a `ResizeObserver` on each box puts it right when the width changes or a hidden lesson step
  opens, so at 1280 no box is a tab stop. What it sets is marked `data-scrolls`, whose focus ring
  `site.css` draws just inside the box.

Not an axe finding but found on the way: `thead th`, `.tag` and `.ex-solution .answer` are
uppercase labels, and a formula inside one was uppercased with them, on screen and in its name:
chapter 11's header row read `Θ` and `Π/6`, a revealed answer `Π/2 AND Π/6`, chapter 14's
callout `I` for `i`. `.katex { text-transform: none; }` keeps a formula's case.

`--only` takes suite names (`--only=pages,motion`) or a page-path substring (`--only=05-distance`),
or both; `--skip` takes suite names to leave out. The theme is forced the way the site reads it —
`localStorage["bm.theme"]` holds the JSON string `"dark"`/`"light"` (note the quotes: every store
value is `JSON.stringify`ed) and the context's `colorScheme` matches — which is how the inline
boot script reads it before paint.

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
…)"), and that is what every suite then launches with; `game/map.test.js` and the painter check
of `game/scenes.test.js` use the same three flags. The probe asks for WebGL 2 and nothing less,
since that is what `assets/three-loader.js` asks for (Three.js's renderer no longer runs on
WebGL 1): a launch with WebGL 1 alone would read as WebGL here while every 3D check silently
took the flat path. No other arguments were needed here: the suite's two fallback sets, including launching
with no arguments at all, give the same SwiftShader context, as do `--use-gl=egl` and
`--disable-gpu`, so headless Chromium never uses the machine's GPU and the result does not depend
on the graphics driver. If a future Chromium stops handing out a context without a flag, the
`webgl` suite fails with every set it tried listed, and `ARG_SETS` in `suites/webgl.js` is the
one place to add the new set.
Software WebGL is slow and can lose its context under load, which is why CI runs the 3D checks
(`npm run test:browser:3d`: `game/map.test.js`, and `game/scenes.test.js`, whose painter check
runs under the same flags while the rest of it draws on the SVG painter) and the `webgl` suite
in a job of their own, retried, outside the gate a deploy waits for; `npm run test:browser:core`
and `check-browser.js --skip=webgl` are the gate. The gate is not retried, and nothing in it
depends on another server (see the paragraph on third-party requests above) or on the WebGL a
runner happens to offer: the `tools/game` scripts in it abort the request for `bundle/three.js`,
so their stages and course map take the flat fallbacks on every machine. The `webgl` probe
still runs under `--skip=webgl` (it chooses the launch arguments), so the `pages` and `widgets`
suites of the gate do draw on the GL painter where the runner's SwiftShader gives WebGL 2, as
they did before; the one thing held to it, the `widgets` suite's painter result, is a warning
there and a failure everywhere else.
Nothing here needs a GPU or a display.

## check-dist.js

Usage: `node tools/check-dist.js [--dist=<dir>] [--only=<check,check>]` (after `npm run build`)

The build is meant to change nothing a reader can see. This is the check that it did not: same
output format as `check-static.js`, Node built-ins only, under a second. It is strict on purpose:
the one thing the build makes, the bundle behind each page's module entry, is held to the entry's
imports through the source maps, and everything else to the source. `--dist` may name a copy of
the build anywhere (CI's downloaded artifact, a scratch directory): the source maps are read
relative to the root of that directory, not resolved on disk.

The build does write each page's head and top bar (`lib/shell.js`). So "the source" of a page,
in every row below, is the source page with its shell written, read through the same
`lib/site.js` `readPage` as `check-static.js` uses: the document the build is handed. These checks
then say what they always said, that Vite passed that document through. They cannot say that the
shell wrote the right head, because the build and the check expand alike; that is `shell` in
`check-static.js`, against `tools/shell.json`.

| check | what it guards |
| --- | --- |
| `pages` | every page of the source tree (the `htmlPages` rule in `lib/site.js`, which `vite.config.ts` repeats) is in `dist/` at the same path, and `dist/.nojekyll` is there. Nothing else is in `dist/` but what the site is made of: a page, a file of `public/`, a file a built page links (its module script, what it preloads, its stylesheets, the icon), a chunk reached by following the imports from a page's module script (the WebGL painter and supabase-js are dynamic imports), a file a built stylesheet names (the fonts), `bundle/LICENSES.txt` (see `licences`), and a source map beside one of those. The copies of the source scripts at their own paths that one release kept for cached pages are over, and `scripts` fails a build that has them. Everything in `dist/` is published, so a stray `.env` or `tools/` fails here |
| `links` | every relative `href`/`src` in the built pages resolves to a file inside `dist/`, and its `#anchor` to an id: the same walk `check-static.js` does on the source (`lib/links.js`) |
| `root-absolute` | no attribute value is a root-absolute path (`/assets/…`): the site is published under a sub-path, where `/` is not its root. Any value starting with a single `/` on a URL attribute fails; on any other attribute, one that names something in the top level of `dist/`. The same for CSS: no `url(/…)` or `@import "/…"` in a built stylesheet, a `<style>` or a `style` attribute |
| `main` | for every page, the text from `<main` to `</main>` is the source's, by whitespace-normalised fingerprint: the build may rewrite a `<head>`, never the content (`lesson.js` and the exercise keys depend on it) |
| `shell` | for every page, everything around `<main>` is the source's too: the head (viewport, title, the inline boot script), the attributes of `<body>`, the top bar, the footer. The links to the site's own stylesheets and icon and the page's module script, which the build does rewrite (the script comes back as a built chunk, with `<link rel="modulepreload">` for what it imports), are taken out of both sides first; `links`, `stylesheets` and `scripts` answer for them. Since the head and top bar come from the shell, this is also what fails a build that did not write them, or wrote them differently from the checks: a marker left in the page, `data-page` left on `<body>` |
| `scripts` | what a built page runs. Its script tags, in order: the boot script inline with the text of `src/boot.js` and one `<script type="module">` (`type=module crossorigin`, as Vite writes it) whose `src` is the page's own entry chunk, `bundle/pages/<page>.js`; nothing else. The bundle behind that tag: the chunks reached by following the imports from it were built (their source maps say) from exactly the files `src/entries/<kind>.js` imports, every one and no other (a script under `assets/` or `data/`, or a TypeScript module under `src/` such as `src/learn/ladder.ts`, tests and declarations aside: an entry names each module it bundles, not only the first of a chain), and every `node_modules/` file among them is brought in by a vendor module the entry imports (`lib/vendor.js`: KaTeX's by `src/vendor/katex.js`). Where the importer of an on-demand module is among them, the dynamic import reaches that module's chunk: `bundle/scenes3d-gl.js` for `assets/scenes3d.js`, `bundle/three.js` for `assets/three-loader.js`, `bundle/supabase.js` for `assets/account.js`. The names: every other chunk reached is `bundle/<kinds>.js` (`all`, or the kinds joined with `-` in `PAGE_KINDS` order), and every file in it is loaded by exactly those kinds, by the entries' imports, the vendor stylesheets and `PAGE_KINDS`'s; so no name carries a hash, and a name changes only when what loads a file changes (`OPERATIONS.md`, "What a deploy does to a page a browser already holds"). Each on-demand chunk, once: built from its module and, for `supabase.js` and `three.js`, the files of its package and that package's dependencies, nothing else, and named by no page's HTML (a signed-out reader on an ordinary page must never download the account library, and a page with no 3D never Three.js; only the `import()` fetches it). The order the files run in is not in the minified chunks (rolldown wraps each module and calls the wrappers in the entry's order under `strictExecutionOrder`, `vite.config.ts`); the browser suites prove it by what the pages build. No page names a source script by its own path, and nothing is at `assets/<script>.js`, `data/…` or `assets/boot.js`: the copies the release of the module entries kept for cached pages are over (`OPERATIONS.md`, "Scripts") |
| `offline` | nothing a page needs comes from another server: no `<script src>` and no `<link href>` (stylesheet, module preload, icon) with an `http(s):` or `//` URL, no `preconnect` or `dns-prefetch` at all, and no `url()` or `@import` in a built stylesheet that names another server. No font is a `data:` URL either (`vite.config.ts` `assetsInlineLimit: 0`; the site's own `data:` SVG marks in `site.css` are not fonts). `<a href>` links in the content are the author's and are not touched. What a script fetches is not a tag on the page (Three.js is the bundle's own `bundle/three.js`); the browser checks hold the requests (`lib/browser.js`) |
| `secrets` | no file in `dist/` contains a key: `sb_secret_` followed by a key's body, `whsec_…`, `sk-ant-…`, a Stripe-style `sk_live_…`/`rk_test_…`, or `service_role` (in any case, so `SUPABASE_SERVICE_ROLE_KEY` too) with something key-like assigned to it. The shape of a key, not its prefix alone, because supabase-js, now in the bundle, names the prefixes of its own keys and says `service_role` in its doc comments, which its source map carries; `checks.test.js` holds the patterns to a real key of each kind and to that text. A legacy Supabase key is a JWT, whose role is base64-encoded and matches no pattern, so every JWT-shaped token is decoded as well and fails unless its role is `anon`. (The Supabase anon key in `assets/config.js` is public by design and passes) |
| `stylesheets` | reports how many distinct stylesheets the built pages link, and fails if two chapter pages link different ones. Also the cascade: Vite splits the CSS into shared files and, left alone, links a page's own file before the shared ones, the reverse of the source (`vite.config.ts` puts them back). So for every page, the class names only one source stylesheet uses must all come, in the built CSS the page links, before those of the next source stylesheet. And the text: each of the site's stylesheets a source page links must be, byte for byte, inside one of the stylesheets the built page links. `vite.config.ts` sets `build.cssMinify: false` for that: Vite's minifier (Lightning CSS) rewrites values the scripts read (`--plot-fill: rgba(38, 70, 212, .14)` becomes `#2646d424`, which `parseColor` in `assets/scenes3d.js` returns `null` for) and merges selectors into `:is()`, changing their weight. The vendor stylesheets (`src/vendor/fonts.css`, `src/vendor/katex.css`; `VENDOR_STYLES`) are `@import` rules of package stylesheets that the build inlines, and rules of their own that name package files (`fonts.css`: the `@font-face` rules `gen-fonts.js` writes, whose `url()`s the build points at the copies beside the bundle), so for them: each imported stylesheet's text, then the file's own, with every `url()` reduced to the file's name on both sides, must be in the built stylesheet, in that order, and all of it before the site's own stylesheets, so that `site.css`'s rules on `.katex` come after KaTeX's and win as they did when KaTeX's stylesheet was a CDN link. The names, as for the chunks: a built stylesheet is `bundle/<kinds>.css`, and every source stylesheet in it (a vendor one by its imports' text) is linked by exactly those kinds (`VENDOR_STYLES`, `PAGE_KINDS`). Last, the link: a built link to one of the site's stylesheets carries `rel` and `href` and nothing else, as the source's do. Vite adds `crossorigin`, and `vite.config.ts` takes it off again |
| `licences` | `dist/bundle/LICENSES.txt` is there and is, byte for byte, the notice `lib/vendor.js` `licenseNotice()` writes from the packages installed now (one section per package the vendor modules bring in, with their dependencies: name, version, the `license` field, the vendor module, and the licence file the package ships; `vite.config.ts` `licenses()` writes it at build time), so a build made before an `npm ci` fails here. And the notice covers what is in dist: every font file (`.woff`, `.woff2`, `.ttf`) is, byte for byte, a file of one of those packages, and every `node_modules/` source of every chunk (by its source map) is from one of them. The font licence (SIL OFL 1.1, all three typefaces and the KaTeX fonts) asks that copies of the fonts carry the copyright notice and the licence, and the fontsource files carry neither in their name tables; the KaTeX fonts do, and the notice says so. A package that ships no licence file is a warning |

## Deliberately not covered

- Firefox and WebKit/Safari (Chromium only: it is the one browser `npx playwright install chromium` downloads).
- Real devices and touch: the 360px cell is a resized Chromium, not a phone.
- Screen readers and focus order beyond what axe-core can see statically. axe runs on each page as
  it loads (then in whole-page mode on a chapter), with clean storage, at 1280 and 360 only: a clue
  opened, a verdict, a boss result, a solved card, an Arena question or a width in between is not
  in what it sees.
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
| `checks.test.js` | the checks themselves, on small pages written in the test: `progress-keys` (a changed, dropped or reused key fails, scored or inline; ids written onto positional keys pass), `ids` (an `id` such as `constructor` is only a name), `lesson-steps` (an added step and a cut that moves at the same count both show), `assign-ids.js` (nothing is written, or said to be, when one page cannot be converted), `lib/shell.js` (each kind of page gets the vendor stylesheets then its own, the boot script inline before them, its one module entry last and no classic script, nothing in its head from another server, its top bar and path prefix; the chapter entry imports every scene file, after the framework and before `site.js`; every entry imports `src/vendor/katex.js` first; the content is not touched; each way of writing a page wrong, `data-scenes` included, is refused with its reason; nodes carry source-file lines), `lib/vendor.js` (the vendor modules and their packages, `fonts.css`'s by the files its `url()`s name, a dependency placed with the module that brings its package in, a script and a stylesheet of the same package placed apart, an unknown package refused; `vendor.d.ts` declares what it exports; `package.json` pins `katex` at exactly 0.16.11 and holds `three` to a minor with `@types/three` of the same one; `src/vendor/three.js` exports, by name and each once, exactly the Three.js names `assets/map3d.js` and `assets/scenes3d-gl.js` use, and nothing reads `window.THREE`; `packages()` is every package of every vendor module with its licence file, and `licenseNotice()` has a section per package with that file's text, the Open Font License's text among them and the KaTeX fonts' own notice), `gen-fonts.js` (`FACES` is the Google Fonts link's faces and no other; `src/vendor/fonts.css` is what it writes; every `@font-face` names one weight, never a range, one of the three families the tokens name, `font-display: swap`, a `unicode-range`, and a file of an installed fontsource package: the variable file for an upright face, the static instance for the italic), the `shell` check (an attribute added to a link, two stylesheets swapped, a CDN script put back, an edited boot script, a changed body attribute or top-bar link each show; a second module, a classic script of the site's own or from a CDN, another kind's entry or a boot script that is not `src/boot.js` fail whatever the record says; `tools/shell.json` records every page and names no other server), the `secrets` check of `check-dist.js` (a real key of each kind fails, supabase-js's own text passes) and `apply-shell.js` (whole pages are found again as the kind they were written from; a page no kind expands to, or one whose content differs from the base by a byte, fails and nothing is written) and `lib/serve.js` (a build goes out as it is, a page in it that still carries a marker is refused, a fixture goes out as it is) |
| `check-gen.js` | every Arena generator over 500 seeds: deterministic, no `NaN`/`undefined`, the key and every declared alternative graded right, near misses graded wrong, hints that do not give the answer, every chapter covered |
| `gen-fonts.js` | not a check but a writer, with one: `npm run gen:fonts` writes `src/vendor/fonts.css` from the fontsource packages' own stylesheets, one `@font-face` per family, style, requested weight and subset, as Google Fonts declared them for the link the pages used to carry (`FACES` in the script is that link); `--check` (which `checks.test.js` runs) fails when the file is not what it would write, so a fontsource update that changes a subset or a file is noticed and the file regenerated, never edited by hand. The variable packages are not imported as they are because their stylesheets name the family `Inter Variable` and declare `font-weight: 100 900`, under which the site's `font-weight: 650` would render as a true 650 where Google's single-weight faces gave it the 700 face |
| `game/merge.test.js` | `BMAccount.merge` with the game store: commutative, associative, idempotent, over states that also carry fields this version has never heard of; every such field comes out of the merge, by the one rule for them (the later canonical JSON), and `game.v` is the larger number; the help ladder's `rung` keeps its own rule (the larger number) in every merged attempt record. Spot checks pin the limits of that rule: keys named like inherited properties are carried and `__proto__` is not, and an object under an unknown key of a keyed store is merged as a record of that kind. Last, the writers in `assets/site.js` (`BMProgress`, `BMPlay`, `BMAttempts`) write a fresh record over an entry that is not one, which a merge now passes through |
| `game/sync.test.js` | account sync in `assets/account.js` against an in-memory stand-in for Supabase, one vm per device: stale tabs and simultaneous saves never overwrite newer progress, resets are neither undone nor allowed to wipe later work, a sync never lands in the wrong reader's account, and signing out sets unsaved progress aside instead of wiping it. Other versions of the site and of the tables: fields a later version saved survive a sync from a device with changes of its own, at every level and in a column this version does not know; a row or a browser in a newer shape (`game.v`) is merged and never written, with the page asking for a reload; a server without the `game` column syncs the rest; a project without the `attempts` table syncs, keeps the log queued without sending it again with every save, and holds no more than the newest 500 checks; a reset leaves a column this version does not know. Two of these run on `account.html`, where the account-page half of the file shares its scope with the sync: a sign-in and sign-out there keep the account whole, and the page says to reload for a newer shape. A sync whose merge fails is never followed by a save of the unmerged copy. Also sign-in through another service: only configured services are offered, Microsoft is asked for the email address, and a reader with no email address still syncs |
| `game/account.test.js` | the account page in Chromium with `BM_CONFIG` pinned and a stand-in for supabase-js put on `window.supabase` before the page's scripts run (the seam `account.js` keeps: a client library already there is used instead of the bundled one): provider buttons in config order with text labels, the hand-over call, a refused sign-in explained and removed from the address, the signed-in panel with and without an email address, no overflow at 360px. Then without the stand-in: a signed-out visitor on a chapter page and on the about page asks no other server for anything and never for `bundle/supabase.js` (the list of what the page did ask for is printed), and the account page fetches that chunk once, from the site itself, and draws the form with the real library while every request off the local server is aborted |
| `game/rules.test.js` | combo, levels, hearts, medals, achievements, recall and run records, as pure functions (with `window.BMReview` from `src/ui/review.ts`, which Node loads itself, types stripped, as every page puts it up before `game.js`); `recordRun`'s XP across a simulated day: the day's first run in full however many answers share a section, then less per section the more answers earlier runs paid (1, 1, ½, ½, then ¼, rounded once per run), retries counted like first tries and unpaid ones not at all, the finishing bonus in full for two finished runs then 1, a banked run no finish, the Daily's 10 untouched, the counts on this device only, fresh on a new day (the clock moved on), a later day's counts kept when an older run settles, a later day's counts dropped when the clock is set back to before it (and that day's decay still applied), damaged counts read as none; the deck's rows carrying the day each section was last solved on its page (`seen`); play settings and game records keep keys this version does not know through every write, and switching a setting never announces a synced change. And the one invariant of the reward rules: every road an exercise can take to its first right answer (clues 1 to 3, up to two wrong checks, the solution, in any order) is run through the real rules (`assets/site.js` `xpFor`, `paysFirst` and `road`, loaded under a stub window; `assets/game.js` `bonus`, the attempt event of every check, `setStats`), then followed by five answers right first time from every meter (0 to 5 pips, with and without a shield), because the pips a road keeps pay on the answers after it; XP, combo, hearts and medal are held together. No help costs a heart; a clue costs no pip and leaves the medal as it was; the solution opened costs nothing at the opening, and the first answer given with it open costs the pips and the medal a miss in its place would. No help pays more than effort, on the exercise or by any answer after it: no road out-earns the same road with its help taken out, and no road with the solution out-earns the same road with a miss in the solution's place (a right first answer after clue 2 or 3 pays what miss-then-solve pays on the exercise and keeps the pips a miss loses, by design). A cleared set's medal is the one the old rule gave |
| `game/browser.test.js` | the game layer in Chromium: XP and combo, hearts, the finale, reloads, calm mode, sound, older saved progress, toasts, the settings sheet. The help ladder: the clue button from the start, wrong answers that open nothing, a clue that opens on a click with focus on it and is still open after a reload, a question for a sign-flipped answer, the solution opened on an untouched exercise costing no heart and no pip, and answering it then paying 3 XP and the two pips a miss would cost, 6 XP and no pip for a right first answer after clue 2, the finale's line counting the problems solved with the solution open beside three hearts kept and a Silver medal, and the keyboard path through clue, check and solution. The next-step card: the right first item for four stored states (a section due: the due review; a weak one, on a chapter page: a Repair run; only a place to continue: Continue; a section the Arena can ask about solved on its page a minute ago and one it cannot solved three days ago, never placed: Continue, with the review lobby naming tomorrow for the first and listing the second as due on its page, and the Arena's deck list not marking the first Due), the lobby's nothing-due line when only sections without problems are solved, each with its reason, never a child of `<main>` (in the chapter's banner), "Hide for today" taking it away with focus on the heading, writing the day to `bm.run.v1` and nothing synced, still away after a reload and back the next day, and kept in Study mode without its coloured edge. The request for `bundle/three.js` is aborted, so the stages and the course map take their flat fallbacks whatever the machine's WebGL (the script is in the deploy gate, which is not retried) |
| `game/arena.test.js` | the Arena in Chromium: scoring, par and the clock, hearts, Daily, Repair, resume, calm mode mid-run, two tabs. The due review (`arena.html?mode=review`): the lobby tile and the review's own lobby list only the sections due today, most overdue first, and a due section with no generator apart, as "due, on the page" with a link to it; the run has no hearts, every question heart-free, two questions a section taking turns; its answers move the boxes by the usual rule (a clean due showing up one, a miss to box 0); the result shows the first-try count and rate with no target band and no 85 percent figure; with nothing left due (and with nothing due at all, in Study mode) the lobby says so and names the day of the next check. XP against farming across a simulated day: the day's first Repair (five answers on one section) pays in full and mentions no reduction; a second Repair of the section that day pays a quarter an answer, and the result says so in plain words; the third finished run pays 1 for finishing and says so; a new local day starts the counts again; the counts (`bm.run.v1.arenaDay`) never reach the synced game record. The Arena's own fallback, with `BMGame.recordRun` taken away: a clean due showing moves a box up one, an early clean one leaves box and date alone, a miss sends it to box 0 (not 1), and the XP takes the day's decay from the stored counts |
| `game/scenes.test.js` | 3D stages in Chromium on the SVG painter (the request for `bundle/three.js` is aborted, so Three.js never arrives): keyboard and buttons, touch scrolling, contrast of meaningful marks in both themes. Then the painters, in a second Chromium under the SwiftShader flags with the chunk served: on every page with a scene, every stage (exercise copies too) reaches the GL painter with `BM3D.load()` true, the painter's manager held and its context not lost; without WebGL, `load()` is false with the reason `no-webgl`, the chunk is never asked for, and every stage falls back to the SVG painter. The parity oracle for the scenes, as `BMMap3D.info()` is for the map |
| `game/content.test.js` | the new 3D exercises in chapters 8 and 16, answered through the page, with the request for `bundle/three.js` aborted as in `browser.test.js` |
| `game/map.test.js` | the course map: no rendering while idle, clicks that match the list links, and the loader: the page asks for `bundle/three.js` once and holds the namespace on `BM3D.THREE` with nothing on `window.THREE`; when that request fails `load()` says false with the reason `cdn` and the list stands alone; when it stalls past the loader's timeout the reason is `timeout`; a later `load()` shares the answer |

The browser ones resolve Playwright and load the build like `check-browser.js` (`dist/`, current,
or `--root`/`BM_ROOT` naming a build elsewhere), and each aborts every request that does not go
to the local server (the server's own origin, where the module chunks, the fonts, KaTeX and
Three.js come from, is let through), so none of them needs the network.
