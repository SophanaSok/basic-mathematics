# tools/ — the verification harness

Three general scripts (the source tree, the built `dist/`, and the site in a browser), plus
focused ones for the 3D scenes, the Arena's generators and the game layer. They are plain Node
scripts, CommonJS (`tools/package.json` says so, because the repo's own `package.json` is
`"type": "module"`), and the repo's npm scripts are the way to run them:

```sh
npm ci                                     # once; then `npx playwright install chromium` for the browser ones
npm run check                              # ~20 s, no browser: typecheck, check-static, check-ci,
                                           # check-gen, smoke-scenes, the merge, sync and rules tests, and
                                           # the Vitest unit tests of src/ (npm run test:unit:
                                           # src/**/<module>.test.ts beside each module, the
                                           # help ladder's, and the review's: recall, review,
                                           # practice, next, and data/arena-sections against
                                           # the generators; data/skills, the override rule
                                           # and the lookups; a11y/math-text, the line of
                                           # text a formula is named by, against every
                                           # formula of the course; the HUD's and the course
                                           # world's)
npm run build && npm run check:dist        # dist/, and that it is the source's site
npm run build:redirects && npm run check:redirects  # dist-redirects/, what the old address serves
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

It is served as Cloudflare Pages serves it (`lib/serve.js`, `lib/headers.js`): the build writes
`dist/_headers`, and every response of the served tree gets the headers that file gives its path,
the Content-Security-Policy first. So every browser script runs the pages under the policy readers
get. A script, style, font, image or connection the policy does not allow is blocked, and Chromium
reports it as a console error; on top of that every context of a Chromium launched through
`lib/pw.js` reports each violation as an uncaught page error (`guardCsp`), which `check-browser.js`
(`lib/browser.js` `track()`) and every `game/` script that watches `pageerror` count as a failure.
axe-core goes into a page through `page.evaluate` (`lib/browser.js` `injectAxe`), which the policy
does not govern, because an inline `<script>`, Playwright's `addScriptTag` with content, is exactly
what it refuses. A page is also found without its `.html` (`/about` serves `about.html`), as Pages
serves it after redirecting the one to the other. `tools/fixtures/` and `/__base/` get no headers:
they are not the site being checked. To see a violation fail the run, take one of the two
`'sha256-…'` sources out of `dist/_headers` and run `node tools/check-browser.js --only=pages,01-numbers
--vw=1280 --theme=light`: the page fails with Chromium's message and the reporter's, and
`check-dist.js` `headers` fails the edited file.

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
  stylesheets, then the opt-in to view transitions between pages as one inline `<style>`
  (`OPT_IN`; the README's "Between pages" says why it is not in a stylesheet), and before its kind's stylesheets the two vendor ones (`VENDOR_STYLES`:
  `src/vendor/fonts.css`, the `@font-face` rules `gen-fonts.js` writes from the fontsource
  packages, then `src/vendor/katex.css`, an `@import` of the npm package's CSS that the build
  inlines), ahead of the site's own so that `site.css`'s rules on `.katex` come after KaTeX's
  and win, as they did when these were links to Google Fonts and the KaTeX CDN.
  Nothing in a page's head names another server.
- The top bar is written whole: the brand, the page links (`NAVS`), the HUD with the slots of the
  page's kind (the hearts on a chapter and in the Arena, the clock in the Arena alone:
  `HEARTS_ON`, `TIMER_ON`), the account chip, the sound and menu buttons, the Arena's second row,
  and the settings sheet, a `<dialog id="hud-sheet">` whose inputs name their preferences in
  `data-pref`. Straight after it comes the HUD script, `hudScript()`: the text of
  `HUD_MODULES` (`src/hud/levels.js`, `src/hud/view.js`) in one function, their `export`s, their
  one `import` and their comments taken off, which fills the HUD from localStorage before the
  first paint and leaves its functions on the page as `window.BMHud`. Any other `export` or
  `import` form in those files, a closing script tag, or a result that does not parse throws.
  `hudLibrary()` is the same text without the fill, for a Node test that wants `BMHud`
  (`game/rules.test.js` loads it before `assets/game.js`).
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
- It reads the files it inlines, the boot script (`bootScript()`) and the HUD modules
  (`hudScript()`), through `readSource`, which `useSource(fn)` replaces: `vite.config.ts` imports
  the file as it is, and a commit's own copy can be run from `git show` with that commit's own
  sources (`lib/site.js` `shellAt`).
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
`--base` is the commit the progress keys are compared against (default: `DEFAULT_BASE` in
`tools/lib/site.js`; move it forward when a change to the exercises is deliberate).
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
| `shell` | for every page, what `lib/shell.js` writes around the content is what `tools/shell.json` records for it: every tag of `<head>` in order with its attributes (so the title, the description, each stylesheet, each script; the inline boot script and the inline `<style>` as fingerprints of their text), the `<body>` tag without the two attributes only the shell reads, the skip link and top bar as the words and targets of its links and buttons (the settings sheet's among them), and the HUD script after it as a fingerprint of its text. A page with no record, and a record with no page, fail too. And whatever the record says, the scripts of every page are the boot script inline (its text `src/boot.js`) and one `<script type="module">` naming the entry of the page's kind (`src/entries/<kind>.js`, a file that exists) in `<head>`, and in `<body>` one script, the HUD script inline (`hudScript()`) straight after the top bar: any classic `<script src>`, of the site's own or from a CDN, a second module, another kind's entry or any other script in the body fails. `--shell-base=<ref>` compares with the pages of a commit instead, each as a reader of that commit got it |
| `curriculum` | every chapter in `data/curriculum.js` has its file, the right `data-chapter` and `data-depth`, and every section id as an `<h2 id>` (an id on another element is a WARN) |
| `links` | every relative `href`/`src` resolves to a file, and its `#anchor` to an id in that file; ids created at runtime are allowlisted in `RUNTIME_IDS` with a note on where they come from. The stylesheets, the module entry and top-bar links the shell writes are among them, so an entry named in `PAGE_KINDS` that has no file fails here, on the line of the head marker |
| `widgets` | every `data-widget` / `data-figure` names a `W.<name> = function` in `assets/widgets.js` or a `BM3D.define("<name>"` in `assets/scenes/*.js` |
| `sections` | every `data-section` is a section of the same chapter or `chNN#section` of a real one; scored exercises without one are listed as a WARN |
| `skills` | `src/data/skills.ts` (read by Node itself, as `placeholders` and `answer-spec` read `src/ui/core.ts`) against the course; its count is the curriculum sections, each counted once, 76. Every section has a record in `SKILLS` or is in `CONTAINERS`, never both, and `SKILLS` has no other key; `CONTAINERS` is exactly the sections anchored on a `<section class="practice">` with no `<h2>` (the four mixed reviews), found as `curriculum` finds them. Every scored exercise's `data-section`, made a ref with `sectionRef` (`src/core/curriculum.ts`: a bare value is its own chapter's), names a section, never a container (that it names a real section is `sections`' rule): an exercise with none fails here, where `sections` only warns. A section's anchor comes from `sectionAnchors`. Every code in `ccss` and `also` has the official form without its `CCSS.Math.Content.` prefix (`8.EE.C.7.b`, `HSA.REI.B.4.b`), is one of the 237 grade 6 through high-school standards in `tools/fixtures/ccss-codes.json` (parsed from the CCSS PDF, with each standard's and sub-standard's (+) mark), with a sub-standard letter that standard has; `also` repeats neither the primary code nor itself. The course follows the code unless the code is approximate: grade 6–8 is `pre-algebra`, a (+) standard or sub-standard is `beyond` and `beyond` is (+), a high-school one is `algebra-1`, `geometry` or `algebra-2`. Every Arena generator (`data/gen/*.js`, run in a vm) names a section with a record; every `GENERATOR_SKILLS` key is a generator and its override changes the record, which is resolved with the module's own `resolveOverride` and held to every rule here. No tag is repeated in a list, and `act.mod` is never first. A tag's spelling is `npm run typecheck`'s: the tag lists are unions |
| `section-work` | `src/data/section-work.ts` (read by Node itself) against the pages: its keys are the curriculum sections that offer any exercise, in reading order, each with the number of exercises its page has, 69 sections and 340 exercises. A scored exercise counts for its `data-section`, made a ref with `sectionRef` (a bare value is its own chapter's; none and `warmup` credit no section); an inline `data-inline` check for its own `data-section` if it has one, else for the nearest preceding top-level `<h2 id>` under `<main>`, as `assets/site.js` `sectionOf` reads it (the warm-up block is no section). A section absent from the table has none, so a reading section or a mixed review is left out and a `0` entry fails. A count that differs, a section missing, a key that offers nothing, and an exercise credited to a ref that is no curriculum section each fail, naming the line of `section-work.ts` to change |
| `choices` | choice/multi answer indices lie within the `<li>` options |
| `order` | order lists have at least two items; every `.blank` carries a key |
| `migrations` | if `supabase/schema.sql` differs from its content at the base, at least one file in `supabase/migrations/` is new since the base; every file there is named `<YYYYMMDDHHMMSS>_<name>.sql` with a real UTC date and a lower-case name, and no two share a timestamp; every migration that was at the base is still there, byte for byte; a new one is not empty and its timestamp is later than every one at the base. The base is not `--base`: it is `--migrations-base=<ref>` if given, otherwise the commit `HEAD` left `main` (or `origin/main`) at. Only where neither resolves does it fall back to `--base`, with a WARN, because against a base older than the migrations it lets a schema change through. It cannot see whether the migration was applied, which is a step in [`../OPERATIONS.md`](../OPERATIONS.md) |
| `placeholders` | no typed exercise's `data-placeholder` shows an example that its own key judges `right` or `form`: the whole placeholder and the part after `e.g.` are each judged with `judge(given, specOf({answer, type, tol}))` from the core object every entry puts on `window.BMCore` (`src/ui/core.ts`, read by Node itself), with the exercise's type and `data-tol`, as `assets/site.js` judges a typed answer. A `form` example (a rounding of the key, a point in square brackets) fails too: it shows the right value in another form. `wrong` and `unread` pass |
| `answer-spec` | what each key on a page promises the grader (decision 0002), by the spec `site.js` judges it with: a typed box by its `data-type` (exact when it has none), each blank by its own (number when it has none) with the card's `data-tol`, a choice as a number, a tick-every-option list as a set, a figure by its `data-compare`; an order is never graded. A `data-tol` is a finite number ≥ 0, and is not on an exact or expr key, which are compared as text. Every entry of `alternatives(key)` after the first (the whole key), or the only one when there is one (no bar, or one `\|e\|` such as `\|x\|`), is judged `right` against the key under its own spec, so `1/8\|0.125` passes and `1/2\|one half` fails. An expr key passes the bar lint (the design's section 3.5): unless the whole key is one `\|e\|`, every `\|` piece is non-empty, does not start with `+ * / ^ )` or end with `+ - * / ^ (`, and is not a single letter other than `i`, so `2\|x\|-1`, `2\|x\|`, `x\|-x` and `2\|x-1\|+3` fail and `1\|i` passes; absolute value is written `abs()`. Generator keys are check-gen's. The core object it loads must have `judge()`, `specOf()` and `alternatives()`, and `assets/site.js`'s `judge()` must call `Core.judge` (read from its source), so the cards show the typed grader's verdicts |
| `pure-core` | no module under `src/core/`, `src/sync/`, `src/learn/` or `src/data/` names `window`, `document`, `localStorage` or `sessionStorage` in its code: its identifiers, strings, templates, JSX text and regexes, read off rolldown's AST (`rolldown/parseAst`, the parser vite builds with, a devDependency pinned to the range vite pins), so a comment is never read and a regex holding `//` or `/*` hides nothing. A string or template is read both as written and as its value, so a name spelled with an escape (`"\u0077indow"`) is found too, on the line the string starts on, and counts as in a string. A known limit: JSX text is read only as written, so an HTML entity (`&#119;indow`) is not decoded. A name inside a string counts, since `globalThis["window"]` would reach it, and the failure says so: copy a reader sees says it another way. A module that does not parse fails. Node and Vitest load these files as they are; the page gets them only through an installer under `src/ui/` (`BMCore`, `BMMerge`, `BMReview`, `BMLearn`), or, for `src/data/`, as data a `src/ui/` module or an entry imports (`src/data/skills.ts` is now imported by `src/learn/diagnostic.ts`). Every script is read (`.js`, `.ts`, `.mjs`, `.mts`, `.cjs`, `.cts`, `.jsx`, `.tsx`) but `*.test.*`, `*.test-helper.*` and `*.d.*` declaration files: the tests build stub windows to run `assets/site.js` under. Erasable TypeScript only (no `enum`, `namespace` or parameter properties) is `tsconfig.json`'s `erasableSyntaxOnly`, which `npm run typecheck` enforces |
| `merge` | `assets/account.js` defines no `mergeGame` of its own: the merge is `src/sync/merge.ts`, one copy, which the page finds on `window.BMMerge` (`src/ui/core.ts`). `BMAccount.merge` (loaded from `assets/account.js` under a stub `window`, with that `BMMerge` put on it first) is commutative, associative and idempotent over 2000 seeded random store states (`tools/lib/random-state.js`, shared with `src/sync/merge.test.ts`), after dropping the deliberately local-first fields (`last`, `activity.goal`, `lesson.mode`, `play[ch].guess`). The states include a `game` object, and what a later version of the site might add: fields no rule knows at every level where the merge builds a record afresh, values that are not records under unknown keys of the keyed stores, and a shape number `game.v`. One of the unknown keys is named like a property every object inherits (`constructor`). The laws must hold with those in, every unknown key, at whatever level it sits, must come out as the later canonical JSON of the two sides, and `game.v` as the larger number. One field of an attempt record has a rule of its own and is held to it: the help ladder's `rung`, the larger number, a number over anything that is not one, the later canonical JSON between two that are not (the states hold clue numbers and, now and then, damaged values); a hand case pins 10 over 9, where the fallback would keep `"9"`. The states' attempt records disagree about their `section` now and then (`sectionConflicts`, one in ten another non-empty section), which the merge's rule for it (`maxSection`: a non-empty string over absent or empty, the greater by UTF-16 code units between two) keeps within the laws |
| `animations` | the flash-and-loop rule, over the site's own stylesheets (everything under `assets/` and `src/` but the generated `src/vendor/fonts.css`): every animation is read from its shorthand or longhands, durations written as tokens (`var(--t-3)`) read from `src/styles/tokens.css`, and it FAILs when one runs forever (`infinite`), repeats more than three times, or repeats with cycles shorter than a third of a second (more than three a second: WCAG 2.3.1 counts flashes per second). It reads the `@keyframes` too (`lib/css.js` `keyframes()`, `flashesPerCycle()`): a cycle that turns its opacity, visibility or a colour back and forth flashes that many times, held to the same three a second, so a strobe inside one 300ms cycle fails. One whose duration, iteration count or any other word is a `var()` the token file does not define fails too, so the rule cannot be stepped round. Animations a script runs (`game.js`'s Web Animations) are not in a stylesheet and not seen |
| `colours` | colours are defined only in `src/styles/tokens.css`: a hex, `rgb()`/`rgba()`, `hsl()`/`hsla()` or other colour-function literal (in any letter case: `RGB(` too) or a CSS named colour (`red`, `black`, `white` …) in the declaration values of any other of the site's stylesheets fails, with its line (an id selector, `white-space` and a quoted string are not colours; a `data:` URI icon, a named colour in a `mask` (only its alpha is read), `transparent`, `currentColor` and the forced-colours system colours pass; a tile edge mixes with `var(--ink-shadow)`, not `black`). In the token file itself, the stroke baked into each answer-blank mark (`--mark-ok`, `--mark-bad`, a `data:` URI that cannot read a custom property) must be that panel's `--ok` or `--bad`, and the tokens WebGL reads (`--region-*`, and `--plot-*` but the fill) must be plain six-digit hex in every theme, panel and Part |
| `reading-column` | the reading column stays quiet: a rule whose selector names one of the column's classes or elements (`column` in `tools/reading-column-allow.json`: the prose blocks, figures, exercise cards, the practice set) may not run an animation, transition something that moves (transform, a size, a position, `all`) or carry ambient decoration (a gradient or `url()` background, a motif mask or background, a blurred or glowing shadow, `text-shadow`, `filter`, `backdrop-filter`) unless the allowlist names that rule (file, selector as written, kind) with the reason. Backgrounds and masks are read through the token file, so `var(--grid-motif)` is the gradient it is, and any motif token (`--motif`, `--grid-motif` …) counts wherever it is defined; the answer marks and icons (`--mark-*`, `--icon-*`) are a state's picture, not ambience. The list started as what the site had: feedback on the reader's own act, the boss of the practice set, the region banner's motif. An entry that matches nothing any more fails as well |
| `us-english` | decision 0001 (the course is in US English and dollars; metric units stay, spelled the US way): `tools/us-english.js` finds the British spellings (its `SPELLING` map, about 1,400 forms: the 142 the course had and every form it bans with none left, `colour`, `grey`, `maths`, `litre` and `metre` with their prefixes (`deca`, `hecto`, `deci` …), the `-ise` and `-yse` verbs and their `-isation`, `-isational` and `-isably` forms, the triangle's centres (`circumcentre`, `incentre` …) and `centre` compounds (`centrepiece` …), `dreamt`, `spoilt`, `enquiry` and the rest) and the pound money (`£`, in a formula too and as `&pound;`, `pound`, `pounds`, `pence` and a price in pence such as `10p`, or a `p` right after an operand of a `+` chain, `n + "p each"`, counted as the form `<n>p`) in what a reader is shown, and this holds each file's count of each form to `tools/us-english-allow.json` (below): a form found more often than allowed fails with its lines and the US word, and an allowance higher than what is found fails too, so the list only shrinks. Reader-facing is the root pages and `parts/` (text, `<title>`, `<textarea>` text, the strings of an inline `<script>` (read as a script's), the reader attributes `data-hint*`, `data-label`, `data-placeholder`, `data-tip` (`site.css` shows it with `attr()`), `placeholder`, `title`, `alt` and the `aria-*` text attributes (`aria-label`, `aria-description`, `aria-roledescription`, `aria-valuetext`), and a title or description meta's `content`; never a comment, `<code>`/`<pre>`/`<kbd>`/`<samp>`, `<style>`, `data-answer`, `id`, `class`, `data-section` or another attribute), the string literals and template text of the scripts under `assets/`, `data/` and `src/` (read off rolldown's AST as `pure-core` reads them, so never a comment or an identifier), but `src/vendor/`, tests (`*.test.*`, `*.test-helper.*`) and declaration files, and those of `tools/lib/shell.js`, which writes the top bar and the settings sheet into every page; a script that does not parse is a problem, and its allowances are not held against it. A string with no space that reads as a key (`"lin-brackets"`; a sentence mark at its end, as in `"Cancelled."`, does not make it one, and `"5p"` is money), an object key, a compared string, a `case` label and the names a DOM call takes (`classList`, `getAttribute`, `querySelector` …) are code (another call's words, `toast("…")`, are not), and a string holding markup is read as markup. A formula is not prose, found as KaTeX's auto-render finds `$…$`, `$$…$$`, `\(…\)` and `\[…\]`, but the body of `\text{}`, `\textrm{}`, `\textbf{}`, `\textit{}`, `\textsf{}`, `\textnormal{}`, `\mbox{}`, `\mathrm{}` or `\operatorname{}` in one is words and is prose again (`$12\text{ metres}$` counts); in a script it is followed across the operands of one `+` chain (a template is one too), an operand that is not a literal keeping the state, so `"… = " + x + "$: centre $"` (`data/gen/part3.js`) reads `: centre ` as prose, and a conditional's branches are read in the state where they land. A word inside an identifier (camelCase, a digit, `_`, a dot between letters) or a URL is code. Wording that is British without being misspelled (brackets, towards, tick, pavement, and the sweep's non-zero, right-angled, disc, Pythagoras, reflection in, mid-line, right first time …) is never in the check: `node tools/us-english.js --report=wording [files]` lists it |
| `contrast` | WCAG 2.x contrast for every pair in `tools/contrast-pairs.json`, in each of the four token tables `lib/css.js` `tokens()` builds from `src/styles/tokens.css` (the light and the dark theme, each with the light reading panel and with the dark one) and, for pairs with `parts: true`, under each Part's overrides. A see-through background is laid over the token the pair names in `over` before it is measured (`--glass` over `--surface`, the lightest thing that can scroll under the top bar), and one with no `over` fails. Pairs naming a token that is not defined yet are reported as SKIP. Fails, too, when a stylesheet other than the token file defines tokens on `:root` or a Part, when a theme block and a panel block set the same name, and when a token a dark-panel block sets is not restated by the `@media print` block for the same selector (or a print answer mark is drawn in another colour than print's `--ok`/`--bad`), so a dark-panel reader never prints dark-panel ink on white paper |

`tools/contrast-pairs.json` is a list of `{ fg, bg, min, themes?, panels?, parts?, over? }` using
token names; `themes` and `panels` (each `["light", "dark"]` by default) narrow a pair. Add a pair
when a new token carries text or a mark; delete nothing — a pair that goes undefined is a SKIP, not
a failure.

`lib/css.js` `tokens()` reads the token blocks by their selector shapes: `:root`,
`:root[data-theme="dark"]` (the frame's shades), `:root[data-panel="dark"]` (the dark reading
panel), `[data-part="id"]` and either condition before a `[data-part]`, plus `@supports` blocks
(their tokens are the ones the browsers they describe use). Print, `prefers-contrast`,
`prefers-reduced-transparency` and `forced-colors` blocks restate tokens on purpose and are not
measured (print is held to restating the dark panel, above). It resolves
`var()` and `color-mix(in srgb, …)` as CSS Color 5 does, so a token made by mixing is measured,
not skipped.

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
(`words -> href` per link and `button: words` per button, the words its `aria-label` or else its
text, the settings sheet's among them, then the HUD script as `<script>#fingerprint</script>`). It was first written from the pages as
they were while each still carried its own copy of the head and top bar, so a difference from it
is a difference from the site before the shell. It is a file and not a comparison with `--base`
for the reason `lesson-steps.json` is: the default base is where the exercise keys were frozen,
and its pages load a different set of scripts. When a change is meant (a script added to a kind in
`PAGE_KINDS`, a new page, a new top-bar link), run
`node tools/check-static.js --only=shell --accept-shell` and commit the file with it: the diff
of the file is the list of pages whose head changed, and how.

`tools/us-english-allow.json` is `{ file: { form: count } }`: every British spelling and money
form the reader-facing text held when the `us-english` check went in, by file and by the form as
written, lower-cased (`"centre": 39`, `"£": 14`, `"10p": 2`), and it ends as `{}`. It only
shrinks: a card that rewrites a file lowers its counts in the same commit, and an entry left
higher than what is found fails. `tools/us-english.js` is the scan, and a command:

```sh
node tools/us-english.js [files]                   # every spelling and money hit, file:line: form -> US
node tools/us-english.js --write [files]           # rewrite the spelling hits, capitals kept (Centre -> Center)
node tools/us-english.js --shrink                  # lower the allow file to what is found; never raises a count
node tools/us-english.js --report=wording [files]  # brackets, towards, tick ...: report-only, never written
```

With no files it reads every reader-facing file. `--write` rewrites only the spelling map:
money is edited by hand (a dollar in prose is `$\$9$`, never a bare `$9`, which KaTeX opens as
a formula), as is wording, and a word spelled with an escape or an entity is listed for a hand
edit. Read every line of its diff before committing.

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

Usage: `node tools/check-browser.js [--root=<dir>] [--only=<substring>] [--skip=<suite,suite>] [--theme=light|dark] [--vw=1280|360] [--base=<ref>] [--headed] [--strict-axe] [--part=<part>] [--list] [--parts]`

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
| `pages` | every page × light/dark × 1280×800/360×740 with clean storage: console errors, uncaught errors, same-origin 404s, the theme on `<html>` at the first animation frame (which comes before the first paint: the inline boot script did its job, so a dark page never flashes light), `window.BMSite`, `BMGame`, `BMStore` and `BM_CURRICULUM` present (the module entry ran, and in order: `game.js` needs `BMStore` when it runs), `window.katex` and `renderMathInElement` present (KaTeX is in the bundle) and at least one formula rendered on a page that has any (auto-render was there when `site.js` ran), **no request to any server but the site's own** (a failure, not a warning: the fonts, KaTeX, supabase-js and Three.js come from the site itself, and a signed-out reader never fetches the account library), **`bundle/three.js` not fetched by a page with no 3D scene and no course map** (only `assets/three-loader.js` imports it, for one of those), **`bundle/world.js` not fetched by a page without the course map** (only `assets/map3d.js` imports it), horizontal overflow, `body[data-lesson="steps"]` and the mode switch on chapter pages, then the switch to whole page and a full-page screenshot |
| `widgets` | every `[data-widget]` has an `svg`/`canvas` and no failure note; then each slider is set to min/max/min with `input` events, each `button.chip` is clicked, and a focusable SVG gets arrow keys and Space. Any exception fails. On a chapter with 3D scenes, one more result, `painters`: every stage is scrolled to and left to settle on its painter first, and under a launch the `webgl` probe found WebGL 2 in, every one must be on the GL painter (`data-painter="gl" data-state="ready"`; `assets/scenes3d.js` falls back to the SVG painter without a console error when the GL one cannot start, and this is the check that sees it). Under `--skip=webgl` (the deploy gate, which is not retried) a stage off the GL painter is a warning that names every stage's painter, not a failure |
| `missions` | with clean storage no `.missions li[data-done]` exists, headings read "0 of n", `BMPlay` is empty, `BMMissions.total()` matches the page |
| `exercises` | per chapter, in whole-page mode: a wrong answer on the first scored typed exercise shows the verdict and an offer line and opens no clue, then **Show a clue** opens clue 1 with the hint's text, then the key is accepted; then every exercise is answered with its own key (typed: type and Enter, trying `\|`-alternatives in the engine's order; choice/multi: tick and Check; blank: fill each; order: the up buttons; `figure` kinds are skipped and counted); the score line and completion banner agree; after a reload every solved scored exercise is `data-state="correct"` with `data-restored` and the lesson mode is remembered |
| `restore` | seeds `bm.progress.v1` with every scored key of the chapter **at `--base`** and loads the working-tree page: each card's engine key must equal the static rule's key for its position, each restored card's question must fingerprint the same as at base, and lesson mode must open every step for a reader with solved work |
| `upgrade` | a returning reader's whole saved state survives. `fixtures/state-v1.json` (every store, as the last release before the build step writes them) is put into localStorage once, on the served origin, before any page loads; then the home page, the progress page, a cleared chapter and a part-done one are opened in the same profile. After each, the fixture must be **contained** in what is in storage: every key still there with the same value. Not equal, because the site writes on load: objects and lists may have gained entries (backfilled achievements, banked medals, the run store), the counts a page re-derives each visit (`total`, `reached`) may have grown, and `bm.last` names the chapter once one has been opened. The pages must show it too: the saved theme against the system's, Continue on the home page, medals and XP on the progress page, every solved card solved and no other. The last line lists what loading added |
| `motion` | under `prefers-reduced-motion: reduce` no animation is running at load, after a wrong answer, or after a right one |
| `hud` | the HUD and the settings sheet. On the contents page, a chapter, the Arena and the progress page, each theme × width, with a reader's level, streak, combo and a boss fight under way, every box of the HUD (the bar, the group, each slot, the account chip, the sound and menu buttons, the XP bar's fill) and what it says are the same before the bundle runs (`readyState` `interactive`), at `DOMContentLoaded` and after load and the fonts: no layout shift, and the reader's numbers were there before the bundle (the HUD script). Every kind of top bar (the contents page, a chapter, the Arena, the progress page, the about page), with the widest HUD a reader can have (a 120-day streak, a full combo with its shield, a boss fight under way), resized through 40 widths from 320 to 1280 (either side of every step of the collapse in `game.css`): the page is never wider than the window, nothing in the bar spills past its edge, and the menu button is on screen, takes a click at its middle and ends at the bar's right end; and at each of those widths the level badge and XP, the streak, the combo, the account chip, Sound and the menu button are in the same place on every kind of bar that shows them, so going from page to page moves none of them (the hearts and the clock come first, `lib/shell.js` `hud()`). The sheet at 1280 opens beside the rail, not modal, and at 360 as a modal sheet that keeps the focus over 38 Tabs and Shift+Tabs; it opens by click and by Enter, and the close button, Escape and a click outside (the scrim at 360) close it and give the focus back to the menu button. Each setting chosen in the sheet is kept over a reload and does what it says: Study mode takes away the hearts and the combo (shown before it), Sound and the volume reach `BMSfx.gain()`, Reduce motion stamps `html[data-motion]`, leaves no animation running after a right answer (one ran before it) and turns the page's smooth scrolling (`scroll-behavior`) to `auto`, Reduce transparency makes the top bar and the modal scrim solid and unblurred, the reading panel, the theme (and Match system), Graphics quality Low gives the course world its low tier (`BMMap3D.info().tier`, once the world is drawn; a warning where the browser has no WebGL 2) with the 3D map switch on and free, the 3D map switch (off keeps the list, with `BMMap3D.why()` `"list"`). Each switch is named by its words alone (`getByRole("switch", { name, exact: true })`) and described by its line (`aria-describedby`). Reduce motion shows on, checked and disabled, when the device asks for less motion and in Study mode, and Reduce transparency when the device asks for less transparency (Chromium's own media emulation, `Emulation.setEmulatedMedia`), and both show off and free when nothing asks. axe-core on the open sheet, each theme and width, is a failure here |
| `transitions` | between pages (the README's "Between pages"), in Chromium, every navigation started by the page as a link's is. Transitions on, at each width: from the contents page to a chapter, the Arena, the progress page, the about page and back (every kind of page), each navigation had a view transition on the page left (`pageswap`) and the page arriving (`pagereveal`), it became ready, the old page faded out (`fade-out`) in 160ms and the new one in (`fade`) in 240ms with the easings of `--ease-in` and `--ease-out` (the computed values, so the tokens reached the pseudo-elements), blended normally; nothing animates the top bar's pseudo-elements or any group, the old top bar is hidden under the new, the top bar is the one named element besides the root, the HUD's group sits exactly on the top bar of the page arriving, which is where it was on the page left, every part of the HUD both pages show (the level badge and XP, the streak, the combo, the account chip, Sound, the menu button) is where it was on the page left, with a reader whose combo is only a shield so a chapter shows it and no other page does, and the transition's own length is bounded on any machine: it is ready before the page has drawn three frames, each of its animations runs at most 250ms from its start to its end (its computed end time, so a delay, an extra iteration or an end delay counts, at its playback rate; the duration alone would let those through), and it finishes in the first or second frame the page draws after the latest of them ends on the document timeline. None of the three is the milliseconds from `pagereveal` to `finished`, on purpose: those also hold the page arriving running its own scripts, which start after its first frame, while the fades play, and keep the main thread, where `finished` is settled. On a CI runner a chapter's transition took 1009ms that way, and held to four threads and one and a half CPUs here the contents page's took 1139ms, its animations over at 317ms; no frame is drawn while those scripts run, so the count of frames after the end is the transition's own, and an animation added after `ready` shows there. The milliseconds are reported, and so is each wait of more than 50ms for the page's own work. While it runs a click at the middle of the menu button lands on `<html>` (captured elements are not hit-tested, which the README's "Between pages" owns up to): that 250ms, the longest of its animations from start to end, is the window in which a click is lost, and once it finishes the click reaches the button. The same from half-way down a chapter. By a link in the open settings sheet: at 1280, where it is not modal, it fades out with the page (`::view-transition-old(hud-sheet)` with the root's animation and duration) from where it hung, within a pixel; at 360 it is modal, has no name of its own and fades in the root's snapshot. Skipped: with Study mode and with Reduce motion stored (skipped at `pageswap`), with reduced motion on the device (the page left never opted in), with Study mode switched on on the page left after it loaded (`pageswap`), and with Study mode stored for the page arriving only (`pagereveal`, the transition handed and skipped). A slow page: the arriving page's stylesheets held back 5 s, past Chrome's four-second timeout: no transition, the page arrives styled, and no error (the boot script quiets the rejection Chromium reports). Back and forward, on a second browser of the suite's own (the full Chromium, `channel: "chromium"`, launched without Playwright's `--disable-back-forward-cache`; the headless shell has no back/forward cache), with every page served with `Cache-Control: max-age=600` (what GitHub Pages sent when it served the course, harsher than Cloudflare's revalidation) in place of the test server's `no-store`: from the contents page by links to a chapter and the Arena, then back, back and forward, each restores the very document that was left (`pageshow.persisted`; the reasons Chromium gives are printed when it does not), and the transition runs with the top bar and every part of the HUD still and the menu button taking clicks after it, or is skipped with Study mode stored and with Study mode switched on on the page being left (`pageswap`). No console error, uncaught exception or same-origin 404 anywhere |
| `diagnostic` | the placement check (`diagnostic.html`, `src/ui/diagnostic.ts`) as it is taken. A run is pre-written to `bm.run.v1.diag` and the page loaded again, answers come from `BMGen.make(g, s).answer`, and where answers must not count as rushed Playwright's clock is installed and moved on by each question's par before Submit. Walks: "Algebra 2 or higher" all right (band `algebra-2` with `all`, 8 items, seeded, run cleared, no typed text, timing, `r` or `u` in the take, no `attempt` event), "Algebra 1" all right (band `geometry`, no `all`: the hold), rushed (`rushed`, not seeded, `bm.game.v1.sec` untouched), "Not sure" and all skips (Pre-algebra after 4). Also: Start with no choice, empty and unreadable submits, a second tab's `combo` write ignored and its `diag` write adopted, the run cleared in another tab, reload and Start over, storage that will not save, no `bundle/supabase.js` request signed out, 360 px overflow, axe in the intro, resume, question, done and return states. Threat-model cases: two tabs finishing one run (one take), a failing take write (run kept, `bm.game.v1` untouched, one take after a reload that can write), no generators, markup and `${…}` typed, `?again=<script>`, `?again` with a run in progress and with takes (query gone once the run starts, 2 takes), the return stub, a take written in another tab mid-run, and the signed-in wait against a stand-in for supabase-js (a session that never resolves gives the notice after 8 s; an account that holds a take gives the return stub) |
| `frame` | the game frame and the reading panel on the contents page, a chapter, the Arena and the progress page, each theme × the panel as it comes and as a reader can choose it (`bm.prefs.v1` `panel: "dark"`): `html[data-panel]` set at the first animation frame (the boot script), the frame dark in both themes and lighter in the light theme than the dark, the panel light paper unless the dark one was chosen and its `color-scheme` with it, axe-core's colour-contrast rule clean (a failure here, unlike the `axe` suite), `BMGame.setPref("panel", …)` switching the panel and keeping it over a reload, the skip link (the first Tab stop, a paper tile over the dark top bar) ringed at 3:1 against the bar in both themes, the top bar solid and unblurred in forced-colours mode, and printed with the dark panel: no frame background, no motif, no panel edge, the print ink, and print's light paper tokens (`--on-accent`, `--xp-ink`, `--focus` …) |
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
or both; `--skip` takes suite names to leave out. `--part=<part>` runs one part of `PARTS` in
`check-browser.js`, the split CI runs side by side (below): `--part=rest` is every suite no part
names, and `--only` and `--skip` narrow a part like the whole. `--list` prints each suite with its
part; `--parts` checks `PARTS` against the files in `suites/` (a name that is no suite, or a suite
in two parts, exits 2) and prints, as JSON, the part names, which are the browser job's matrix, and
`CORE`, the part whose job also runs `npm run test:browser:core` (`{"parts":[...],"core":"rest"}`;
a `CORE` that is no part exits 2). The theme is forced the way the site reads it —
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
In CI a new suite runs in the part `rest` with no change anywhere else; give it a part in
`PARTS` when it makes that job the slowest.

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
`--disable-gpu`, so headless Chromium never draws on the machine's GPU and the result does not
depend on the graphics driver. If a future Chromium stops handing out a context without a flag, the
`webgl` suite fails with every set it tried listed, and `ARG_SETS` in `suites/webgl.js` is the
one place to add the new set.

It does not draw there, but it did open it: Chromium's GPU process asks the system's Vulkan
loader for every driver, and with the flags above (or `--disable-gpu`) it still held
`/dev/nvidiactl` and the card's render node. `lib/gl.js` is how every Chromium of the harness
is launched now (the `tools/game` scripts, `check-browser.js`, the `webgl` probe and the
`transitions` suite's second browser): `env()` points the loader at Chromium's own SwiftShader
driver (`VK_DRIVER_FILES`, and `VK_ICD_FILENAMES` for older loaders, set to the
`vk_swiftshader_icd.json` shipped beside the browser), so the machine's graphics driver is never
loaded, no device file is opened, and the devices Chromium sees are a runner's. `launch()`, which
`game/map.test.js` and the painter check of `game/scenes.test.js` use, adds the three flags and
then reads the renderer of a blank page: anything but SwiftShader stops the script with that
renderer named, and the `webgl` suite's `launch config` fails the same way, so a run on a
machine with a GPU measures what CI measures or says why not.

What depends on speed is held to a clock in the checks. A runner has four vCPUs, and
SwiftShader on so little draws the course world's medium tier slowly (here, with the browser
held to four threads and one and a half CPUs as below, 67 ms a frame at the median and 100 ms
at the 90th percentile), which the world's watchdog rightly calls slow: on CI it stepped a
chosen Medium down to Low in the middle of the checks of Medium's idle motion, and the world was
gone during the budget checks, where `info()` returned null and the script stopped on it. So `game/map.test.js` gives the page's animation frames the timestamps of its own
clock (`RAF_GATE`): by default no frame seems longer than `SLOW_MS` less 4 ms, whatever the
machine draws. The one exception is the pause a check makes: the checks that a pause is not a
slow frame (a 2.5 s long task, frames held 3 s in a hidden tab) set `__passNext` to
`PAUSE_GAP` (2 s) as they make it, the next gap at least that long goes through as it really
was, and the check fails if none did, so the watchdog sees the pause. That is the check's own
number, not a threshold read from `src/world/tiers.ts`, so a `PAUSE_MS` raised past 2.5 s fails
the long-task check on its own. (Not simply the next frame: the first frame after a long task
can carry a timestamp from before it ended; here a 17 ms gap came first, then the 2483 ms one.)
The checks of the watchdog
set every frame to exactly 60 or 200 ms. A check about a tier chooses it (`gfx` in
`bm.prefs.v1`) or names the renderer the page reads (`RENDERER`: llvmpipe for a software
renderer, a Direct3D GPU for a hardware one) beside the real SwiftShader, and the frame times it
prints are the machine's real ones.

To see a run as a runner would, hold Chromium to four threads and less CPU than this machine
has. On a Ryzen 5 5600X (12 threads) under systemd this is close to a runner, a little slower:

```sh
systemd-run --user --scope -q -p CPUQuota=150% -- taskset -c 0,1,6,7 npm run test:browser:3d
systemd-run --user --scope -q -p CPUQuota=150% -- taskset -c 0,1,6,7 npm run check:browser -- --only=transitions
```

(`0,1,6,7` is two cores and their second threads, as a runner's four vCPUs are; `lscpu -e`
gives the pairs.) Without the clock, the map script failed here as it did on CI.
Software WebGL is slow and can lose its context under load, which is why CI runs the 3D checks
(`npm run test:browser:3d`: `game/map.test.js`, and `game/scenes.test.js`, whose painter check
runs under the same flags while the rest of it draws on the SVG painter) and the `webgl` suite
in a job of their own, retried, outside the gate a deploy waits for; `npm run test:browser:core`
and `check-browser.js --skip=webgl` are the gate. The gate runs as one `browser` job per part of
`PARTS` (`--parts` gives the build job the list), side by side, each `check-browser.js
--skip=webgl --part=<part>`, and the job of the part `CORE` (today `rest`) runs `npm run
test:browser:core` first. ci.yml takes that part from `--parts` too, never naming one itself, and
`check-ci.js` (`core`) fails if the step or its condition is changed, so renaming a part
cannot leave the `tools/game` scripts in no job. Every suite runs once, under the flags the
single job used, in about 6 minutes where it took 16 to 21. The
parts are balanced by the suites' times on a runner (the numbers are beside `PARTS`), and each
job uploads its own report, `check-browser-report-<part>`. The gate is not retried, and nothing in it
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
| `pages` | every page of the source tree (the `htmlPages` rule in `lib/site.js`, which `vite.config.ts` repeats) is in `dist/` at the same path, and `dist/.nojekyll` is there. Nothing else is in `dist/` but what the site is made of: a page, a file of `public/`, a file a built page links (its module script, what it preloads, its stylesheets, the icon), a chunk reached by following the imports from a page's module script (the WebGL painter and supabase-js are dynamic imports), a file a built stylesheet names (the fonts), `bundle/LICENSES.txt` (see `licences`), `_headers` and `404.html` (see `headers`), and a source map beside one of those. The copies of the source scripts at their own paths that one release kept for cached pages are over, and `scripts` fails a build that has them. Everything in `dist/` is published, so a stray `.env` or `tools/` fails here |
| `links` | every relative `href`/`src` in the built pages resolves to a file inside `dist/`, and its `#anchor` to an id: the same walk `check-static.js` does on the source (`lib/links.js`) |
| `root-absolute` | no attribute value is a root-absolute path (`/assets/…`): the site is published at the root of `learn.groundupmath.org`, but relative addresses also work under a sub-path (the test server's `/__base/`, a copy in a folder), where `/` is not its root. Any value starting with a single `/` on a URL attribute fails; on any other attribute, one that names something in the top level of `dist/`. The same for CSS: no `url(/…)` or `@import "/…"` in a built stylesheet, a `<style>` or a `style` attribute |
| `main` | for every page, the text from `<main` to `</main>` is the source's, by whitespace-normalised fingerprint: the build may rewrite a `<head>`, never the content (`lesson.js` and the exercise keys depend on it) |
| `shell` | for every page, everything around `<main>` is the source's too: the head (viewport, title, the inline boot script), the attributes of `<body>`, the top bar, the footer. The links to the site's own stylesheets and icon and the page's module script, which the build does rewrite (the script comes back as a built chunk, with `<link rel="modulepreload">` for what it imports), are taken out of both sides first; `links`, `stylesheets` and `scripts` answer for them. Since the head and top bar come from the shell, this is also what fails a build that did not write them, or wrote them differently from the checks: a marker left in the page, `data-page` left on `<body>` |
| `scripts` | what a built page runs. Its script tags, in order: the boot script inline with the text of `src/boot.js`, one `<script type="module">` (`type=module crossorigin`, as Vite writes it) whose `src` is the page's own entry chunk, `bundle/pages/<page>.js`, and the HUD script inline with the text `lib/shell.js` `hudScript()` makes; nothing else. The TypeScript modules under `src/` (not their tests or declarations, such as `src/learn/ladder.ts`) and the HUD's plain modules under `src/hud/` count as files an entry may import, like `assets/` and `data/`: an entry names each module it bundles, not only the first of a chain. The one exception is the typed grader's modules under `src/core/answer/`, which `src/ui/core.ts` imports and no entry names: each goes with `src/core/grade.ts`, loaded by the kinds that load it (so named into `bundle/all.js`, as `vite.config.ts` `bundleNames` names it) and allowed in the bundle of any entry that imports `grade.ts`, as many of them as the imports reach, so a module of the grader brought into use needs no entry's edit; and `grade.ts` itself is a facade of re-exports that rolldown maps no code to, so it counts as built wherever one of them is. The bundle behind that tag: the chunks reached by following the imports from it were built (their source maps say) from exactly the files `src/entries/<kind>.js` imports, every one and no other (but for those grader modules), and every `node_modules/` file among them is brought in by a vendor module the entry imports (`lib/vendor.js`: KaTeX's by `src/vendor/katex.js`). Where the importer of an on-demand module is among them, the dynamic import reaches that module's chunk: `bundle/scenes3d-gl.js` for `assets/scenes3d.js`, `bundle/three.js` for `assets/three-loader.js`, `bundle/supabase.js` for `assets/account.js`, `bundle/world.js` for `assets/map3d.js`. The names: every other chunk reached is `bundle/<kinds>.js` (`all`, or the kinds joined with `-` in `PAGE_KINDS` order), and every file in it is loaded by exactly those kinds, by the entries' imports, the vendor stylesheets and `PAGE_KINDS`'s; so no name carries a hash, and a name changes only when what loads a file changes (`OPERATIONS.md`, "What a deploy does to a page a browser already holds"). Each on-demand chunk, once: built from its module and, for `supabase.js` and `three.js`, the files of its package and that package's dependencies, for `world.js` the modules of `src/world/` that no entry imports (`src/world/tiers.ts`, which the contents page's entry imports, is in `bundle/home.js`), nothing else, and named by no page's HTML (a signed-out reader on an ordinary page must never download the account library, and a page with no 3D never Three.js; only the `import()` fetches it). The order the files run in is not in the minified chunks (rolldown wraps each module and calls the wrappers in the entry's order under `strictExecutionOrder`, `vite.config.ts`); the browser suites prove it by what the pages build. No page names a source script by its own path, and nothing is at `assets/<script>.js`, `data/…` or `assets/boot.js`: the copies the release of the module entries kept for cached pages are over (`OPERATIONS.md`, "Scripts") |
| `offline` | nothing a page needs comes from another server: no `<script src>` and no `<link href>` (stylesheet, module preload, icon) with an `http(s):` or `//` URL, no `preconnect` or `dns-prefetch` at all, and no `url()` or `@import` in a built stylesheet that names another server. No font is a `data:` URL either (`vite.config.ts` `assetsInlineLimit: 0`; the site's own `data:` SVG marks in `site.css` are not fonts). `<a href>` links in the content are the author's and are not touched. What a script fetches is not a tag on the page (Three.js is the bundle's own `bundle/three.js`); the browser checks hold the requests (`lib/browser.js`) |
| `secrets` | no file in `dist/` contains a key: `sb_secret_` followed by a key's body, `whsec_…`, `sk-ant-…`, a Stripe-style `sk_live_…`/`rk_test_…`, or `service_role` (in any case, so `SUPABASE_SERVICE_ROLE_KEY` too) with something key-like assigned to it. The shape of a key, not its prefix alone, because supabase-js, now in the bundle, names the prefixes of its own keys and says `service_role` in its doc comments, which its source map carries; `checks.test.js` holds the patterns to a real key of each kind and to that text. A legacy Supabase key is a JWT, whose role is base64-encoded and matches no pattern, so every JWT-shaped token is decoded as well and fails unless its role is `anon`. (The Supabase anon key in `assets/config.js` is public by design and passes) |
| `stylesheets` | reports how many distinct stylesheets the built pages link, and fails if two chapter pages link different ones. Also the cascade: Vite splits the CSS into shared files and, left alone, links a page's own file before the shared ones, the reverse of the source (`vite.config.ts` puts them back). So for every page, the class names only one source stylesheet uses must all come, in the built CSS the page links, before those of the next source stylesheet. And the text: each of the site's stylesheets a source page links must be, byte for byte, inside one of the stylesheets the built page links. `vite.config.ts` sets `build.cssMinify: false` for that: Vite's minifier (Lightning CSS) rewrites values the scripts read (`--plot-fill: rgba(38, 70, 212, .14)` becomes `#2646d424`, which `parseColor` in `assets/scenes3d.js` returns `null` for) and merges selectors into `:is()`, changing their weight. The vendor stylesheets (`src/vendor/fonts.css`, `src/vendor/katex.css`; `VENDOR_STYLES`) are `@import` rules of package stylesheets that the build inlines, and rules of their own that name package files (`fonts.css`: the `@font-face` rules `gen-fonts.js` writes, whose `url()`s the build points at the copies beside the bundle), so for them: each imported stylesheet's text, then the file's own, with every `url()` reduced to the file's name on both sides, must be in the built stylesheet, in that order, and all of it before the site's own stylesheets, so that `site.css`'s rules on `.katex` come after KaTeX's and win as they did when KaTeX's stylesheet was a CDN link. The names, as for the chunks: a built stylesheet is `bundle/<kinds>.css`, and every source stylesheet in it (a vendor one by its imports' text) is linked by exactly those kinds (`VENDOR_STYLES`, `PAGE_KINDS`). Last, the link: a built link to one of the site's stylesheets carries `rel` and `href` and nothing else, as the source's do. Vite adds `crossorigin`, and `vite.config.ts` takes it off again |
| `headers` | the two files only Cloudflare Pages reads (`lib/headers.js` says what each rule is for). `dist/_headers` is, byte for byte, what `render()` writes from `dist/` as it is (so it was written last, from these pages and these font files), within Pages' limits (100 rules, 2,000 characters a line). Its Content-Security-Policy lets every page run and no more: the text of every inline script of every page (the boot script, the HUD script) is in `script-src` by its SHA-256, and `script-src` allows nothing else inline, no eval, no `data:`, `blob:` or scheme-wide source; `connect-src` is the site and the Supabase project of `assets/config.js` (`https:` and `wss:`), nothing else; `default-src`, `object-src`, `frame-src`, `frame-ancestors`, `base-uri` and `form-action` are what they should be; Permissions-Policy, Referrer-Policy and X-Content-Type-Options are there, and Cross-Origin-Opener-Policy is `same-origin` (so no page of another origin keeps a handle on a window that arrives here, `lib/headers.js` says why). Every file of `dist/`, at every path Pages serves it on (a page also without `.html`, `index.html` as its directory), meets exactly one `Cache-Control` rule (two would be joined into one header), and the right one: the font files (KaTeX's and the typefaces) a week and never immutable, since their names are their packages' and not hashes of their content, every page, chunk, stylesheet and map revalidated. `dist/404.html` has no script, no stylesheet and one link, to `/`. (`styles` keep `'unsafe-inline'`: KaTeX writes its layout into `style` attributes, and the site's scripts do too; with it taken out a chapter logs 393 violations and the contents page 20, measured on Chromium 153) |
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
- Cloudflare Pages itself: `lib/serve.js` applies `_headers` and serves a page without `.html`,
  but does not send Pages' own redirect from `/about.html` to `/about`, and nothing here checks
  how Pages joins, orders or overrides headers beyond what its documentation says. The runbook
  (`OPERATIONS.md` section 8) checks the real thing with `curl` and a browser.
- GitHub Pages itself, for the redirect site: `check-redirects.js` runs each page's script in a
  vm, not in a browser, and does not serve the files the way GitHub Pages does (a page's path
  without `.html`, `404.html` for anything else). `OPERATIONS.md` 8.6 checks the live old
  address.

## build-redirects.js and check-redirects.js

Usage: `node tools/build-redirects.js [--out=dist-redirects]`, then
`node tools/check-redirects.js [--dir=dist-redirects]`
(`npm run build:redirects`, `npm run check:redirects`)

The redirect site: what GitHub Pages serves at the old address,
`https://sophanasok.github.io/basic-mathematics/`, now that the course is served only from
Cloudflare Pages at `https://learn.groundupmath.org` (`ORIGIN` in `build-redirects.js`;
`OPERATIONS.md` section 8). The `deploy` job publishes it on every push to `main`. One page at
the path of every page of the site and a `404.html`, each standalone, with none of the course's
code: its one inline script is `location.replace()` to the same page at `ORIGIN`, with the old
address's query and fragment (`404.html`: to the front page, without them). The address of a
page there is its path without `.html` (`/` for `index.html`), where Cloudflare Pages serves it.
A refresh to it inside `<noscript>` and a visible link are there for a browser without scripts,
a canonical link names it, and `<meta name="robots" content="noindex">` keeps the old address out
of search results. Each page carries a Content-Security-Policy in a `<meta>` that lets nothing
load but its own script, by hash, and the empty `data:` icon (without it a browser asks for
`/favicon.ico`, which the policy would refuse). Nothing of a reader's moves with them: what a
browser saved at the old address stays there.

| check | what it guards |
| --- | --- |
| `files` | a redirect at every page path of the site (`lib/site.js` `htmlPages`), `404.html`, `.nojekyll`, and nothing else: nothing of the course's build |
| `same` | every file is what `build-redirects.js` writes now |
| `pages` | each page: a canonical link, a refresh inside `<noscript>` and a visible link, all to that page's address at `ORIGIN`; robots `noindex`; one script, inline, with no attributes; a policy that comes before the script and is exactly its hash and the `data:` icon; no stylesheet, `<style>`, image, frame, form, `src` or `style` attribute, no path of the bundle; every address on `ORIGIN` |
| `run` | each page's script run in a vm, as a browser would, from the old address with and without `.html`, with no query, a query, a fragment and both: it navigates once, to the same page at `ORIGIN` with that query and fragment; `404.html` sends a folder, a mistyped path and a retired page to the front page |

## check-ci.js

Usage: `node tools/check-ci.js` (`npm run check:ci`, part of `npm run check`)

The guards of the deploys in `.github/workflows/ci.yml`, which nothing else tests (a workflow
runs only on GitHub), held by reading the file:

| check | what it guards |
| --- | --- |
| `project` | the `cloudflare` job's default project (`vars.CLOUDFLARE_PROJECT_NAME \|\| '<name>'`, the one place the name is written for CI) is a Cloudflare Pages project name |
| `rerun` | the `cloudflare` job stops a re-run of an older commit of `main` before wrangler deploys (as `deploy` does for GitHub Pages) |
| `pr` | a pull request deploys under `pr-<number>`, and nothing in the job reads the head branch, so a pull request whose head is `main` cannot reach production |
| `prod` | a deploy of `main` that Cloudflare did not make production fails, after wrangler ran |
| `core` | the `browser` job runs `npm run test:browser:core` in the job of the part `--parts` names as core |
| `pages` | the build job builds, checks and keeps `dist-redirects/`, and the `deploy` job downloads that artifact alone and reads no repository variable: the course is never published to GitHub Pages. Taking the old address down removes this check with the jobs ([`OPERATIONS.md`](../OPERATIONS.md), 8.6) |
| `skip` | `pull_request` and `push` (to `main`) each carry `paths-ignore: ["**/*.md", "docs/**"]` and nothing else, so a change to only prose starts no run and the list cannot grow to cover code; and the build reads none of what it covers: no Markdown in `public/` (copied into `dist/` as it is), `src/`, `assets/`, `data/` or `parts/`, and nothing but Markdown in `docs/` ([`OPERATIONS.md`](../OPERATIONS.md), "When CI runs") |

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
| `smoke-scenes.js` | every 3D scene under a small DOM shim: mounts in figure and quiz mode, missions false at mount, every control driven, every `cases` answer reachable and graded right. The shim's `getComputedStyle` answers with the light tokens of `src/styles/tokens.css` (first Part), so the shaded draw paths run; a token file that yields no `--plot-curve` stops the run rather than skip them |
| `checks.test.js` | the checks themselves, on small pages written in the test: `progress-keys` (a changed, dropped or reused key fails, scored or inline; ids written onto positional keys pass), `ids` (an `id` such as `constructor` is only a name), `lesson-steps` (an added step and a cut that moves at the same count both show), `assign-ids.js` (nothing is written, or said to be, when one page cannot be converted), `lib/shell.js` (each kind of page gets the vendor stylesheets then its own, `src/styles/tokens.css` first of those, the boot script inline before them, its one module entry last and no classic script, nothing in its head from another server, its top bar and path prefix; the HUD in the top bar with the game slots of its kind and a sentence for each slot's label, the settings sheet's inputs in order with Study mode first and its line, the HUD script straight after the top bar and what it is made of, and a HUD module the shell cannot inline (an export or import it cannot take off, a closing script tag, text that does not parse) refused; the chapter entry imports every scene file, after the framework and before `site.js`; every entry imports `src/vendor/katex.js` first, and `src/core/` then `src/ui/core.ts` before `site.js`, each an import at the start of its line (an entry with `src/ui/core.ts` only commented out with `//` fails); the content is not touched; each way of writing a page wrong, `data-scenes` included, is refused with its reason; nodes carry source-file lines), `lib/vendor.js` (the vendor modules and their packages, `fonts.css`'s by the files its `url()`s name, a dependency placed with the module that brings its package in, a script and a stylesheet of the same package placed apart, an unknown package refused; `vendor.d.ts` declares what it exports; `package.json` pins `katex` at exactly 0.16.11 and holds `three` to a minor with `@types/three` of the same one; `src/vendor/three.js` exports, by name and each once, exactly the Three.js names `assets/map3d.js`, `src/world/*.ts` and `assets/scenes3d-gl.js` use, and nothing reads `window.THREE`; `packages()` is every package of every vendor module with its licence file, and `licenseNotice()` has a section per package with that file's text, the Open Font License's text among them and the KaTeX fonts' own notice), `gen-fonts.js` (`FACES` is the Google Fonts link's faces and no other; `src/vendor/fonts.css` is what it writes; every `@font-face` names one weight, never a range, one of the three families the tokens name, `font-display: swap`, a `unicode-range`, and a file of an installed fontsource package: the variable file for an upright face, the static instance for the italic), the `shell` check (an attribute added to a link, two stylesheets swapped, a CDN script put back, an edited boot script, an edited HUD script, a changed body attribute or top-bar link each show; a second module, a classic script of the site's own or from a CDN, another kind's entry, a boot script that is not `src/boot.js` or a HUD script that is not `hudScript()` fail whatever the record says; `tools/shell.json` records every page and names no other server), the `answer-spec` check (the bar lint failing `2\|x\|-1`, `2\|x\|`, `x\|-x`, `2\|x-1\|+3` and passing `\|x\|` and `1\|i`; a tol of -1, an infinite, unreadable or empty tol, and a tol on an exact or an expr key failing; `1/8\|0.125`, a blank card and a tol on a number, fraction or set key passing; an alternative its own key judges unread failing; `judge()` on the core object), the `placeholders` check (an example its key judges right, or form as a rounding or a point in square brackets, fails; one judged wrong or unread passes), the `skills` check (each rule on a small tree that breaks only it: a section with no record, a container with one, a key that is no section, `CONTAINERS` against the practice sections or listing one twice, a scored exercise with no `data-section` or one naming a container, bare (`exerciseRefs` makes `review` on the ch07 page `ch07#review`) or as a ref, a malformed, unknown or wrongly lettered code in `ccss` and in `also`, `also` repeating, each course rule and its pass when the code is approximate, an override resolved to an unknown code or a (+) code outside `beyond`, a generator whose section is a container or unknown, an override for no generator or that changes nothing, a repeated tag, `act.mod` first or alone; `sectionAnchors` giving a practice section whose `<h2>` carries no id the practice anchor, and an `<h2>` that carries the id, or a section that is not a practice one, the h2 anchor; and the real tree passing with its 76 sections), the `us-english` check (a British spelling in prose, a reader attribute (`data-tip` among them), a `<title>`, a `<textarea>`, an inline `<script>`, a script's string or the body of `\text{}`, `\textrm{}`, `\mathrm{}` or `\operatorname{}` in a formula fails, by line and with the US word; one in a comment, an identifier, a URL, `<code>`, `data-answer`, `class`, `id`, markup inside a string, a key-like string, a DOM call's name argument or the rest of a formula passes, and `"Cancelled."` and `toast("colour")` fail; `tools/lib/shell.js` read and no other tool; a script that does not parse a problem; the spelling map's metric prefixes, `-isational`, `-isably`, triangle centres, `centre` compounds, `dreamt`, `spoilt` and `enquiry`; the formula followed across a `+` chain, `"… $" + x + "$: centre $" + y + "$"` failing on centre, and into a conditional's branches; test files, test helpers, declarations and vendor files not read; `£` (in a formula too, and `&pound;`), `pounds`, `pence`, `10p`, a one-word `"5p"` and `n + "p each"` failing and `$\$9$` and `$2p$` passing; wording (brackets, towards, tick, for ever, and the sweep's non-zero, right-angled, disc, Pythagoras, reflection in, mid-line and right first time) passing the check and only the prose of it reported, a one-word `"disc"`, `"ch07#disc"`, `"disc-area"` and a lowercase `"pythagoras"` name not; a count that rises, one that falls, a form no longer found, an empty entry and a count that is not a whole number each failing; `--write` keeping capitals and leaving keys, formulas, money and escaped words alone; the real tree passing against the allow file), the `pure-core` check (a page global named in code is found by its line, and one in a string told apart; never one in a comment; a `//`, `/*` or quote inside a string or a regex hides nothing; one in a template's text, in JSX text or spelled with an escape is found, the escaped one marked as in a string; a module that does not parse is refused; every script extension is read but tests, test helpers and declaration files), the `secrets` check of `check-dist.js` (a real key of each kind fails, supabase-js's own text passes) and `apply-shell.js` (whole pages are found again as the kind they were written from; a page no kind expands to, or one whose content differs from the base by a byte, fails and nothing is written) and `lib/serve.js` (a build goes out as it is, a page in it that still carries a marker is refused, a fixture goes out as it is), and the stylesheet checks (`lib/css.js` `tokens()` builds one table per theme × panel, the theme leaving the panel alone and the panel the frame, a Part keeping its own value unless a block for that theme or panel overrides it, print blocks and a component's own properties left out, `@supports` blocks in, a name set by both a theme and a panel block reported; `color-mix` with `transparent` makes a colour see-through, laid over another it is measured as seen; `parseAnimation` reads names, durations, delays, counts and longhands; the flash-and-loop rule passes a pop, three slow repeats and a token duration and fails forever, five a second, four slow repeats and an unreadable duration; colour literals are found by line, never in an id selector, a `data:` URI, a comment or a `color-mix` of tokens; what puts a selector in the reading column, and what counts there as an animation, a moving transition or decoration) |
| `check-gen.js` | every Arena generator over 500 seeds: deterministic, no `NaN`/`undefined`, the key and every declared alternative graded right, near misses graded wrong, hints that do not give the answer, no prose inside a formula, no formula that starts or ends with a space and no unpaired `$` in the question, hint or steps (a bare `$9` where `$\$9$` was meant, even two in one short sentence), every chapter covered |
| `gen-grade-golden.js` | not a check but a writer, with one: writes `tools/fixtures/grade-golden.json`, what the grader says about every answer key on the pages (a blank with no `data-type` as a number, as `site.js` sets it on the live page), the detector fixtures of `src/learn/detectors.test.ts`, the learner cases (`LEARNER_CASES`: the example rows of the typed-grader design's tables, one entry per key, type and tolerance, given their rows like a detector fixture), 2,000 seeded Arena problems and the first key of each type again with no type, each against its whole key and, per alternative, the alternative, its sign flipped, its reciprocal, its first number ×10 and ÷10, its unicode spellings (the em dash and `⋅` among them) and its whitespace variants, then the near misses each rule decides: a toleranced key moved by ± 0.5, 1, 1.05 and 1.2 of its tolerance and by ± (tolerance + 1e-10) and ± (tolerance + 1e-11), past the 1e-12 slack; any other number, fraction or set key scaled by 1 ± 1e-10 and 1 ± 1e-7 and, where a number is under 1 in size (0 among them), moved by ± 5e-10, ± 8e-10 and ± 1e-7 against the band's absolute floor; a set joined by `;`, in braces, reversed, and with a separator at its end, at its start and doubled; an expr with its products written `*` and `⋅`, its unbracketed sum's terms reversed and the whole in one more pair of brackets. Not every rule has a case: no given holds TeX (`\frac`, `\sqrt`, `\cdot`, `\left`), a `$` or a number written `.5`, so those are held only by the hand cases in `src/core/grade.test.ts`, or by nothing. It was first run on the grader in `assets/site.js` before the grader moved to `src/core/grade.ts`, and extended on the moved grader unchanged with every first case kept. It grades with `src/core/answer/legacy.ts`, a byte copy of `src/core/grade.ts` as it stood before the typed grader, never with the live grader, so it keeps describing that baseline after `grade.ts` changes. The file is frozen: it is the baseline the typed grader's ledger is measured from (`gen-grade-ledger.js`, next row), and it is not written again until the ledger is folded into it. A verdict the grader changes on purpose goes in the ledger, not here, and a content change that adds or edits a key is no reason to write it again: the ledger replays the file's own keys, and lists an exercise whose type or tol moved. `--check` writes nothing and exits 1 if the file is missing or differs from a fresh run; it reads the live pages, so after such a content change it reports a difference, and it is the check of a change that writes the file, not a CI gate |
| `gen-grade-ledger.js` | not a check but a writer, with one, run by `src/core/grade.test.ts` (so by `npm run check`): writes `tools/fixtures/grade-ledger.json`, every case of the frozen `grade-golden.json` whose verdict the typed grader (`src/core/answer/check.ts` `judge()`) changes, each put down to a rule. It fails if `legacy.ts` does not say what the golden file says. A change is a flip of the boolean (`flips`) or a wrong answer now `form` or `unread` (`verdicts`); an empty box is none. A `form` or `unread` verdict is put down to the rule its reason names; any other change to the first rule, in a fixed order (A-abs, N-exact, the other N-, L- and T- rules, the E- rules in pipeline order), whose switch alone (`judgeOff`) gives the old boolean back, else to the first such pair (`A+B`), else it fails. A new right answer must also pass the value gate, a second reading written in the tool that shares no code with `src/core/answer/` (numbers, fractions, sets and points exactly in BigInt within the tol or the band, a mixed number read as its value, never a space between digits; expressions as text or by value at three seeded points), or be listed by hand in `reviewed`, which the tool carries through as it is and which fails when an entry matches no change. `specs` lists every course exercise whose type or tol is not its golden group's. A missing file is the empty ledger at `check.ts` `GRADER`, and none is written while it is empty: until the grader changes a verdict there is no file. `--check` exits 1 on any of those failures or a file that differs from a fresh run; `--rules A,B` (with `--base`, default `origin/main`) fails on an entry new against the ledger at that commit whose rule is not listed, the review aid of a change that adds entries; `--summary` prints rule × direction × count with five samples. The baseline's notes: the golden file's 41 blank groups were recorded again as `number` when it was frozen, as `site.js` grades a blank with no `data-type` (356 cases before, 520 after, 43 verdicts changed); that is the baseline, not a ledger entry |
| `gen-fonts.js` | not a check but a writer, with one: `npm run gen:fonts` writes `src/vendor/fonts.css` from the fontsource packages' own stylesheets, one `@font-face` per family, style, requested weight and subset, as Google Fonts declared them for the link the pages used to carry (`FACES` in the script is that link); `--check` (which `checks.test.js` runs) fails when the file is not what it would write, so a fontsource update that changes a subset or a file is noticed and the file regenerated, never edited by hand. The variable packages are not imported as they are because their stylesheets name the family `Inter Variable` and declare `font-weight: 100 900`, under which the site's `font-weight: 650` would render as a true 650 where Google's single-weight faces gave it the 700 face |
| `game/merge.test.js` | `BMAccount.merge` (`assets/account.js` with the `BMMerge` of `src/ui/core.ts` it delegates to) with the game store: commutative, associative, idempotent, over states that also carry fields this version has never heard of; every such field comes out of the merge, by the one rule for them (the later canonical JSON), and `game.v` is the larger number; the help ladder's `rung` keeps its own rule (the larger number) in every merged attempt record. Spot checks pin the limits of that rule: keys named like inherited properties are carried and `__proto__` is not, and an object under an unknown key of a keyed store is merged as a record of that kind. Last, the writers in `assets/site.js` (`BMProgress`, `BMPlay`, `BMAttempts`) write a fresh record over an entry that is not one, which a merge now passes through |
| `game/sync.test.js` | account sync in `assets/account.js` against an in-memory stand-in for Supabase, one vm per device, each handed the `BMMerge` of `src/ui/core.ts` (a scenario that needs a merge that fails hands it one that does): stale tabs and simultaneous saves never overwrite newer progress, resets are neither undone nor allowed to wipe later work, a sync never lands in the wrong reader's account, and signing out sets unsaved progress aside instead of wiping it. Other versions of the site and of the tables: fields a later version saved survive a sync from a device with changes of its own, at every level and in a column this version does not know; a row or a browser in a newer shape (`game.v`) is merged and never written, with the page asking for a reload; a server without the `game` column syncs the rest; a project without the `attempts` table syncs, keeps the log queued without sending it again with every save, and holds no more than the newest 500 checks; a reset leaves a column this version does not know. Two of these run on `account.html`, where the account-page half of the file shares its scope with the sync: a sign-in and sign-out there keep the account whole, and the page says to reload for a newer shape. A sync whose merge fails is never followed by a save of the unmerged copy. Also sign-in through another service: only configured services are offered, Microsoft is asked for the email address, and a reader with no email address still syncs. |
| `game/account.test.js` | the account page in Chromium with `BM_CONFIG` pinned and a stand-in for supabase-js put on `window.supabase` before the page's scripts run (the seam `account.js` keeps: a client library already there is used instead of the bundled one): provider buttons in config order with text labels, the hand-over call, a refused sign-in explained and removed from the address, the signed-in panel with and without an email address, no overflow at 360px. Then without the stand-in: a signed-out visitor on a chapter page and on the about page asks no other server for anything and never for `bundle/supabase.js` (the list of what the page did ask for is printed), and the account page fetches that chunk once, from the site itself, and draws the form with the real library while every request off the local server is aborted |
| `game/rules.test.js` | combo, levels (`src/hud/levels.js`, loaded as the HUD script's text, `lib/shell.js` `hudLibrary()`), hearts, medals, achievements, recall and run records, as pure functions (with `window.BMReview` from `src/ui/review.ts`, which Node loads itself, types stripped, as every page puts it up before `game.js`); `recordRun`'s XP across a simulated day: the day's first run in full however many answers share a section, then less per section the more answers earlier runs paid (1, 1, ½, ½, then ¼, rounded once per run), retries counted like first tries and unpaid ones not at all, the finishing bonus in full for two finished runs then 1, a banked run no finish, the Daily's 10 untouched, the counts on this device only, fresh on a new day (the clock moved on), a later day's counts kept when an older run settles, a later day's counts dropped when the clock is set back to before it (and that day's decay still applied), damaged counts read as none; the deck's rows carrying the day each section was last solved on its page (`seen`); play settings and game records keep keys this version does not know through every write, and switching a setting never announces a synced change; the settings sheet's volume (0 to 100), Reduce motion and Reduce transparency (stamped on `<html>`, and taken off again) and graphics quality (Low is the course world's low tier, still 3D; the 3D map switch keeps the list; `gfxAuto`, the tier the world's watchdog settled on, is read back only as `"list"`, `"low"` or `"medium"`, shows the map switch off at `"list"`, and goes at the next choice of quality or of the map), a value the site does not know read as unset, and a setting that holds for the visit when storage cannot be written; the boot script (`src/boot.js`, run in a vm) stamps `data-calm`, `data-sound`, `data-motion`, `data-transparency` and `data-panel` on `<html>` exactly as `game.js` does for 17 stored settings, damaged ones (`calm: "yes"`, `calm: 1`, `sound: 1`) among them, so the HUD script, which reads `html[data-calm]`, draws what the game will; and its `pageswap` and `pagereveal` listeners skip the view transition between pages for exactly those of the 17 where the game holds still (Study mode, Reduce motion), and for a device that asks for less motion and Study mode switched on after load, while its `unhandledrejection` listener quiets only a transition the browser gave up on. And the one invariant of the reward rules: every road an exercise can take to its first right answer (clues 1 to 3, up to two wrong checks, the solution, in any order) is run through the real rules (`assets/site.js` `xpFor`, `paysFirst` and `road`, loaded under a stub window; `assets/game.js` `bonus`, the attempt event of every check, `setStats`), then followed by five answers right first time from every meter (0 to 5 pips, with and without a shield), because the pips a road keeps pay on the answers after it; XP, combo, hearts and medal are held together. No help costs a heart; a clue costs no pip and leaves the medal as it was; the solution opened costs nothing at the opening, and the first answer given with it open costs the pips and the medal a miss in its place would. No help pays more than effort, on the exercise or by any answer after it: no road out-earns the same road with its help taken out, and no road with the solution out-earns the same road with a miss in the solution's place (a right first answer after clue 2 or 3 pays what miss-then-solve pays on the exercise and keeps the pips a miss loses, by design). A cleared set's medal is the one the old rule gave |
| `game/browser.test.js` | the game layer in Chromium: XP and combo, hearts, the finale, reloads, calm mode, sound, older saved progress, toasts, the settings sheet (modal at 360 with the account link and the theme choice, beside the rail at 1280, the theme chosen with storage blocked). The help ladder: the clue button from the start, wrong answers that open nothing, a clue that opens on a click with focus on it and is still open after a reload, a question for a sign-flipped answer, the solution opened on an untouched exercise costing no heart and no pip, and answering it then paying 3 XP and the two pips a miss would cost, 6 XP and no pip for a right first answer after clue 2, the finale's line counting the problems solved with the solution open beside three hearts kept and a Silver medal, and the keyboard path through clue, check and solution. The next-step card: the right first item for four stored states (a section due: the due review; a weak one, on a chapter page: a Repair run; only a place to continue: Continue; a section the Arena can ask about solved on its page a minute ago and one it cannot solved three days ago, never placed: Continue, with the review lobby naming tomorrow for the first and listing the second as due on its page, and the Arena's deck list not marking the first Due), the lobby's nothing-due line when only sections without problems are solved, each with its reason, never a child of `<main>` (in the chapter's banner), "Hide for today" taking it away with focus on the heading, writing the day to `bm.run.v1` and nothing synced, still away after a reload and back the next day, and kept in Study mode without its coloured edge. The typed grader's verdicts (decision 0002), injected into `BMCore.judge` on ch05 and in the Arena, which `site.js` and `arena.js` read at check time: on a page a `form` verdict shows its reason (and the "We read that as" line for a labeled point) at no XP, pip or attempt record, an `unread` one is a retype nudge, a right unreduced fraction carries the lowest-terms note, an unread blank stops the check named with nothing marked, a form blank is marked like a wrong one and tagged `data-verdict="form"` until the next check, and `[form, wrong]` blanks ask a stub `BMLearn.detect` about the wrong blank only; in the Arena `unread` nudges, stays on the question and keeps the clock running at no cost, and `form` costs a heart and the streak with its reason in place of the miss text, on the retry and after a reload; and 500 seeded golden cases judged in Chromium agree with Node. The real verdicts, with the typed grader live: on 01-numbers `0.667` for the key 2/3 is `form/rounded` at no cost, `1-1/2` is an unread nudge worded by the owner's Q4(a), `1 1/2` is wrong (it is 3/2) with the "We read that as 3/2" line, `4/6` is right with the lowest-terms note, a mixed number in a blank marks that blank and shows its reading, and an unread blank leaves the last check's marks; on 08-coordinates a wrong `x=3` on an exact card shows no reading line, `8/2` stays wrong for `4|iv`, and a labeled point for a point key is `form/notation` with its reading; in the Arena, on frac-sum problems set into the live run, the key with `º` or `˚` is `unread/units` (a nudge, no heart, the clock runs on), with ` deg` or `°` it is still right after `clean()`, and its 3-place decimal is `form/rounded`, a miss with its reason. The request for `bundle/three.js` is aborted, so the stages and the course map take their flat fallbacks whatever the machine's WebGL (the script is in the deploy gate, which is not retried) |
| `game/arena.test.js` | the Arena in Chromium: scoring, par and the clock, hearts, Daily, Repair, resume, calm mode mid-run, two tabs. The due review (`arena.html?mode=review`): the lobby tile and the review's own lobby list only the sections due today, most overdue first, and a due section with no generator apart, as "due, on the page" with a link to it; the run has no hearts, every question heart-free, two questions a section taking turns; its answers move the boxes by the usual rule (a clean due showing up one, a miss to box 0); the result shows the first-try count and rate with no target band and no 85 percent figure; with nothing left due (and with nothing due at all, in Study mode) the lobby says so and names the day of the next check. XP against farming across a simulated day: the day's first Repair (five answers on one section) pays in full and mentions no reduction; a second Repair of the section that day pays a quarter an answer, and the result says so in plain words; the third finished run pays 1 for finishing and says so; a new local day starts the counts again; the counts (`bm.run.v1.arenaDay`) never reach the synced game record. The Arena's own fallback, with `BMGame.recordRun` taken away: a clean due showing moves a box up one, an early clean one leaves box and date alone, a miss sends it to box 0 (not 1), and the XP takes the day's decay from the stored counts |
| `game/scenes.test.js` | 3D stages in Chromium on the SVG painter (the request for `bundle/three.js` is aborted, so Three.js never arrives): keyboard and buttons, touch scrolling, contrast of meaningful marks in both themes. Then the painters, in a second Chromium under the SwiftShader flags with the chunk served: on every page with a scene, every stage (exercise copies too) reaches the GL painter with `BM3D.load()` true, the painter's manager held and its context not lost; without WebGL, `load()` is false with the reason `no-webgl`, the chunk is never asked for, and every stage falls back to the SVG painter. The parity oracle for the scenes, as `BMMap3D.info()` is for the map |
| `game/content.test.js` | the new 3D exercises in chapters 8 and 16, answered through the page, with the request for `bundle/three.js` aborted as in `browser.test.js`; no page error or console error (but those aborted requests), so a Content-Security-Policy violation fails it as it fails every other browser script |
| `game/map.test.js` | the course world on the contents page (`assets/map3d.js`, `src/world/`). Every page's animation frames run on the script's clock (above, "WebGL in headless Chromium"): steady, no frame longer than the watchdog's `SLOW_MS`, pauses as they were, or exactly 60 or 200 ms a frame for the watchdog's checks, so no check depends on the machine's speed; and a world that has gone (`info()` null) fails the checks that wanted it, saying so, rather than stopping the script. Idle motion: on Medium (chosen first, since SwiftShader's own tier is low) the marker bobs after the world appears and after a flight, comes to rest within `AMBIENT_MS` and one bob (both read from their files), and the idle page then asks for no frames; never in Study mode, under reduced motion or on Low (chosen); a flight that lands draws at most once per display frame (counted against a loop of the check's own). A frame held in a hidden tab and a 2.5 s long task (every other frame on the steady clock, the pause as long as it was) keep the world on its tier and keep nothing in `bm.prefs.v1`, with Medium chosen and with medium as the device's own tier (a hardware renderer's name stubbed). An island acts like its list link (Ctrl+click and middle click open a new tab, a drag onto an island opens nothing). The loader: the page asks for `bundle/three.js` once and `bundle/world.js` once, holds the namespace on `BM3D.THREE` with nothing on `window.THREE`; when the Three.js request fails `load()` says false with the reason `cdn` and the list stands alone (the box, which kept the world's place while loading, gone, and `html[data-world]` with it); when it stalls past the loader's timeout the reason is `timeout`, and while it loads the four Part buttons are shown, disabled; a later `load()` shares the answer. The tiers: SwiftShader, the browser's own, gets low by itself (reason `software`), and so does llvmpipe (its name given to the page), and a hardware renderer (its name given) medium; each quality chosen gives its tier, its pixel ratio cap on a 3x screen, and over every Part at most its draw calls (and under a fifth of the 109 the course map took) and triangles (`info().budget`, the `TIERS` table); the frame times of four flights per tier are printed; with the map switch off neither chunk is fetched and no place is kept for the world. The watchdog: with every frame 60 ms apart medium steps to low and `gfxAuto` keeps `"low"`, the next visit starts there (`settled`); at five frames a second low gives the list back (`slow`) within four flights and keeps `"list"`, the next visit keeps the list with the map switch off, and switching the map on starts afresh; Low chosen by the learner, at five frames a second, gives the list back within four flights and keeps `"list"` too (the choice untouched; the next visit fetches no Three.js, and choosing again starts afresh); a quality the learner chose (High) steps down for the visit and keeps nothing. The keyboard: the canvas is `aria-hidden` and not focusable, Tab reaches the Part buttons, Enter flies to a Part, and the chosen button keeps its colours under the pointer while another takes the hover colour; at 1280x800 and 360x740, Tab from the top to the first chapter selects its island and marks the list item though the world is out of view, and scrolled back up the world is on that chapter, labelled; hovering a chapter while the stage is out of view leaves the world where it was, and on a screen tall enough for both, hovering flies to its island and marks it; a Part button focused when the context is lost hands the focus to the list. What is left behind: Graphics quality changed back and forth nine times leaves the same number of live WebGL buffers each time the world is back on Medium (`createBuffer` and `deleteBuffer` counted), and the map switched off leaves none; in the dark theme the selection ring around each Part's first island is that region's `--region-ink` (`info().ring`). The page around the world: with the page's module held back 1.5 s, at 1280 and 360 wide, the hero's top once the page is parsed is where it is once the world is drawn and no layout shift moves it (`html[data-world]` keeps the world's place from the first paint), and the world starts at `<main>`'s own padding. The picture, in both themes: drawn without the fog (`BMMap3D.fog(false)`, the canvas read in the same task) at least 2% of the first Part's frame changes and none of its row's islands, and the last Part's view has no more than 5% of its rows all sky |
| `src/**/*.test.ts` | not under `tools/`: the unit tests of the modules under `src/`, beside each one, run by Vitest (`npm run test:unit`, part of `npm run check`; `vitest.config.ts` keeps them off the site's build). The learning modules' tests (`src/learn/*.test.ts`, `src/ui/ladder.test.ts`, `src/ui/scroll-regions.test.ts`, `src/data/arena-sections.test.ts`, `src/data/skills.test.ts`, `src/a11y/math-text.test.ts`) are listed under `npm run check` above. `src/hud/levels.test.ts`: the level curve round trip for every XP to 60000, the ranks, junk read as no XP, and a total too large to be real (1e33, 1e300, `Number.MAX_VALUE`) read as `MAX_XP`, so the HUD script cannot hang before first paint. `src/hud/view.test.ts`: the HUD's day keys equal `site.js`'s over a year and its clock changes, totals, streaks, the goal, when the combo shows, every label a sentence, and the inline HUD script (`lib/shell.js` `hudLibrary()`, run in a vm) drawing exactly what the modules draw over 300 random stores. `src/world/tiers.test.ts`: which tier a device gets (no WebGL 2, Save-Data and `?3d=off` the list whatever was chosen; the map switch off the list; the list the watchdog kept, chosen quality or not; a chosen quality over the device's; a software renderer, a coarse pointer with four cores or fewer, or a low-end device, low; medium otherwise and never high unasked; never above the tier the watchdog settled on), the ladder down, each tier's pixel-ratio and buffer caps, and the watchdog (slow after `SAMPLES` frames over `SLOW_MS`, or after `WINDOW_MS` of them, so five frames a second are judged within four 700 ms flights, never on fewer than `MIN_SAMPLES`; 30 frames a second passes, and so does a fast run with one long hitch; a pause and the wait between runs of motion not counted). `src/world/layout.test.ts`: one island per chapter in reading order, a gate per Part at its review chapter, a terrace under each row one step up and back. `src/world/props.test.ts`: each region's own props, the same every time, more with each tier's detail, and every prop clear of the islands, the path, the gates and the others, on its terrace, and never tall in front of a row; the far hills in two rows behind the last terrace from side to side, the same every time, taller than it and never rising through it. `src/world/world.test.ts`: the world built with the Three.js package in Node, each tier's draw calls and triangles inside its budget whatever the progress (untouched, half way, every chapter finished with three stars), the merged batches' colours per range and repaint of one range, flat normals, edges where the matrix puts them, a cap recoloured in place, and the smoke's cycle. `src/sync/merge.test.ts`: the merge moved from `assets/account.js` gives what the merge gave before the move (that file at commit `7feca3e`, read with `git show` and run under a stub `window`), canonical JSON byte for byte, over 2,000 seeded triples of `tools/lib/random-state.js` states with `sectionConflicts: false` (fields no version knows included), for each order, grouping and repetition and for `mergeGame` alone; the merge laws over 2,000 triples whose devices disagree about sections (`sectionConflicts` on), every record both sides hold coming out with the greater of their sections; an attempt's `section` by hand (`{a}{b}` gives `b` either way, `{a}{}` gives `a`, `{}{''}` none; code units, not code points; a non-empty string over any other value) and as a maximum over every pair and triple of 15 values; `src/sync/` adds no global in Node; `BMMerge` is what `BMAccount.merge` and `.mergeGame` are; and a page without `BMMerge` logs `[BM] BMMerge missing` and `account.js` does nothing |

The browser ones resolve Playwright and load the build like `check-browser.js` (`dist/`, current,
or `--root`/`BM_ROOT` naming a build elsewhere), and each aborts every request that does not go
to the local server (the server's own origin, where the module chunks, the fonts, KaTeX and
Three.js come from, is let through), so none of them needs the network.
