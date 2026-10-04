# tools/ — the verification harness

Two general scripts, plus focused ones for the 3D scenes, the Arena's generators and the game
layer. None needs a `package.json`, a build, or anything installed into this repo.

```sh
node tools/check-static.js                 # ~2 s, Node built-ins only
node tools/check-browser.js                # ~8 min, Playwright resolved from a sibling project
```

Both exit 1 on any failure. Run them before and after a change; the static one on every edit,
the browser one before a push.

## check-static.js

Usage: `node tools/check-static.js [--base=<git ref>] [--only=<check,check>] [--strict]`

One line per check, `PASS`/`FAIL`/`WARN` plus the number of things examined, then the details.
`--base` is the commit the progress keys are compared against (default `8ff7abc`, the tree the
harness was written on — move it forward when a change to the exercises is deliberate). `--strict`
makes warnings fail.

| check | what it guards |
| --- | --- |
| `syntax` | `node --check` on every `.js` under `assets/` (recursively), `data/`, `tools/` |
| `es5` | no arrow functions, `let`, `const`, template literals or `class` in `assets/` and `data/` (strings, regex literals and comments are stripped first; `{ class: … }` property names are allowed) |
| `progress-keys` | every scored exercise key at `--base` still exists in the working tree with the same answer and question text; no scored exercise added since then lacks an `id`; no duplicate keys. Uses the key rule of `site.js initExercises` exactly (`lib/keys.js`) |
| `curriculum` | every chapter in `data/curriculum.js` has its file, the right `data-chapter` and `data-depth`, and every section id as an `<h2 id>` (an id on another element is a WARN) |
| `links` | every relative `href`/`src` resolves to a file, and its `#anchor` to an id in that file; ids created at runtime are allowlisted in `RUNTIME_IDS` with a note on where they come from |
| `widgets` | every `data-widget` / `data-figure` names a `W.<name> = function` in `assets/widgets.js` or a `BM3D.define("<name>"` in `assets/scenes/*.js` |
| `sections` | every `data-section` is a section of the same chapter or `chNN#section` of a real one; scored exercises without one are listed as a WARN |
| `choices` | choice/multi answer indices lie within the `<li>` options |
| `order` | order lists have at least two items; every `.blank` carries a key |
| `placeholders` | no typed exercise's `data-placeholder` shows an example that its own key accepts: the whole placeholder and the part after `e.g.` are run through the site's grader (`BMSite.grade`, loaded from `assets/site.js` under a stub `window`) with the exercise's type and `data-tol` |
| `merge` | `BMAccount.merge` (loaded from `assets/account.js` under a stub `window`) is commutative, associative and idempotent over 2000 seeded random store states, after dropping the deliberately local-first fields (`last`, `activity.goal`, `lesson.mode`, `play[ch].guess`). The states include a `game` object in the shape the game layer will use; its assertions switch on once the merge output has a `game` key |
| `animations` | WARN for every `animation … infinite` in `assets/*.css` (a FAIL under `--strict`) |
| `contrast` | WCAG 2.x contrast for every pair in `tools/contrast-pairs.json`, in the light and dark token tables and, for pairs with `parts: true`, under each Part's overrides. Pairs naming a token that is not defined yet are reported as SKIP; non-opaque or unparseable values are skipped with a note |

`tools/contrast-pairs.json` is a list of `{ fg, bg, min, themes?, parts? }` using token names. Add a
pair when a new token appears; delete nothing — a pair that goes undefined is a SKIP, not a failure.

### Adding a check

Write `function checkThing(ctx, r)` in `check-static.js` — `ctx` has every page parsed
(`ctx.docs[rel]`), the chapter ids (`ctx.chapters[rel]`) and the curriculum; `r.fail(msg)`,
`r.warn(msg)`, `r.note(msg)` and `r.count` are the output — and append `{ name, run, what }` to
`CHECKS`. The HTML parser (`lib/html.js`) gives nodes with `queryAll(".ex, ol.order")`,
`getAttribute`, `textContent`, `id`, `line`.

## check-browser.js

Usage: `node tools/check-browser.js [--only=<substring>] [--theme=light|dark] [--vw=1280|360] [--base=<ref>] [--headed] [--strict-axe] [--list]`

Playwright is **not** installed here. It is loaded with `module.createRequire` from
`$BM_PLAYWRIGHT_FROM` (a `node_modules` directory; default `~/dev/json-data-drift-analyzer/node_modules/`),
which must hold `playwright` with a downloaded Chromium; `axe-core` there is optional. If it cannot
be resolved the script says so and exits 2.

The repo is served in-process on a free port (`lib/serve.js`); `/__base/<path>` serves the same
path at `--base` through `git show`, so the previous commit's site is browsable for comparison
without a checkout (`node tools/lib/serve.js` runs the server on its own).

Output goes to `.cache/check/` (git-ignored): `report.json`, `index.html` (a contact sheet with
every screenshot and all results — open it in a browser), and `pages/*.png`.

