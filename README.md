# Basic Mathematics

A static course site covering elementary mathematics from the ground up, following the topic
sequence of Serge Lang's *Basic Mathematics*: four parts, seventeen chapters, 76 sections.

Every chapter has prose written to be read with a pencil, worked examples with each step shown,
interactive figures where a picture beats words, and a practice set that grades itself and shows
full solutions.

**Read it here: [sophanasok.github.io/basic-mathematics](https://sophanasok.github.io/basic-mathematics/)**

No build step, no dependencies to install, no server required. It is HTML, CSS, and a handful of
plain ES5 JavaScript files. Accounts are optional and off by default: with
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

### XP, streaks, and what to review

Correct answers and missions earn XP — most when right first time, less after a miss, least once
the solution has been opened. The header shows today's XP against a daily goal and your streak of
active days.

The **[progress page](https://sophanasok.github.io/basic-mathematics/progress.html)** turns the
record into advice. The course notes how each question went (tries, hints, whether the solution
was opened first) and lists the **sections worth rereading**, weakest first, alongside the ones
going well. A short version appears above each chapter's recap.

### Progress, and what is saved

Everything is remembered in **your browser**, in local storage. Without an account nothing is sent
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

The only external dependency is [KaTeX](https://katex.org), pulled from a CDN for math typesetting.
If the CDN is unreachable the prose still renders — formulas fall back to their TeX source rather
than taking the page down.

### Layout

```
index.html              course contents: the path map, built from the curriculum data
about.html              how to study the course; progress reset lives here
progress.html           the reader's dashboard: streak, XP, sections to strengthen
account.html            sign in / sign up, export and delete (inert without config)
insights.html           the author's aggregate view; admins only
data/curriculum.js      single source of truth: parts, chapters, sections
assets/site.css         all styling, including both themes
assets/site.js          navigation, theme, stores, exercise grading, XP, widget mounting
assets/widgets.js       the 32 interactive figures and their missions
assets/lesson.js        step-by-step reading of a chapter
assets/config.js        Supabase URL and anon key; empty means no accounts
assets/account.js       sign-in and sync, listening on BMStore
assets/insights.js      renders progress.html and insights.html
supabase/schema.sql     tables, row-level security, aggregate functions
supabase/README.md      how to switch accounts on
parts/<part>/<nn>-<slug>.html
.nojekyll               so GitHub Pages serves the files as authored
```

`data/curriculum.js` is the spine. Navigation, the sidebar, the contents page, the chapter
prev/next links, and the progress counters are all generated from it — no page hard-codes a link to
its neighbours.

### How a chapter page works

A chapter is a plain HTML file that declares two things on its `<body>`:

```html
<body data-depth="2" data-chapter="ch07">
```

`data-chapter` matches an `id` in `curriculum.js`, which is how the page finds its own title,
section list, and neighbours. `data-depth` is how many directories deep the file sits, so that
generated links can be made relative.

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
answering state. Six figures expose `__answer` so far: `numberline`, `linsys`, `quadratic`,
`distance`, `unitcircle`, `pointops`; adding one is a single line before the factory's
`missions(…)` call. A figure inside an exercise is mounted with `data-no-missions`, so its
missions are neither shown nor counted twice.

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
   an `<h2 id="…">` matching each section id.

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

Every write is announced on `window.BMStore` (`on(fn)` / `emit(change)`), with change types
`state`, `attempt`, `solved`, `xp`, `sync`, and `reset`. The header counters, lesson mode, and
account sync are all just listeners; `site.js` knows nothing about a server.

`assets/account.js` is the only file that talks to Supabase, and only when `assets/config.js` is
filled in and the reader has a session (or opens the account page) — otherwise the SDK is never
downloaded. Sync is a merge, never an overwrite: unions for solved exercises and missions, the
larger number for each day's XP, the furthest lesson step. `BMAccount.merge(a, b)` is pure and
gives the same result in either order. A deliberate reset is timestamped so other devices drop
their copies rather than merging them back. Setting it up is five steps:
[`supabase/README.md`](supabase/README.md).

The "areas to strengthen" ranking is `BMInsights` in `site.js`: each attempted exercise gets a
struggle score from 0 (right first time) to 1, averaged per section.

The theme follows the operating system by default and can be overridden with the toggle in the
header.

### Checking your changes

There is no test runner, but the content is regular enough to verify from the command line. These
checks were used while writing Chapters 5–16 and are worth repeating after edits:

- Syntax: `node --check assets/widgets.js && node --check data/curriculum.js`
- Every `id` in `curriculum.js` has a matching `<h2 id="…">` in its chapter.
- Every exercise key is accepted by the grader in `site.js` when typed back, and every
  multiple-choice index is in range and matches the answer stated in the solution.
- Every internal `href` resolves to both file and anchor.
- Every `data-widget` name exists on `window.BMWidgets`.
- No pre-existing exercise's progress key has changed (compare against the previous commit).
- Every `data-section` names a real section, and every `order` list is authored in the right order.
- `lesson.js` leaves every `<h2 id>` reachable, and `BMAccount.merge` is still commutative.
- Every mission is false when its figure mounts, and can be driven true through the controls.

The widgets can be smoke-tested in Node under a small DOM shim — mount each factory, then fire its
sliders at both endpoints, click its chips, and drag on its SVG — which catches the errors that only
appear at degenerate parameter values.

## About the text

This site follows the topic sequence of Serge Lang's *Basic Mathematics* (Springer). It is not
affiliated with the author or the publisher, and reproduces none of the book's text: all prose,
examples, figures, and exercises here are original.
