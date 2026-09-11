# Basic Mathematics

A static course site covering elementary mathematics from the ground up, following the topic
sequence of Serge Lang's *Basic Mathematics*: four parts, seventeen chapters, 72 sections.

Every chapter has prose written to be read with a pencil, worked examples with each step shown,
interactive figures where a picture beats words, and a practice set that grades itself and shows
full solutions.

**Read it here: [sophanasok.github.io/basic-mathematics](https://sophanasok.github.io/basic-mathematics/)**

No build step, no dependencies to install, no server required. It is HTML, CSS, and three files of
plain ES5 JavaScript.

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

Each chapter opens with a **goal box** listing what you will be able to do by the end. Read it
first and again at the end, as a self-check. Then the pattern repeats: the idea in plain language,
the rule stated precisely, worked examples with every step shown, an interactive figure where a
picture beats words, and a practice set. A recap closes it.

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

Answers are matched forgivingly: `0.5`, `1/2`, and `2/4` are all accepted for the same number,
spaces never matter, and `-3` and `−3` are the same. Where several numbers are wanted, separate
them with commas in any order.

Every problem has a full worked solution, not just an answer. Open it after a genuine attempt — and
open it **even when you were right**, to compare your route with the one shown. That comparison is
where most of the learning happens.

### The figures

Every interactive figure is operable from the keyboard. Press <kbd>Tab</kbd> to reach a slider or
button, then use the arrow keys; for the figures with draggable points, <kbd>Tab</kbd> to the figure
itself, move the selected point with the arrow keys, and press <kbd>Space</kbd> to switch points.
Each figure also states its conclusion in words underneath, so nothing is available only by
dragging.

They are there to be played with — change the values until you can predict what the picture will do
before you move the slider.

### Progress, and what is saved

Solved exercises are remembered in **your browser only**, under a single local-storage key. There
is no account and no server, and nothing is sent anywhere. So your progress will not follow you to
another browser or device, and clearing site data clears it. There is a deliberate reset button on
the about page.

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
index.html              course contents, built from the curriculum data
about.html              how to study the course; progress reset lives here
data/curriculum.js      single source of truth: parts, chapters, sections
assets/site.css         all styling, including both themes
assets/site.js          navigation, theme, progress, exercise grading, widget mounting
assets/widgets.js       the 25 interactive figures
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

The rest of the page is ordinary markup using a small set of classes: `.goal`, `.rule`,
`.worked` with `.steps`, `.callout` (in `.idea` / `.warn` / `.why` / `.aside` variants), `.display`,
`.recap`, and `figure`. Three elements are filled in by script — leave them empty:

```html
<aside class="sidebar" data-sidebar></aside>
<nav class="chapter-nav" data-chapter-nav></nav>
<span class="practice-score" data-practice-score></span>
```

Math goes in `$…$` for inline and `$$…$$` for display. `\(…\)` and `\[…\]` also work.

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
| `data-type` | `number`, `set` (a comma-separated list, order ignored), `expr`, `fraction`, or omitted for a forgiving text compare |
| `data-answer` | The key. `\|` separates alternative accepted answers |
| `data-tol` | Absolute tolerance, for keys that are themselves rounded decimals |
| `data-hint` | Shown after the first wrong attempt |
| `data-placeholder` | Input placeholder text |

For multiple choice, add a `<ul class="choices">` of `<li>` options and make `data-answer` the
1-based index of the correct one. The engine is deliberately forgiving about surface form: spaces,
unicode minus signs, `√`, `π`, and `≤` are all normalised before comparison, and `1/4` is accepted
wherever `0.25` is.

Grading is entirely client-side, so answer keys are visible in the page source — by design, as
noted above.

#### Figures

An interactive figure is one empty div:

```html
<figure>
  <div class="widget" data-widget="pythagoras"></div>
  <figcaption>…</figcaption>
</figure>
```

`data-widget` names a factory on `window.BMWidgets` in `assets/widgets.js`. Each factory takes the
host element and builds into it. A figure whose name is unknown, or that throws while mounting,
degrades to a short note instead of breaking the page around it.

Widgets are plain SVG built through a set of shared helpers: `Plot`, `grid`, `curvePath`, `slider`,
`chips`, `controls`, `readout`, `note`, `dragX`, `el`, `fmt`, and the style table `S`, all exported
on `window.BMPlot`. Two more — `dragPoints`, for two-dimensional handles, and `arrowTo` — are
internal to `widgets.js` and available to any factory in that file. Colours come from CSS custom
properties, so every figure follows the theme automatically. The convention throughout is: build the frame once, redraw a single `<g>` on each
change, and use the readout to say in words what the picture is claiming.

### Adding a chapter

1. Add an entry to the relevant part in `data/curriculum.js` — `id`, `label`, `title`, `file`,
   `status`, `blurb`, and the `sections` list.
2. Create the HTML file at `parts/<part-dir>/<file>`, with `data-chapter` set to the new `id` and
   an `<h2 id="…">` matching each section id.

Navigation, the contents card, the sidebar, and the progress counters build themselves from step 1.

### Progress and theme

Both live in `localStorage` under `bm.progress.v1` and `bm.theme` — this browser only, no account
and no server. Clearing site data clears them; there is a deliberate reset button on the about
page. Every storage access is wrapped, so a browser that blocks storage loses the memory but keeps
the site.

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

The widgets can be smoke-tested in Node under a small DOM shim — mount each factory, then fire its
sliders at both endpoints, click its chips, and drag on its SVG — which catches the errors that only
appear at degenerate parameter values.

## About the text

This site follows the topic sequence of Serge Lang's *Basic Mathematics* (Springer). It is not
affiliated with the author or the publisher, and reproduces none of the book's text: all prose,
examples, figures, and exercises here are original.
