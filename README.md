# Basic Mathematics

A static course site covering elementary mathematics from the ground up, following the topic
sequence of Serge Lang's *Basic Mathematics*: four parts, seventeen chapters, 76 sections.

Every chapter has prose written to be read with a pencil, worked examples with each step shown,
interactive figures where a picture beats words, and a practice set that grades itself and shows
full solutions. It plays like a game — a boss for every practice set, a combo meter, levels,
achievements, playable 3D problems and a timed Arena — and every one of those rules is there to
help the mathematics stick.

**Read it here: [sophanasok.github.io/basic-mathematics](https://sophanasok.github.io/basic-mathematics/)**

It is hand-written HTML, CSS, and plain JavaScript files, published through a small build
([Vite](https://vite.dev)) that writes each page's head and bundles its scripts, its fonts,
KaTeX and Three.js with them (the 3D library is fetched only where a 3D scene or the course map
is on screen, and the site works without it). Accounts are optional and off by default: with
[`assets/config.js`](assets/config.js) left empty the site talks to nobody, and a signed-out
reader's browser contacts no third party at all.

---

## For learners

### What this is, and what you need first

A complete course in the mathematics that comes before calculus: the rules of arithmetic and where
they come from, equations, geometry, coordinates, trigonometry, and a final part reaching toward
what follows. It assumes you can add, subtract, multiply, and divide whole numbers. It assumes
nothing else — in particular, no algebra.

The course refuses to use anything it has not established. When it claims a negative times a
negative is positive, it argues for it rather than asserting it.

### Where to start

Begin at **[Chapter 1, Numbers](https://sophanasok.github.io/basic-mathematics/parts/1-algebra/01-numbers.html)**,
even if it looks beneath you. It is where the rules everything else leans on get established, and
later chapters cite it constantly.

| Part | Chapters | What it covers |
| --- | --- | --- |
| I — Algebra | 1–4 + an interlude on logic | Integers, the rules of arithmetic, linear equations, the real numbers, quadratics |
| II — Intuitive Geometry | 5–7 | Distance and angles, the Pythagorean theorem, motions of the plane, area |
| III — Coordinate Geometry | 8–11 | Points as pairs, arithmetic on points, lines, trigonometry |
| IV — Miscellaneous | 12–16 | Functions, mappings, complex numbers, induction, determinants |

Work them in order. Chapters depend only on earlier ones, so skipping ahead mostly survives inside
a part — but Part III genuinely needs Part I, and trigonometry needs the geometry before it. **If a
chapter feels impossible, the problem is usually two chapters back.**

### How to work through a chapter

Each chapter opens with a **puzzle** — guess before reading; the recap returns to it — and a
**goal box** listing what you will be able to do by the end. A **warm-up** of three unscored
questions then checks the earlier material the chapter stands on. After that the pattern repeats:
the idea in plain language, the rule stated precisely, a worked example, and straight away a
**Your turn** problem of the same kind. One example per chapter has its later steps closed, to be
attempted before opening, and key results are preceded by a prompt to predict them. A practice set
and a recap close the chapter.

Some **Watch out** boxes, the ones about a trap in a method, are followed by a **Wrong turn**:
a worked example that makes the mistake on purpose. It follows the tempting step to the answer it
gives, runs a check that rejects that answer, and then shows the fix. Work these as carefully as
the other examples. Seeing a mistake fail is what helps you notice it in your own work later.

By default a chapter opens **one step at a time**: read a piece, press **Continue**, and where
the piece ends in a question, answer it to go on (or skip it — the course remembers, and counts
that section as one to come back to). The switch under the chapter title shows the whole page
instead, and remembers the choice.

The method in three lines, expanded on the
**[How to use this](https://sophanasok.github.io/basic-mathematics/about.html)** page:

1. **Read with a pencil.** Mathematics is not readable at the speed of prose. When a line of
   algebra appears, work it out yourself before reading the next line.
2. **Try to see why a rule must hold** before reading the justification. Even a failed attempt
   makes the explanation land, because you already know where the difficulty is.
3. **Do the exercises.** They are the course, not a garnish.

### Exercises

Every chapter ends with a practice set of about ten problems that check themselves. Type an answer,
press **Check** or <kbd>Enter</kbd>, and the first wrong attempt usually gets a hint rather than the
answer.

The last chapter of each Part (the Interlude, and Chapters 7, 11, and 16) carries a further
**mixed review** set afterward, drawing problems back from earlier chapters in that Part. These
exist for retrieval practice — the single best-evidenced way to make earlier material stick — so
treat them as part of the chapter, not an optional extra.

Answers are matched forgivingly: `0.5`, `1/2`, and `2/4` are all accepted for the same number,
spaces never matter, and `-3` and `−3` are the same. Where several numbers are wanted, separate
them with commas in any order.

Not every question is typed. Some ask you to put the lines of an argument in order (drag them,
or use the arrow buttons on each line), to fill blanks inside an equation, to tick every option
that applies, or to set an interactive figure so that it shows the answer.

Every problem has a full worked solution, not just an answer. Open it after a genuine attempt — and
open it **even when you were right**, to compare your route with the one shown. That comparison is
where most of the learning happens.

### The figures

Every interactive figure is operable from the keyboard. Press <kbd>Tab</kbd> to reach a slider or
button, then use the arrow keys; for the figures with draggable points, <kbd>Tab</kbd> to the figure
itself, move the selected point with the arrow keys, and press <kbd>Space</kbd> to switch points.
Each figure also states its conclusion in words underneath, so nothing is available only by
dragging.

They are there to be played with. Each has a short list of **missions** — things to make the figure
do, such as "make a system with no solution" or "find an angle where sin θ = cos θ" — and marks each
one with a star when you manage it.

Eleven of them are **3D scenes**, used where the third dimension is the mathematics: three planes
meeting in a point, a line or nothing; a determinant as the volume of a slanted box; why a box
scaled by 3 holds 27 copies; six stepped pyramids filling a box to prove the sum of squares. Drag
to turn a scene, or use its sliders and view buttons. Some questions are answered by building
something in a scene. While such a question is open the scene shows quantities but never says
whether you are right — only **Check** does — so the answer has to come from thinking, not from
wiggling until something lines up. Where 3D is not available the same scene is drawn flat, with the
same controls and the same answers.

### XP, streaks, and what to review

Correct answers and missions earn XP — most when right first time, less after a miss, least once
the solution has been opened. The header shows your level, today's XP against a daily goal, and
your streak of active days.

The **[progress page](https://sophanasok.github.io/basic-mathematics/progress.html)** turns the
record into advice. The course notes how each question went (tries, hints, whether the solution
was opened first) and lists the **sections worth rereading**, weakest first, alongside the ones
going well. A short version appears above each chapter's recap.

### The game

- **Combo.** Each answer right first time fills one of five pips, and a full meter adds up to
  double XP. A first miss on a practice problem costs two pips; working on with the hints after
  that costs nothing. Reading a solution *after* getting the answer earns a shield against the next
  miss.
- **Encounters.** Each practice set is a boss: the tempting wrong idea behind the chapter's opening
  puzzle. Every problem solved wears it down, in any order. Three hearts decide the medal, and
  nothing else: running out locks nothing, and the course points you at the section to reread.
- **The Arena** is the only place with a clock. It serves freshly generated problems from sections
  you have already solved, because speed practice helps with what you know and hurts with what you
  are still learning. A wrong answer costs a heart and stops the clock while you read the hint;
  "I don't know" costs nothing, so guessing never pays.
- **Levels and achievements** come from XP. The achievements reward study habits — right first
  time, repairing a weak section, reading solutions, finishing review sets — never speed alone.
- **Calm mode**, in the header menu, turns off hearts, the combo, the boss, shake and sound for
  anyone who wants the course without the game.

### Progress, and what is saved

Everything is remembered in **your browser**, in local storage — including achievements, medals
and Arena records. Without an account nothing is sent
anywhere, so progress will not follow you to another browser or device, and clearing site data
clears it. There is a deliberate reset button on the about page. The pages themselves fetch
nothing from anyone but this site (the fonts, the maths typesetting and the 3D library are
served with it).

Where the site has accounts switched on, signing in is optional and adds one thing: your progress
is copied to the course's database and follows you between devices. Each answer check by a
signed-in reader is also logged (which question, right or wrong, which try — never what was
typed) so the author can see which questions are too hard. The account page can download or
delete all of it.

Answer keys live in the page source, since the grading happens in your browser. This is a course to
learn from, not an exam — the only person you can cheat is yourself.

The light/dark toggle sits in the header and follows your system setting until you override it.

---

## For developers

### Running it locally

```sh
npm ci            # once: Vite, TypeScript (and @types/node), Playwright, axe-core.
                  # Node 22.18 or newer (.nvmrc: 24)
npm run dev       # the source tree, each page with its shell written and its entry served
                  # as modules, at http://localhost:8000, reloading as you edit
npm run build     # the site as it is published, into dist/
npm run preview   # that dist/, at http://localhost:8000
```

Both servers take port 8000 and refuse to start on any other:
`http://localhost:8000/account.html` is the address a sign-in is allowed to come back to
([`supabase/README.md`](supabase/README.md)).

**The source tree is not a site on its own.** A page in it holds its content and two markers,
`<!--bm:head-->` and `<!--bm:topbar-->`; the `<head>` (the boot script, stylesheets, fonts,
KaTeX, the page's module entry) and the top bar are written in by
[`tools/lib/shell.js`](tools/lib/shell.js) when the page is built or served
([The shell of a page](#the-shell-of-a-page)), and the scripts are bundled from that entry. So
look at the site through `npm run dev`, or build it and `npm run preview`: a source page opened
as a file, or published as it is, has no styles, no scripts and no top bar, and the site no
longer opens from `file://` at all (module scripts need an http origin).

Apart from that the build changes nothing a reader can see. `dist/` holds the same pages at the
same paths with the same content. The scripts come out as bundled chunks under `dist/bundle/`:
each page carries one `<script type="module">` for its own entry chunk, `bundle/pages/<page>.js`,
Vite splits what pages share into shared chunks, and the order the scripts run in is the entry's
import order (`vite.config.ts` turns on rolldown's `strictExecutionOrder` for that, because a
shared chunk would otherwise run its modules when it is imported, and `site.js` would run before
`widgets.js`). A chunk is named by the page kinds that load what is in it, `bundle/all.js`,
`bundle/chapter.js`, `bundle/home-chapter.js`, and so are the stylesheets, joined the same way
into `bundle/all.css` and the rest; nothing in `dist/` carries a hash, because GitHub Pages lets
a browser keep a page for ten minutes, and a page cached before a deploy must still find its
scripts after it ([`OPERATIONS.md`](OPERATIONS.md), "What a deploy does to a page a browser
already holds"). The stylesheets' text is the source's, not minified, because Vite's CSS
minifier rewrites values the scripts read (`vite.config.ts` says how, and `npm run check:dist`
holds the build to all of that). So the content of the pages is still edited by hand, and a
page added under `parts/` is picked up by the build without being listed.

What the site needs from outside its own files comes from npm and goes into the bundle, through
one module each under `src/vendor/` (`package.json` lists the packages): [KaTeX](https://katex.org)
for math typesetting on every page (`katex`, pinned at exactly 0.16.11, the version the pages
loaded from its CDN before, so typesetting is unchanged; `src/vendor/katex.js` is the first import
of every entry and sets `window.renderMathInElement`, `src/vendor/katex.css` its stylesheet), the
three typefaces (`@fontsource-variable/inter`, `@fontsource-variable/newsreader` and
`@fontsource-variable/bricolage-grotesque` for the upright faces, `@fontsource/newsreader` for the
italic: the very files Google Fonts served a browser for the link the pages used to carry, byte
for byte, declared in `src/vendor/fonts.css` as that link declared them, one `@font-face` per
family, style, requested weight and subset with `font-display: swap`; `tools/gen-fonts.js` writes
that file from the packages and `npm run check` fails when it is stale; the font files come out
under `dist/bundle/`), and
[supabase-js](https://github.com/supabase/supabase-js) for accounts (`@supabase/supabase-js`,
re-exported by `src/vendor/supabase.js`, which `assets/account.js` imports on demand, so it is a
chunk of its own, `bundle/supabase.js`, that a signed-out reader on an ordinary page never
downloads), and [Three.js](https://threejs.org) for the 3D scenes and the course map (`three`,
at its current release; `src/vendor/three.js` re-exports, by name, exactly the classes and
constants `assets/map3d.js` and `assets/scenes3d-gl.js` use, so the rest of the library is
shaken out; `assets/three-loader.js` imports that file on demand, only when a 3D scene or the
course map nears the screen, so it is a chunk of its own, `bundle/three.js`, that a page with
neither never downloads, and the namespace it loads is `BM3D.THREE`; if the chunk cannot be
fetched, or the browser has no WebGL 2, which the library requires, every 3D picture is drawn
flat with the same controls). So no stylesheet, script or font of a page comes from another
server (`npm run check:dist`, `offline`), and the browser checks fail any page that asks one for
anything.

**Third-party licences.** What the bundle holds that is not the site's own is published under its
package's licence: KaTeX, supabase-js (and what supabase-js depends on) and Three.js under MIT,
`tslib` under 0BSD, the three typefaces and the KaTeX fonts under the SIL Open Font License 1.1. The
build writes `dist/bundle/LICENSES.txt` beside the bundle, one section per installed package with
the licence file it ships (`tools/lib/vendor.js` `licenseNotice()`; the Open Font License asks
that copies of the fonts carry their copyright notice and the licence text, which the fontsource
files do not hold in their name tables), and `npm run check:dist` (`licences`) holds the file to
the installed packages and every font file in `dist/` to one of them.

### Layout

```
index.html              course contents: the path map and the 3D course map
about.html              how to study the course; play settings and progress reset live here
progress.html           the reader's dashboard: level, achievements, recall, sections to strengthen
arena.html              the Arena: timed retrieval practice from generated problems
account.html            sign in / sign up, export and delete (inert without config)
insights.html           the author's aggregate view; admins only
data/curriculum.js      single source of truth: parts, chapters, sections
data/quest.js           regions, bosses (the tempting guess of each chapter's puzzle), review echoes
data/gen/*.js           seeded problem generators for the Arena, one file per Part plus core.js
src/boot.js             the one script that runs before first paint, inlined into every page's
                        <head> by the shell: theme and play settings, plain ES5, never bundled
src/entries/*.js        one module entry per kind of page (home, page, dashboard, arena, chapter):
                        an ordered list of imports of the scripts below, which is the order they run in
src/vendor/katex.js     KaTeX from npm (pinned 0.16.11): sets window.katex and renderMathInElement;
                        every entry's first import
src/vendor/katex.css    KaTeX's stylesheet, imported from the package; linked on every page
src/vendor/fonts.css    Inter, Newsreader and Bricolage Grotesque from the fontsource packages, the
                        faces the Google Fonts link had, written by tools/gen-fonts.js; linked on
                        every page before katex.css
src/vendor/supabase.js  supabase-js from npm, imported on demand by assets/account.js: bundle/supabase.js
src/vendor/three.js     Three.js from npm, the names the site uses, imported on demand by assets/three-loader.js: bundle/three.js
assets/site.css         tokens (both themes, four regions), base, prose, cards, figures, print
assets/game.css         HUD, region banner, encounters, card states, toasts, settings, all motion
assets/scenes3d.css     3D scene stages
assets/map3d.css        the course map; arena.css the Arena
assets/site.js          navigation, theme, stores, exercise grading, XP, widget mounting
assets/widgets.js       the 32 flat interactive figures and their missions
assets/three-loader.js  lazy Three.js with fallback (window.BM3D.load, the namespace on BM3D.THREE)
assets/scenes3d.js      the 3D scene framework: define, display list, camera, SVG painter, input
assets/scenes3d-gl.js   the WebGL painter, imported on demand (import()) when a scene nears the screen
assets/scenes/*.js      one file per 3D scene; every chapter's bundle carries all of them
assets/game.js          combo, levels, achievements, recall, play settings, the HUD
assets/encounter.js     turns each practice and review set into an encounter
assets/sfx.js           synthesised sound effects, off by default
assets/arena.js         the Arena
assets/map3d.js         the 3D course map on the contents page
assets/lesson.js        step-by-step reading of a chapter
assets/config.js        Supabase URL and anon key, sign-in providers; empty means no accounts
assets/account.js       sign-in and sync, listening on BMStore
assets/insights.js      renders progress.html and insights.html
supabase/schema.sql     tables, row-level security, aggregate functions
supabase/README.md      how to switch accounts on
supabase/migrations/    one file per database change, run on the live project before the merge
OPERATIONS.md           the runbook: release order, deploys, quotas, secrets, incidents
tools/                  the checks: static, scenes, generators, game rules, the build, headless browser
tools/lib/shell.js      the <head> and the top bar of every page: the boot script inline, the vendor
                        stylesheets, its kind's stylesheets, and the module entry of its kind
tools/lib/vendor.js     which src/vendor/ module brings in each npm package (and its dependencies):
                        how the build names node_modules files and check-dist holds them; and the
                        licence notice the build writes into dist/bundle/LICENSES.txt from them
tools/gen-fonts.js      writes src/vendor/fonts.css from the fontsource packages (npm run gen:fonts)
tools/shell.json        what that comes to on each page, as readers have it (the `shell` check)
parts/<part>/<nn>-<slug>.html
package.json            the npm scripts, the five dev dependencies and the six the site is built
                        from (katex, four fontsource packages, supabase-js); package-lock.json pins them
vite.config.ts          the build: every page in, its shell written, its entry bundled in import
                        order into dist/bundle/, each chunk named by the page kinds that load it (a
                        node_modules file by its vendor module), the fonts beside them, the same
                        content out
tsconfig.json           for `npm run typecheck`; covers src/ and vite.config.ts
src/types/state.ts      the shapes of what the site keeps in localStorage (types only, so far)
src/types/globals.d.ts  the window.BM* globals the scripts share, each `any` until its file is converted
public/.nojekyll        copied into dist/
.github/workflows/      CI: the checks on every pull request, and the deploy of main
.nojekyll               left from when GitHub Pages published the branch itself; nothing needs it now
```

The six pages at the root and the chapters under `parts/` hold content only: a title, a
description, the two markers, and what is inside the page.

`data/curriculum.js` is the spine. Navigation, the sidebar, the contents page, the chapter
prev/next links, and the progress counters are all generated from it — no page hard-codes a link to
its neighbours.

### The shell of a page

No page writes its own `<head>` or top bar. A page starts like this, and
[`tools/lib/shell.js`](tools/lib/shell.js) writes the rest:

```html
<!doctype html>
<html lang="en">
<head>
<!--bm:head-->
<title>How to use this course — Basic Mathematics</title>
<meta name="description" content="How to study this course: …">
</head>
<body data-depth="0" data-page="page" data-nav="about">
<!--bm:topbar-->

<div class="wrap-narrow">
  <main id="main">
```

`<!--bm:head-->` is the first thing in `<head>`, followed only by the page's own `<title>`,
`<meta name="description">` and, for a page search engines should leave alone,
`<meta name="robots" content="noindex">`. `<!--bm:topbar-->` is the first thing in `<body>`. What
the shell writes depends on what `<body>` says:

| attribute | what it says |
| --- | --- |
| `data-depth` | how many directories deep the file is (`0` at the root, `2` for a chapter); every path the shell writes is made relative with it, and so are the links `site.js` generates |
| `data-chapter` | the page is a chapter: kind `chapter` |
| `data-page` | for any other page, its kind: `home` (the contents page, with the course map), `page` (prose or a form), `dashboard` (a page that `assets/insights.js` fills), `arena` |
| `data-nav` | the links of the top bar: `home` (only *How to use this*), `about` (*Contents* and *Progress*), or left out for the usual *Contents* and *How to use this* |

`data-page` and `data-nav` are instructions to the shell and are not in the page a reader gets.
(`data-scenes`, which once named a chapter's 3D scenes, is refused: every chapter's bundle
carries every scene.) What the shell writes into `<head>`, in order: the page's own tags, the
boot script inline ([`src/boot.js`](src/boot.js), before the stylesheets, so the theme is set
before the first paint without a request), the icon, the two vendor stylesheets
(`src/vendor/fonts.css`, then `src/vendor/katex.css`: `VENDOR_STYLES` in `tools/lib/shell.js`,
first so that `site.css`'s rules on `.katex` come after KaTeX's and win), the stylesheets of the
page's kind, and one `<script type="module">` for the kind's entry, `src/entries/<kind>.js`. The
stylesheets and the entry of each kind are `PAGE_KINDS` at the top of `tools/lib/shell.js`; the
scripts of a kind, in the order they run, are the imports of its entry, so that file is where a
script is added to every chapter, or moved. The order is part of the site (`site.js` mounts every
figure as it runs, so `widgets.js`, the scene framework and the scenes come before it; `game.js`,
`encounter.js` and `lesson.js` build on what it did; rules of equal weight are settled by the
order of the stylesheets), so what each page ends up with is recorded in `tools/shell.json`, and
`check-static.js` fails (`shell`) when a page's head, body attributes or top bar are no longer
what is recorded, and whatever the record says when a page's scripts are not the boot script and
the one entry of its kind (a classic `<script src>`, from the site or a CDN, fails). If the change
is meant, `node tools/check-static.js --only=shell --accept-shell` records it, and the diff of
`tools/shell.json` shows the reviewer exactly which pages now load what.

KaTeX is the entry's first import (`src/vendor/katex.js`) on purpose: the imports run in order,
so `window.renderMathInElement` is there when `site.js` runs, as it was when KaTeX's deferred CDN
tags came before the module script. The `pages` suite of `check-browser.js` holds that in a real
browser (a formula rendered on every page that has one), with the theme on `<html>` before the
first frame, `window.BMSite`, `BMGame` and `BMStore` present on every page, and no request to any
server but the site's own.

The same function runs in two places, so they cannot disagree: the build and `npm run dev`
(`vite.config.ts`), and every check that reads a page (`tools/lib/site.js`). A page with
`<main id="main">` and no marker stops the build and the checks with a message naming it. The
browser checks load the build ([`tools/README.md`](tools/README.md)).

### How a chapter page works

A chapter is a plain HTML file whose `<body>` says which chapter it is:

```html
<body data-depth="2" data-chapter="ch07" data-part="geometry">
```

`data-chapter` matches an `id` in `curriculum.js`, which is how the page finds its own title,
section list, and neighbours. `data-depth` is how many directories deep the file sits, so that
generated links can be made relative. `data-part` (also set by script) gives the page its region's
colours from the first paint.

The chapter opens with a region banner, which lesson mode looks for:

```html
<header class="region-banner">
  <p class="eyebrow">Part II — Intuitive Geometry · Chapter 7</p>
  <h1>Area</h1>
  <p class="lede">…</p>
  <div class="banner-meta" data-banner-meta></div>
</header>
```

The rest of the page is ordinary markup using a small set of classes: `.puzzle`, `.goal`,
`.warmup`, `.rule`, `.worked` with `.steps`, `.callout` (in `.idea` / `.warn` / `.why` / `.aside`
variants), `details.reveal`, `.display`, `.recap`, and `figure` (with `figure.diagram` for a static
inline SVG). Three elements are filled in by script — leave them empty:

```html
<aside class="sidebar" data-sidebar></aside>
<nav class="chapter-nav" data-chapter-nav></nav>
<span class="practice-score" data-practice-score></span>
```

A **Wrong turn** is a `.worked` block whose `.num` reads `Wrong turn.` instead of `Example n.`,
placed soon after the `.callout.warn` it illustrates. Its steps are the tempting move, the check
that catches it, and the repair. Keep a Wrong turn unnumbered: chapters cite worked examples by
number, so putting one into the example numbering would break those references.

Math goes in `$…$` for inline and `$$…$$` for display. `\(…\)` and `\[…\]` also work.

#### Puzzle, reveals, and faded examples

```html
<div class="puzzle" id="puzzle">
  <span class="tag">A puzzle to carry through the chapter</span>
  <p>…the question…</p>
  <ul class="guess"><li>one guess</li><li>another</li></ul>
  <p class="puzzle-after">Shown once a guess is made.</p>
</div>
```

The guesses become buttons; the choice is remembered but never graded. Inside `.recap`, a
`<div class="puzzle-answer">` containing an empty `<p data-your-guess></p>` closes the loop.

`<details class="reveal"><summary><span class="ask">question</span>Decide, then open</summary>…</details>`
is a predict-then-read prompt and needs no script. A **faded example** is a `.worked` block whose
later `<li>` steps each wrap their content in such a `details.reveal`.

#### Exercises

Each exercise is a `<div class="ex">` carrying its `id` and its answer key in attributes:

```html
<div class="ex" id="hyp-10-24" data-type="number" data-answer="26"
     data-hint="Compute a² + b², then take the square root.">
  <div class="ex-q"><p>A right triangle has legs $10$ and $24$. How long is the hypotenuse?</p></div>
  <div class="ex-solution">
    <p class="answer">Answer: $26$</p>
    <p>$c^2 = 100 + 576 = 676$, and $26^2 = 676$.</p>
  </div>
</div>
```

| Attribute | Meaning |
| --- | --- |
| `data-type` | `number`, `set` (a comma-separated list, order ignored), `expr`, `fraction`, or omitted for a forgiving text compare; `multi`, `order`, `blank`, `figure` for the untyped kinds below |
| `data-section` | The section the problem tests, for the feedback pages: a section id of this chapter, or `ch02#one-unknown` for a mixed-review problem drawn from another. Inline checks take the section they sit in |
| `data-answer` | The key. `\|` separates alternative accepted answers |
| `data-tol` | Absolute tolerance, for keys that are themselves rounded decimals |
| `data-hint` | Shown after the first wrong attempt |
| `data-hint2` | Optional; shown after the second wrong attempt |
| `data-inline` | Marks an unscored check ("Your turn", warm-up). Needs an `id`; `data-label` sets its heading |
| `id` | **Required on every exercise.** It is the key the reader's work is saved under — see "Progress keys" below |
| `data-placeholder` | Input placeholder text |

For multiple choice, add a `<ul class="choices">` of `<li>` options and make `data-answer` the
1-based index of the correct one. The engine is deliberately forgiving about surface form: spaces,
unicode minus signs, `√`, `π`, and `≤` are all normalised before comparison, and `1/4` is accepted
wherever `0.25` is.

Grading is entirely client-side, so answer keys are visible in the page source — by design, as
noted above.

The untyped kinds, each graded by the same engine:

```html
<!-- tick every option that applies: the key is the list of right ones -->
<div class="ex" data-inline id="k1" data-type="multi" data-answer="1,2,4"> … <ul class="choices">…</ul> … </div>

<!-- put in order: write the lines in the RIGHT order; they are scrambled on the page -->
<div class="ex" data-inline id="k2" data-type="order"> … <ol class="order"><li>…</li><li>…</li></ol> … </div>

<!-- blanks: each carries its own key (and data-type, default number); keep them outside $…$ -->
<div class="ex" data-inline id="k3" data-type="blank">
  <div class="ex-q"><p>$2^3 \cdot 2^4$ is $2$ to the power <span class="blank" data-answer="7"></span>.</p></div> …
</div>

<!-- answer on a figure: the factory's host.__answer() is compared with data-answer -->
<div class="ex" data-inline id="k4" data-type="figure" data-figure="unitcircle"
     data-compare="number" data-answer="180"> … </div>
```

`data-compare` is `exact` (the default), `number`, or `set`. The figure must not start in the
answering state. Six flat figures expose `__answer` so far: `numberline`, `linsys`, `quadratic`,
`distance`, `unitcircle`, `pointops`; adding one is a single line before the factory's
`missions(…)` call. Every 3D scene exposes one. A figure inside an exercise is mounted with
`data-no-missions`, so its missions are neither shown nor counted twice.

A 3D scene inside an exercise also reads two attributes from the `.ex`: `data-ask` picks which
quantity `__answer()` reports, so one scene can serve several questions, and `data-start` is a JSON
patch to its starting state (for example `'{"lock":[0,1]}'` makes two rows of `det3` read-only).

**Progress keys.** Every exercise carries an `id`, and the `id` is the key its saved work is
stored under: a scored exercise in the chapter's solved list, and any exercise, inline checks
included, in the attempt record. Nothing else decides the key, so a block can be moved, reordered
or wrapped in another element and readers keep their place.

The original exercises were once keyed by position among the id-less scored exercises of the page
(`e1`, `e2`, …). `tools/assign-ids.js` wrote each of those keys into the markup as the `id`, so
`e3` is now a name, not a count: it stays `e3` wherever the block goes, and the page's third
exercise need not be the one called `e3`. Positional keys exist only in history. The fallback that
computes them is still in `site.js` and `tools/lib/keys.js` so that pages at an older commit can be
read and compared, but no page may rely on it: `check-static.js` fails any exercise without an `id`
and any `id` used twice on a page.

A new exercise takes an `id` the page has never used. **A retired `id` is never reused** — when an
exercise is deleted its `id` goes with it, because a reader who solved the old problem would find
the new one already marked solved. Changing an exercise's question or key under the same `id` is the
same mistake. The progress-key check fails on both, for inline checks as for scored exercises,
for as long as the commit it compares with (`--base`) still has the old exercise; after that the
rule is kept by hand.

#### Figures

An interactive figure is one empty div:

```html
<figure>
  <div class="widget" data-widget="pythagoras"></div>
  <figcaption>…</figcaption>
</figure>
```

`data-widget` names a factory on `window.BMWidgets` in `assets/widgets.js`. Each factory takes the
host element and builds into it. Just before its first `draw()`, a factory calls
`missions(host, "name", [{ text, test }, …])`: each `test` is a function of the factory's own state,
re-run after any interaction with the figure, and must be false in the figure's initial state. A figure whose name is unknown, or that throws while mounting,
degrades to a short note instead of breaking the page around it.

Widgets are plain SVG built through a set of shared helpers: `Plot`, `grid`, `curvePath`, `slider`,
`chips`, `controls`, `readout`, `note`, `dragX`, `el`, `fmt`, `missions`, `animate` (which jumps to
the end state under `prefers-reduced-motion`), and the style table `S`, all exported on
`window.BMPlot`. Two more — `dragPoints`, for two-dimensional handles, and `arrowTo` — are
internal to `widgets.js` and available to any factory in that file. Colours come from CSS custom
properties, so every figure follows the theme automatically. The convention throughout is: build the frame once, redraw a single `<g>` on each
change, and use the readout to say in words what the picture is claiming.

#### 3D scenes

A 3D scene is mounted exactly like a flat figure — `<div class="widget" data-widget="det3">` — and
defined in its own file under `assets/scenes/` with `BM3D.define(name, spec)`. The header comment
of `assets/scenes3d.js` is the reference. In outline, a scene keeps a plain state object, and
`draw(g, s, api)` describes the picture to a display list in world coordinates (z up) on each
change. Two painters draw that list:
- an SVG projector draws at once, and is also the fallback and the print version;
- a WebGL painter takes over when Three.js arrives (`BM3D.load()`, which fetches
  `bundle/three.js` and needs WebGL 2).

One WebGL context serves every scene on the page. Rendering happens only on change.

Besides `draw`, a spec gives:
- `controls(api, s)`: sliders, chips, buttons, handles;
- `say(s, quiz)`: the readout;
- `answer(s, ask)`: what Check compares;
- `missions`;
- `cases`: answers the smoke test proves reachable.

**Quiz mode** is a scene inside an exercise that is not yet solved. `say` then reports quantities
only, never a verdict or the asked-for value. `draw` leaves out solution annotations, and nothing
turns green. Write questions that need a computation the picture does not hand over.

Every chapter's bundle carries the scene framework and every scene file: `src/entries/chapter.js`
imports `assets/scenes3d.js` and each file under `assets/scenes/` after `three-loader.js` and
before `site.js`, which mounts every figure as it runs. A new scene file is added to that entry
(the `shell` test in `tools/checks.test.js` fails a scene file the entry does not import); a
scene that is mounted but not defined there reads "Interactive figure … is not available", and
the `widgets` suite of `check-browser.js` fails. The WebGL painter, `assets/scenes3d-gl.js`, is
not in the bundle a page loads: `scenes3d.js` imports it with `import()` when a stage nears the
screen and Three.js has arrived, and the build makes it a chunk of its own, as it does Three.js
itself (`src/vendor/three.js`, which `three-loader.js` imports the same way). A Three.js name
the painter or the map starts to use is added to `src/vendor/three.js` (the `lib/vendor.js` test
in `tools/checks.test.js` holds that file's exports to exactly the names those two files use).
When the WebGL painter cannot start, a stage falls back to the SVG painter and says nothing in
the console, on purpose; so that a Three.js release that broke only the painter cannot pass on
the flat pictures, `tools/game/scenes.test.js` and the `widgets` suite of `check-browser.js` hold
every stage to the GL painter (`data-painter="gl" data-state="ready"`) wherever WebGL 2 is there,
and to the SVG fallback where it is not.

### The game layer

`site.js` exposes a few seams, and everything game-like hangs off them and the `BMStore` bus:
- `check()` asks `BMGame.bonus()` for the combo's share of XP;
- `reveal()` emits `opened`;
- `chapterDone` emits `chapterDone` and defers to an active encounter;
- `BMInsights.adjust` lets a repaired section leave "Areas to strengthen";
- `BMSite.grade` and `BMSite.refresh` are exported.

The files:
- `assets/game.js` holds the combo meter, levels (derived from total XP, never stored),
  achievements, the recall model, play settings and the HUD.
- `assets/encounter.js` decorates each `section.practice` (`#practice` and `#review`). Health is the
  number of unsolved problems and hearts are derived from the attempt log, so nothing can be lost
  and nothing locks. Encounters, the Arena and the map never create `.ex` elements, so progress
  keys are untouched.
- `data/quest.js` names each chapter's boss after the tempting guess in its opening puzzle. Check
  the index when a puzzle's options change.

The Arena's problems come from `data/gen/*.js`:

```js
BMGen.add({ id: "lin-collect", section: "ch02#one-unknown", par: 45, timed: true,
  make: function (r) {            /* r: seeded int, pick, nonzero, shuffle, chance */
    return { q: "Solve $…$ for $x$.", type: "number", answer: "4", hint: "…",
             steps: ["…", "…"], verify: function () { return true; } };
  } });
```

Answers are graded by the same `matches()` as the exercises. Mark a generator with few possible
answers `timed: false`. Hints name the next idea and never the number: `tools/check-gen.js` fails a
hint that contains its answer.

### Lesson mode

`assets/lesson.js` needs nothing from the chapter markup. On load it cuts the top-level children
of `<main>` into steps — a new one at every `<h2>`, and after the puzzle, the warm-up, each inline
`.ex`, each `details.reveal`, each figure with a widget, and each practice set — and hides the
steps not yet reached. A link to any `#id` in the chapter opens every step up to its target.
How far a reader has got is saved as a step number, so adding, removing or moving a top-level block
that cuts a step moves that place. The steps readers have are recorded in `tools/lesson-steps.json`,
and `check-static.js` warns (`lesson-steps`) when a chapter is no longer cut that way; if the
change is meant, `--accept-steps` records the new cuts.
Elements that scripts add later (the completion banner, the feedback note) appear with whatever
they were inserted in front of. Printing shows the whole chapter.

### Adding a chapter

1. Add an entry to the relevant part in `data/curriculum.js` — `id`, `label`, `title`, `file`,
   `status`, `blurb`, and the `sections` list.
2. Create the HTML file at `parts/<part-dir>/<file>`. Around its content a new page is a title, a
   description, the two markers and what its `<body>` says, and nothing else: no stylesheet link
   and no script tag ([The shell of a page](#the-shell-of-a-page)).

   ```html
   <!doctype html>
   <html lang="en">
   <head>
   <!--bm:head-->
   <title>17. … — Basic Mathematics</title>
   <meta name="description" content="…">
   </head>
   <body data-depth="2" data-chapter="ch17" data-part="topics">
   <!--bm:topbar-->

   <div class="wrap">
   <div class="layout">
     <aside class="sidebar" data-sidebar></aside>
     <main id="main">
       …
     </main>
   </div>
   </div>
   </body>
   </html>
   ```

   `data-chapter` is the new `id`. Inside `<main>`, give an `<h2 id="…">` to each section id —
   except a mixed-review set, whose id goes on its `<section class="practice" id="review">`.
3. Add the chapter's boss to `data/quest.js`: a name, the index of the tempting guess in its
   puzzle's `ul.guess`, and a one-line taunt that voices the wrong idea without answering it.
4. Record its lesson steps and its shell:
   `node tools/check-static.js --only=lesson-steps,shell --accept-steps --accept-shell` adds the
   chapter to `tools/lesson-steps.json` (the check warns until it is there) and to
   `tools/shell.json` (the check fails until it is there).

Navigation, the contents card, the sidebar, and the progress counters build themselves from step 1.

A page that is not a chapter is made the same way, with `data-page` naming its kind where a
chapter has `data-chapter`, and step 4 for its shell only.

### Stores, the bus, and accounts

All state is in `localStorage`, every access wrapped so a browser that blocks storage loses the
memory but keeps the site:

| Key | Holds |
| --- | --- |
| `bm.progress.v1` | solved scored exercises per chapter |
| `bm.play.v1` | missions and puzzle guesses |
| `bm.attempts.v1` | per exercise: `tries`, `first`, `hints`, `opened`, `skipped`, `solved`, `section` |
| `bm.activity.v1` | XP per day and the daily goal; streak and totals are derived from it |
| `bm.lesson.v1` | reading mode and the furthest step reached in each chapter |
| `bm.last`, `bm.theme` | where to continue; light or dark |
| `bm.game.v1` | achievements, compared solutions, recall per section, Arena bests, medals, Daily days (synced) |
| `bm.run.v1` | the combo meter and an unfinished Arena run (this device only; cleared by reset and sign-out) |
| `bm.prefs.v1` | calm mode, sound, 3D map, Arena tempo (this device only; survives a reset; keys the site does not know are kept) |
| `bm.sync.v1` | with accounts on: whose progress this browser holds and the last reset it knows of |
| `bm.sync.pending.v1` | with accounts on: progress that could not be saved when its reader signed out, kept aside per reader until they sign in here again |

Every write is announced on `window.BMStore` (`on(fn)` / `emit(change)`), with change types
`state`, `attempt`, `solved`, `xp`, `sync`, and `reset`, plus `opened`, `chapterDone`, `home`,
`combo`, `level`, `achievement`, `encounter`, `arena` and `prefs` from the game layer. The header
counters, lesson mode, the game layer and account sync are all just listeners; `site.js` knows
nothing about a server.

`assets/account.js` is the only file that talks to Supabase, and only when `assets/config.js` is
filled in and the reader has a session (or opens the account page) — otherwise the SDK is never
downloaded. Sync is a merge, never an overwrite: unions for solved exercises and missions, the
larger number for each day's XP, the furthest lesson step. `BMAccount.merge(a, b)` is pure and
gives the same result in either order. A save only lands on the version of the account a page
last saw, so a tab that has fallen behind another device merges first instead of overwriting it.
A deliberate reset is timestamped so other devices drop their copies rather than merging them
back, unless another device saved work after a reset that never reached the account, in which
case the work is kept. Signing out saves first; progress that cannot be saved is set aside in the
browser and saved the next time that reader signs in there. Besides an email address and a
password, a reader can sign in through any service listed under `providers` in
`assets/config.js`; a sign-in that the service refuses comes back with the reason in the
address, which the account page shows and removes. Setting it up is five steps:
[`supabase/README.md`](supabase/README.md).

A tab left open for a week, or a browser that still has last month's scripts cached, saves to
the same account as the newest copy of the site. Three rules keep an older copy from damaging
what a newer one saved. They are in force from the release that introduced them, so anything
that adds a synced field has to ship after it and can rely on them:

- **A field with no rule is carried, never dropped.** If one side of a merge holds it, it is
  kept. If both do, the value whose canonical JSON (keys sorted at every level) is the later
  string is kept, which is a maximum, so order, grouping and repetition still do not matter.
  This covers the top level of every synced store, the game record, each chapter's record in
  `bm.progress.v1` and `bm.play.v1`, each exercise's record in `bm.attempts.v1`, and each `sec`,
  `best` and `enc` entry of the game record. Such a field is merged by itself, not together with
  whichever record wins on the known fields. `game.js` keeps unknown fields the same way when it
  rewrites the game record or one of its entries, and `prefs()` and `setPref` keep unknown keys
  of `bm.prefs.v1`. Known fields merge exactly as before. Three limits:
  - In the stores keyed by chapter, exercise, section, mode or set (`bm.progress.v1`,
    `bm.play.v1`, `bm.attempts.v1`, and `sec`, `best` and `enc` in the game record) every key is
    merged as a record of that kind, whether or not this copy knows the key: next year's chapter
    must still merge as a chapter. So an object under a new key there is not passed through
    whole. Outside `bm.attempts.v1` it comes out with that kind's known fields added
    (`{"coins":5}` under a new key of `bm.progress.v1` becomes
    `{"solved":{},"total":0,"coins":5}`). Everywhere, a field of its own that has a known
    field's name is treated as that field, which can change or empty it, and two such objects
    are merged field by field, giving a mix neither device wrote. Nothing with another name is
    lost. A later release must not put an object under a new key of those stores unless it is
    a record of that kind. Anything else belongs under a new key at the top of the game
    record, of `bm.activity.v1` or of `bm.lesson.v1`, which is passed through whole, or in a
    store of its own.
  - A value that is not an object on either side is passed through whole, under a known key
    as under a new one. A damaged entry (a string where a chapter's record should be) is
    therefore no longer turned into an empty record by a sync; `BMProgress`, `BMPlay` and
    `BMAttempts` in `site.js` write a fresh record over one instead.
  - A key is data whatever it is called, `constructor` and `toString` included. The one name
    that is not carried is `__proto__`, which cannot be written back as an ordinary field.
- **The data says which shape it is in.** `v` in the game record, merged by taking the larger
  number. No `v` means 1, which is what this copy understands (`SCHEMA` in `account.js`), and
  nothing writes one yet. It is inside the data, not a column, so no SQL has to run before a
  site that reads it is deployed, and in the game record because that is the one synced store
  whose top level is a fixed set of named fields. A page that meets a `v` above its `SCHEMA`,
  in the account or in its own browser, still merges, so the reader keeps working with
  everything they have, but writes nothing to the server, neither the row nor the attempt log.
  The account page then says to reload. Work done in the meantime stays in the browser (signing
  out sets it aside) and is saved by the newer site.
- **Only what the server has is written.** A save names only the `user_state` columns the server
  has: the page learns them from the row it reads, and a first save that the server refuses for
  naming a missing column is repeated without it. What that column would hold stays in the
  browser. A save never names a column this copy does not know, so a column added later is left
  as it is, **by a reset too**: a reset made in an older copy empties the columns it knows,
  with any unknown fields and `v` inside them, and cannot touch a column it cannot name. A
  release that adds a `user_state` column must clear it itself when it sees `reset_at` advance.
  A missing `attempts` table means the attempt log is switched off: the queue is kept and the
  sync still succeeds. The page then holds the log back, asks again every five minutes, and
  keeps only the newest 500 checks meanwhile.

What the first rule gives a new field is survival, and agreement between devices. If the field
needs a rule of its own (a larger number, a union), the release that first writes it must add
that rule, and should choose values for which the fallback is harmless in older copies: `"9"`
sorts after `"10"`. A change to what an existing field means needs a larger `v`.

The "areas to strengthen" ranking is `BMInsights` in `site.js`: each attempted exercise gets a
struggle score from 0 (right first time) to 1, averaged per section.

The theme follows the operating system by default and can be overridden with the toggle in the
header.

### Checking your changes

`tools/` holds the checks, and `package.json` names them. `npm ci` installs what they need;
the browser ones also need Chromium once, `npx playwright install chromium`
(see [`tools/README.md`](tools/README.md)).

```sh
npm run check           # everything that needs no browser, about 15 s:
npm run typecheck       #   tsc over src/ and vite.config.ts
npm run check:static    #   syntax, progress keys, ids, lesson steps, the shell, links, sections,
                        #   widgets, choices, migrations, placeholders, merge laws, contrast,
                        #   animations
npm run check:gen       #   every Arena generator over 500 seeds
npm run check:scenes    #   every 3D scene: mount, controls, missions, answers
npm run test:node       #   the progress-key, id and lesson-step rules on small pages;
                        #   BMAccount.merge with the game store and fields this copy has never heard
                        #   of; account sync (stale tabs, resets, failed sign-outs, newer and older
                        #   sites and tables, sign-in through another service); the game's rules

npm run build           # dist/
npm run check:dist      # dist/ is the source's site, each source page taken with its shell
                        # written: same pages and nothing extra, links and font urls resolve
                        # inside it, <main> and the page around it untouched, the boot script
                        # inline and one module entry whose bundle is its kind's imports (KaTeX
                        # by its vendor module), supabase-js and Three.js each a chunk of its
                        # own that no page names, no copy of a source script, nothing from
                        # another server, CSS text and cascade the source's with the vendor CSS
                        # ahead, no secrets

npm run test:browser    # the game, the Arena, the account page (and that a signed-out page
                        # never fetches the supabase chunk), the 3D stages, the new 3D exercises
                        # and the course map, each driven in headless Chromium
npm run check:browser   # dist/ served: every page × theme × width (errors, theme before first
                        # paint, scripts ran, KaTeX rendered, no request to any other server,
                        # Three.js fetched only where there is 3D, overflow, lesson mode),
                        # figures, every exercise typed back, restore of old progress, saved
                        # state from the last release, reduced motion, WebGL and its fallbacks,
                        # axe. About 8 minutes, and nothing in it needs the network

npm run check:all       # all of the above, in that order
```

Each script is one `node tools/…` command and takes its flags after `--`:
`npm run check:static -- --base=<ref>`, `npm run check:browser -- --only=05-distance`. `--base`
should be the last commit readers' progress was saved against: the progress-key check fails if any
existing exercise's key or question changed, inline checks included, or if any exercise has no
`id`. The same run fails an `id` that appears twice on a page, and warns when a chapter is not cut
into the lesson steps recorded in `tools/lesson-steps.json`. It also fails (`shell`) when what
`tools/lib/shell.js` writes around a page — the tags of its head in order, its body attributes,
its top bar — is not what `tools/shell.json` records for that page; `--accept-shell` records a
change that is meant, and `--shell-base=<ref>` compares with the pages of a commit instead of the
file. The `migrations` check does not use
`--base`. It compares against the commit the branch left `main` at (or `--migrations-base=<ref>`)
and fails if `supabase/schema.sql` changed since then with no new migration, or if a migration
that was already there was edited, renamed or removed.

The browser scripts load the build, `dist/`, over http, and refuse to run when it is missing or
older than anything it is built from (`run npm run build first`): the source tree is not a site,
so there is nothing else to test. CI runs all of this on every pull request
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

Still checked by hand: the solution of a multiple-choice question states the option the key
names; a new `order` list is authored in the right order; a new puzzle's tempting guess in
`data/quest.js`; and reading one whole chapter on a phone in each theme.

### Deploying

The site is on GitHub Pages. A push to `main` runs the checks and the build in GitHub Actions,
and the `deploy` job publishes that run's `dist/` once the `build` and `browser` jobs have passed.
The WebGL checks run in a job of their own, retried, and do not hold a deploy back. Runs on
`main` go one at a time, in the order of the pushes, so an older commit is never published over
a newer one; for the same reason a re-run of an old run refuses to deploy once `main` has moved
on (re-run the newest run, or use Run workflow).

**The Pages source has to be GitHub Actions, and it has to be set before the change that
introduced the page shell is merged:** Settings → Pages → Build and deployment → Source:
**GitHub Actions**, by the repository's owner; then publish with Actions → CI → Run workflow, on
`main` (or simply push). With the older setting, **Deploy from a branch**, GitHub Pages publishes
the files of `main` as they are, and from that change on those files are not a complete site:
every page is missing its `<head>` and its top bar until the build has written them
([The shell of a page](#the-shell-of-a-page)), so readers would get pages with no stylesheets and
no scripts. The workflow does not paper over that: on `main`, while the source is anything but
GitHub Actions, the `pages-source` job fails the run with a message saying what to set, and
nothing is deployed. (It also fails if it cannot find out which source is set, because GitHub's
API refuses or fails.)

**Switching back to "Deploy from a branch" is no longer a way to roll back.** It used to be,
while the source tree was the site. To undo a deploy now, revert the commit on `main` and let the
revert deploy ([`OPERATIONS.md`](OPERATIONS.md), "A bad deploy").

Run workflow on `main` is also the way to publish again without a new commit.

## About the text

This site follows the topic sequence of Serge Lang's *Basic Mathematics* (Springer). It is not
affiliated with the author or the publisher, and reproduces none of the book's text: all prose,
examples, figures, and exercises here are original.