| suite | what it does |
| --- | --- |
| `webgl` | runs first. Loads `fixtures/webgl-probe.html` under three Chromium arg sets in turn and launches the shared browser with the first that gives a WebGL context; reports the renderer. Also self-tests the `noWebGL` and `blockUrl` helpers |
| `pages` | every page × light/dark × 1280×800/360×740 with clean storage: console errors, uncaught errors, same-origin 404s, horizontal overflow, `body[data-lesson="steps"]` and the mode switch on chapter pages, then the switch to whole page and a full-page screenshot. Third-party failures (fonts, KaTeX CDN) are warnings |
| `widgets` | every `[data-widget]` has an `svg`/`canvas` and no failure note; then each slider is set to min/max/min with `input` events, each `button.chip` is clicked, and a focusable SVG gets arrow keys and Space. Any exception fails |
| `missions` | with clean storage no `.missions li[data-done]` exists, headings read "0 of n", `BMPlay` is empty, `BMMissions.total()` matches the page |
| `exercises` | per chapter, in whole-page mode: a wrong answer on the first scored typed exercise shows feedback with the hint, then the key is accepted; then every exercise is answered with its own key (typed: type and Enter, trying `\|`-alternatives in the engine's order; choice/multi: tick and Check; blank: fill each; order: the up buttons; `figure` kinds are skipped and counted); the score line and completion banner agree; after a reload every solved scored exercise is `data-state="correct"` with `data-restored` and the lesson mode is remembered |
| `restore` | seeds `bm.progress.v1` with every scored key of the chapter **at `--base`** and loads the working-tree page: each card's engine key must equal the static rule's key for its position, each restored card's question must fingerprint the same as at base, and lesson mode must open every step for a reader with solved work |
| `motion` | under `prefers-reduced-motion: reduce` no animation is running at load, after a wrong answer, or after a right one |
| `file` | `index.html` and the first chapter loaded from `file://` build themselves without errors |
| `axe` | axe-core on every page × theme at 1280 (whole-page mode on chapters); violations are warnings counted by rule, failures with `--strict-axe`; skipped when axe-core does not resolve |

`--only` takes suite names (`--only=pages,motion`) or a page-path substring (`--only=05-distance`),
or both. The theme is forced the way the site reads it — `localStorage["bm.theme"]` holds the
JSON string `"dark"`/`"light"` (note the quotes: every store value is `JSON.stringify`ed) and the
context's `colorScheme` matches — so a `boot.js` that reads the same key before paint is covered too.

### Adding a suite

Drop a file in `tools/suites/` exporting `{ name, order, description, run(ctx) }`. The runner
loads every file there; nothing is registered by hand. `ctx` carries the browser, the server URLs,
the page lists, the curriculum, the flags and the helpers in `lib/browser.js` (`newPage` with
theme/viewport/storage seeds/reduced motion/no-WebGL, `open`, `settle`, `wholePage`, `screenshot`,
`noWebGL`, `blockUrl`); results go through `ctx.report.pass/fail/warn/skip`. The full interface is
documented at the top of `check-browser.js`. `lib/drive.js` answers exercises by kind for suites
that need a solved or a wrong card. A `game`, `scenes` or `arena` suite is one more file.

## Deliberately not covered

- Firefox and WebKit/Safari (Chromium only; the sibling project has only Chromium downloaded).
- Real devices and touch: the 360px cell is a resized Chromium, not a phone.
- Screen readers and focus order beyond what axe-core can see statically.
- Answers given on a figure (`data-type="figure"`): the sweep counts and skips them.
- Visual regression against the base commit: screenshots are taken for eyes, not diffed.
- The real Supabase account path: the browser suites never sign in, and `game/sync.test.js`
  runs against a stand-in that mimics PostgREST and auth-js rather than the service itself.

## The focused checks

| script | what it guards |
| --- | --- |
| `smoke-scenes.js` | every 3D scene under a small DOM shim: mounts in figure and quiz mode, missions false at mount, every control driven, every `cases` answer reachable and graded right |
| `check-gen.js` | every Arena generator over 500 seeds: deterministic, no `NaN`/`undefined`, the key and every declared alternative graded right, near misses graded wrong, hints that do not give the answer, every chapter covered |
| `game/merge.test.js` | `BMAccount.merge` with the game store: commutative, associative, idempotent |
| `game/sync.test.js` | account sync in `assets/account.js` against an in-memory stand-in for Supabase, one vm per device: stale tabs and simultaneous saves never overwrite newer progress, resets are neither undone nor allowed to wipe later work, a sync never lands in the wrong reader's account, and signing out sets unsaved progress aside instead of wiping it |
| `game/rules.test.js` | combo, levels, hearts, medals, achievements, recall and run records, as pure functions |
| `game/browser.test.js` | the game layer in Chromium: XP and combo, hearts, the finale, reloads, calm mode, sound, older saved progress, toasts, the settings sheet |
| `game/arena.test.js` | the Arena in Chromium: scoring, par and the clock, hearts, Daily, Repair, resume, calm mode mid-run, two tabs |
| `game/scenes.test.js` | 3D stages in Chromium: keyboard and buttons, touch scrolling, contrast of meaningful marks in both themes |
| `game/content.test.js` | the new 3D exercises in chapters 8 and 16, answered through the page |
| `game/map.test.js` | the course map: every fallback, no rendering while idle, clicks that match the list links |

The browser ones take `BM_PLAYWRIGHT_FROM` like `check-browser.js`.
