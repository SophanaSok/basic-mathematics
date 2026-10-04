# Basic Mathematics

A static course site covering elementary mathematics from the ground up, following the topic
sequence of Serge Lang's *Basic Mathematics*: four parts, seventeen chapters, 76 sections.

Every chapter has prose written to be read with a pencil, worked examples with each step shown,
interactive figures where a picture beats words, and a practice set that grades itself and shows
full solutions. It plays like a game — a boss for every practice set, a combo meter, levels,
achievements, playable 3D problems and a timed Arena — and every one of those rules is there to
help the mathematics stick.

**Read it here: [sophanasok.github.io/basic-mathematics](https://sophanasok.github.io/basic-mathematics/)**

No build step, no dependencies to install, no server required. It is HTML, CSS, and plain ES5
JavaScript files; KaTeX and (only where a 3D scene is on screen) Three.js come from a CDN, and the
site works without either. Accounts are optional and off by default: with
[`assets/config.js`](assets/config.js) left empty the site talks to nobody.

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
clears it. There is a deliberate reset button on the about page.

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

Open `index.html` in a browser. That is the whole procedure — `file://` works, because the
curriculum is loaded as a `<script>` rather than fetched.

If you would rather serve it:

```sh
python -m http.server 8000   # then visit http://localhost:8000
```

Two libraries come from CDNs: [KaTeX](https://katex.org) for math typesetting on every page, and
[Three.js](https://threejs.org) 0.160.1 (the last release with a classic build, pinned with an
integrity hash) only when a 3D scene or the course map nears the screen. If either CDN is
unreachable the page still works: formulas fall back to their TeX source, and every 3D picture is
drawn flat with the same controls.

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
assets/boot.js          the one synchronous script: theme and play settings before first paint
assets/site.css         tokens (both themes, four regions), base, prose, cards, figures, print
assets/game.css         HUD, region banner, encounters, card states, toasts, settings, all motion
assets/scenes3d.css     3D scene stages
assets/map3d.css        the course map; arena.css the Arena
assets/site.js          navigation, theme, stores, exercise grading, XP, widget mounting
assets/widgets.js       the 32 flat interactive figures and their missions
assets/three-loader.js  lazy, pinned Three.js with fallback (window.BM3D.load)
assets/scenes3d.js      the 3D scene framework: define, display list, camera, SVG painter, input
assets/scenes3d-gl.js   the WebGL painter, loaded only when a scene nears the screen
assets/scenes/*.js      one file per 3D scene
assets/game.js          combo, levels, achievements, recall, play settings, the HUD
assets/encounter.js     turns each practice and review set into an encounter
assets/sfx.js           synthesised sound effects, off by default
assets/arena.js         the Arena
assets/map3d.js         the 3D course map on the contents page
assets/lesson.js        step-by-step reading of a chapter
assets/config.js        Supabase URL and anon key; empty means no accounts
assets/account.js       sign-in and sync, listening on BMStore
assets/insights.js      renders progress.html and insights.html
supabase/schema.sql     tables, row-level security, aggregate functions
supabase/README.md      how to switch accounts on
tools/                  the checks: static, scenes, generators, game rules, headless browser
parts/<part>/<nn>-<slug>.html
.nojekyll               so GitHub Pages serves the files as authored
```

`data/curriculum.js` is the spine. Navigation, the sidebar, the contents page, the chapter
prev/next links, and the progress counters are all generated from it — no page hard-codes a link to
its neighbours.

### How a chapter page works

A chapter is a plain HTML file that declares two things on its `<body>`:

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

Each exercise is a `<div class="ex">` carrying its answer key in attributes:

```html
<div class="ex" data-type="number" data-answer="26"
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
| `id` | **Required on every exercise added from now on** — see below |
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

**Progress keys.** A scored exercise is remembered under its `id` if it has one, and otherwise
under its position among the id-less scored exercises of the page (`e1`, `e2`, …). The original
exercises have no ids, so their keys are positional. Give every new exercise an `id` and nothing
shifts; add one without an `id` above an old one and readers' saved progress moves to the wrong
problems. Inline exercises are never stored.

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
- a WebGL painter takes over when Three.js arrives.

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

Pages with a scene load `assets/scenes3d.js` and the scene files after `three-loader.js` and before
`site.js`: `site.js` mounts every figure as it runs.

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
Elements that scripts add later (the completion banner, the feedback note) appear with whatever
they were inserted in front of. Printing shows the whole chapter.

### Adding a chapter

1. Add an entry to the relevant part in `data/curriculum.js` — `id`, `label`, `title`, `file`,
   `status`, `blurb`, and the `sections` list.
2. Create the HTML file at `parts/<part-dir>/<file>`, with `data-chapter` set to the new `id` and
   an `<h2 id="…">` matching each section id — except a mixed-review set, whose id goes on its
   `<section class="practice" id="review">`.
3. Add the chapter's boss to `data/quest.js`: a name, the index of the tempting guess in its
   puzzle's `ul.guess`, and a one-line taunt that voices the wrong idea without answering it.

Navigation, the contents card, the sidebar, and the progress counters build themselves from step 1.

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
| `bm.prefs.v1` | calm mode, sound, 3D map, Arena tempo (this device only; survives a reset) |
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
browser and saved the next time that reader signs in there. Setting it up is five steps:
[`supabase/README.md`](supabase/README.md).

The "areas to strengthen" ranking is `BMInsights` in `site.js`: each attempted exercise gets a
struggle score from 0 (right first time) to 1, averaged per section.

The theme follows the operating system by default and can be overridden with the toggle in the
header.

### Checking your changes

`tools/` holds the checks. They install nothing; the browser checks borrow Playwright from wherever
`BM_PLAYWRIGHT_FROM` points (see [`tools/README.md`](tools/README.md)).

```sh
node tools/check-static.js --base=<ref>   # syntax, ES5, progress keys vs <ref>, links, sections,
                                          # widgets, choices, placeholders, merge laws, contrast,
                                          # animations
node tools/smoke-scenes.js                # every 3D scene: mount, controls, missions, answers
node tools/check-gen.js                   # every Arena generator over 500 seeds
node tools/game/merge.test.js             # BMAccount.merge, including the game store
node tools/game/sync.test.js              # account sync: stale tabs, resets, failed sign-outs
node tools/game/rules.test.js             # combo, levels, hearts, medals, achievements, recall
node tools/game/browser.test.js           # the game in a browser: combo XP, hearts, finale, reload,
                                          # calm mode, sound off, old progress, toasts, the sheet
node tools/game/arena.test.js             # Arena runs: scoring, clock, hearts, Daily, Repair, resume
node tools/game/scenes.test.js            # 3D stages: keyboard, touch, contrast of what carries meaning
node tools/game/content.test.js           # the new 3D exercises in chapters 8 and 16, answered live
node tools/game/map.test.js               # the course map: fallbacks, idle rendering, clicks
node tools/check-browser.js               # every page × theme × width in headless Chromium:
                                          # errors, overflow, lesson mode, figures, every exercise
                                          # typed back, restore of old progress, reduced motion,
                                          # WebGL and its fallbacks, file://, axe
```

`--base` should be the last commit readers' progress was saved against: the progress-key check
fails if any existing exercise's key or question changed, or if a new scored exercise has no `id`.

Still checked by hand: the solution of a multiple-choice question states the option the key
names; a new `order` list is authored in the right order; a new puzzle's tempting guess in
`data/quest.js`; and reading one whole chapter on a phone in each theme.

## About the text

This site follows the topic sequence of Serge Lang's *Basic Mathematics* (Springer). It is not
affiliated with the author or the publisher, and reproduces none of the book's text: all prose,
examples, figures, and exercises here are original.
