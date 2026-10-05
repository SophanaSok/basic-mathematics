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
KaTeX and Three.js with them (the 3D library is fetched only where a 3D scene or the course world
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
- **Study mode**, the first choice in the settings sheet (the menu button in the header), keeps
  hints, reviews and progress and removes hearts, the combo, the bosses, motion and sound, for
  anyone who wants the course without the game. (In the code and the stores it is still `calm`.)
- **The settings sheet** also holds sound and its volume, Reduce motion and Reduce transparency
  (on top of what the device asks for: while the device asks, or Study mode is on for motion, the
  switch shows on and cannot be turned off), the theme (light, dark or match the system), the
  reading panel, graphics quality and the 3D course map. Every setting stays on the device.
- **The course world.** The contents page opens on a small 3D world of the course: four regions,
  one per Part (the Foundry for algebra, the Fields for geometry, the Grid for coordinates, the
  Observatory for the rest), each a terrace with its chapters standing on it as islands, a ring
  for how much of each is solved, a shrinking boss for what is left and a flag once it is done.
  Click an island to open its chapter (on a phone, tap once to pick it, again to open it), or use
  the four buttons above it to fly to a Part. The chapter list below the introduction is always
  there and is the same course in words; it is what a screen reader and the keyboard use, and
  focusing a chapter in it picks that chapter's island, so the world is on it when you scroll back
  up (where the world is on screen too, you see it fly there). Graphics quality in the settings sheet picks how
  much the world draws (Auto, Low, Medium, High); switch the 3D course map off to have the list
  alone. The world moves for a few seconds after you touch it and then holds still; in Study mode
  and with Reduce motion it never moves at all.
- **Between pages**, in a browser that can (Chrome and Edge 126 and later, Chrome for Android,
  Safari 18.2 and later), the next page fades in under a header that stays where it is. The fade
  takes a quarter of a second, and a click in that time, even on the header, does nothing (the
  browser's rule while a fade runs), so click again. Study mode, Reduce motion and a device that
  asks for less motion turn the fade off, and any other browser simply opens the next page, as
  every browser did before.

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

The page is a dark game frame with the reading on a light paper panel set into it, in both themes:
the light/dark toggle in the header shades the frame, and follows your system setting until you
override it. The text, worked examples, figures and exercises stay on light paper, which is easier
to read for long stretches.

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
downloads), and [Three.js](https://threejs.org) for the 3D scenes and the course world (`three`,
at its current release; `src/vendor/three.js` re-exports, by name, exactly the classes and
constants `assets/map3d.js`, `src/world/*.ts` and `assets/scenes3d-gl.js` use, so the rest of the
library is shaken out; `assets/three-loader.js` imports that file on demand, only when a 3D scene or the
course world nears the screen, so it is a chunk of its own, `bundle/three.js`, that a page with
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
index.html              course contents: the course world (3D) above the introduction and the chapter list
about.html              how to study the course; play settings and progress reset live here
progress.html           the reader's dashboard: level, achievements, recall, sections to strengthen
arena.html              the Arena: timed retrieval practice from generated problems
account.html            sign in / sign up, export and delete (inert without config)
insights.html           the author's aggregate view; admins only
data/curriculum.js      single source of truth: parts, chapters, sections
data/quest.js           regions, bosses (the tempting guess of each chapter's puzzle), review echoes
data/gen/*.js           seeded problem generators for the Arena, one file per Part plus core.js
src/boot.js             the one script that runs before first paint, inlined into every page's
                        <head> by the shell: theme, reading panel, play settings, reduce motion and
                        transparency, and the skip of the view transition between pages in Study
                        mode and reduced motion; plain ES5, never bundled
src/hud/levels.js       the level curve and ranks, and view.js what the HUD shows and how it is drawn:
                        plain ES modules the shell inlines after every top bar (the HUD script, which
                        fills the HUD before first paint and hands them to the page as window.BMHud,
                        where game.js and site.js use them); never bundled; Vitest tests beside them
src/ui/settings.ts      the settings sheet: opens the top bar's <dialog>, shows and passes on the settings
src/world/tiers.ts      the course world's quality tiers (list, low, medium, high), which one a device gets,
                        their budgets and the watchdog; in the contents page's bundle
src/world/*.ts          the course world itself (index.ts and what it imports: layout, props, regions,
                        marks, materials, lighting, batches), imported on demand by assets/map3d.js:
                        bundle/world.js; Vitest tests beside them
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
src/styles/tokens.css   every colour, duration and shape token: the paper (light, and the dark panel a
                        reader can choose), the frame (each theme), the four Parts and their 3D
                        regions, motion, magnitude, focus, glass; the one file that defines a colour
assets/site.css         base, the frame and the reading panel, prose, cards, figures, print
assets/game.css         HUD, the settings sheet, region banner stats, encounters, card states, toasts, all motion
assets/scenes3d.css     3D scene stages
assets/map3d.css        the course world and the hub layout of the contents page; arena.css the Arena
assets/site.js          navigation, theme, stores, exercise grading, XP, widget mounting
assets/widgets.js       the 32 flat interactive figures and their missions
assets/three-loader.js  lazy Three.js with fallback (window.BM3D.load, the namespace on BM3D.THREE)
assets/scenes3d.js      the 3D scene framework: define, display list, camera, SVG painter, input
assets/scenes3d-gl.js   the WebGL painter, imported on demand (import()) when a scene nears the screen
assets/scenes/*.js      one file per 3D scene; every chapter's bundle carries all of them
assets/game.js          combo, levels, achievements, recall, play settings, keeping the HUD up to date
assets/encounter.js     turns each practice and review set into an encounter
assets/sfx.js           synthesised sound effects, off by default
assets/arena.js         the Arena
assets/map3d.js         the course world on the contents page: its tier, camera, pointer, labels, the
                        chapter list it mirrors, the render loop (what it draws is src/world/)
assets/lesson.js        step-by-step reading of a chapter
assets/config.js        Supabase URL and anon key, sign-in providers; empty means no accounts
assets/account.js       sign-in and sync, listening on BMStore
assets/insights.js      renders progress.html and insights.html
supabase/schema.sql     tables, row-level security, aggregate functions
supabase/README.md      how to switch accounts on
supabase/migrations/    one file per database change, run on the live project before the merge
OPERATIONS.md           the runbook: release order, deploys, quotas, secrets, incidents
tools/                  the checks: static, scenes, generators, game rules, the build, headless browser
tools/lib/shell.js      the <head> and the top bar of every page: the boot script inline, the
                        view-transition opt-in inline, the vendor stylesheets, its kind's
                        stylesheets, and the module entry of its kind; the HUD's slots, the
                        account chip, the sound and menu buttons, the settings sheet, and the
                        HUD script after the top bar
tools/lib/vendor.js     which src/vendor/ module brings in each npm package (and its dependencies):
                        how the build names node_modules files and check-dist holds them; and the
                        licence notice the build writes into dist/bundle/LICENSES.txt from them
tools/gen-fonts.js      writes src/vendor/fonts.css from the fontsource packages (npm run gen:fonts)
tools/shell.json        what that comes to on each page, as readers have it (the `shell` check)
parts/<part>/<nn>-<slug>.html
package.json            the npm scripts, the seven dev dependencies and the six the site is built
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
| `data-page` | for any other page, its kind: `home` (the contents page, with the course world), `page` (prose or a form), `dashboard` (a page that `assets/insights.js` fills), `arena` |
| `data-nav` | the links of the top bar: `home` (only *How to use this*), `about` (*Contents* and *Progress*), or left out for the usual *Contents* and *How to use this* |

`data-page` and `data-nav` are instructions to the shell and are not in the page a reader gets.
(`data-scenes`, which once named a chapter's 3D scenes, is refused: every chapter's bundle
carries every scene.) What the shell writes into `<head>`, in order: the page's own tags, the
boot script inline ([`src/boot.js`](src/boot.js), before the stylesheets, so the theme and the reading panel are set
before the first paint without a request), the opt-in to view transitions between pages as one
inline `<style>` (see "Between pages" below for why it is inline), the icon, the two vendor stylesheets
(`src/vendor/fonts.css`, then `src/vendor/katex.css`: `VENDOR_STYLES` in `tools/lib/shell.js`,
first so that `site.css`'s rules on `.katex` come after KaTeX's and win), the stylesheets of the
page's kind (`src/styles/tokens.css` first of them), and one `<script type="module">` for the kind's entry, `src/entries/<kind>.js`. The
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

The top bar is whole from the first byte: the brand, the page links, the HUD (the game slots of
the page's kind, the boss's hearts on a chapter, hearts and the clock in the Arena; the combo; the
level badge and XP bar; the streak with today's goal as a ring), the account chip, the sound and
menu buttons, the Arena's second row for a narrow screen, and the settings sheet, a `<dialog
id="hud-sheet">`. Straight after it comes a second inline script, the HUD script: the text of
[`src/hud/levels.js`](src/hud/levels.js) and [`src/hud/view.js`](src/hud/view.js) in one
function (`hudScript()`; their `export`s, their one `import` and their comments taken off), which
reads the stores and fills the level, the XP bar, the streak and the combo before the first paint,
then leaves those functions on the page as `window.BMHud`. `game.js` draws the HUD with the same
functions from then on and `site.js` reads the streak, the goal and the total through them, so
there is one copy of the level curve and the HUD's drawing, and the HUD does not move when the
bundle arrives: every slot's width is set in `rem` and `em`, not by its digits or font, and a game
slot the page can use is laid out empty from the start (the `hud` suite of `check-browser.js`
measures every box before the bundle runs, at `DOMContentLoaded` and after load). As the window
narrows, the top bar drops, in this order, the brand's name, the page links, the hearts and the
clock (to the encounter on a chapter, to the second row in the Arena), the account chip and the
sound button, all of which the sheet has, and then makes the HUD's parts smaller, so the menu
button stays on screen at the right end of the bar at every width down to 320px; a bar with more
in it starts sooner (`game.css`, the collapse, which the `hud` suite sweeps). The bar is
right-aligned, so the game slots, which only some kinds of page have, come first: the combo, the
level, the streak, the account chip, Sound and the menu button sit in the same place on every kind
of page at every width, and going from one page to another moves none of them (the `hud` suite
compares every kind of bar at each width of its sweep). `tools/shell.json`
records the top bar's links and buttons by their labels, the sheet's among them, and the HUD
script as a fingerprint of its text; `check-static.js` also fails a page whose body has any other
script.

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
the end state under `prefers-reduced-motion` or the settings sheet's Reduce motion), and the style table `S`, all exported on
`window.BMPlot`. Two more — `dragPoints`, for two-dimensional handles, and `arrowTo` — are
internal to `widgets.js` and available to any factory in that file. Colours come from CSS custom
properties, so every figure follows the reading panel (light paper, or dark when the reader chose it) automatically. The convention throughout is: build the frame once, redraw a single `<g>` on each
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
the painter or the world starts to use is added to `src/vendor/three.js` (the `lib/vendor.js` test
in `tools/checks.test.js` holds that file's exports to exactly the names `scenes3d-gl.js`,
`map3d.js` and `src/world/*.ts` use; `src/world/three.ts` types the namespace the world is handed as
that module, so a name missing there is also a type error).
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

### The course world

The contents page is the hub: `index.html` puts the world's box (`div[data-map3d]`) first in
`<main>`, above the hero and the chapter list. `assets/map3d.js` decides, before anything 3D is
fetched, which **tier** the device gets (`src/world/tiers.ts`):

| Tier | Chosen when | Pixel ratio | Draw calls | Triangles | Props per region | Idle motion |
| --- | --- | --- | --- | --- | --- | --- |
| list | no WebGL 2, Save-Data, `?3d=off`, the 3D course map switch off, or the watchdog gave up | — | — | — | — | — |
| low | Graphics quality Low; or a software renderer (SwiftShader, llvmpipe, WARP), a coarse pointer with four cores or fewer, or a low-end device (2 GB of memory or less) | 1 | 10 | 9,000 | the fewest | none |
| medium | Graphics quality Medium; everything else | 1.5 | 12 | 11,000 | more | 5 s after input |
| high | only Graphics quality High | 2 | 12 | 14,000 | the most | 5 s after input |

Each tier also caps the drawing buffer's pixels (1.2, 2.1 and 4.2 million), so a big canvas on a
dense screen is drawn at fewer device pixels per CSS pixel. A **watchdog** watches the frames
drawn while something moves, and judges them every 60 frames or every 2 seconds of them,
whichever comes first (never on fewer than 8, so the low tier, whose only frames are camera
flights, is judged within a few flights even at five frames a second): when they average more
than 34 ms (under 30 a second), the world steps down one tier, and from low to the list. When
the tier was the device's own, the tier it settles on is kept in `bm.prefs.v1` as `gfxAuto`
(this device's, never synced), so the next visit starts there; a choice of graphics quality, or
switching the 3D map on, clears it. A tier the learner chose is stepped down for the visit
only, except that the list is kept whatever was chosen: a device too slow for the low tier would
otherwise fetch Three.js and the world's chunk on every visit only to give them up.

The world's place is kept from the **first paint**. The world stands above the hero, and the
module that draws it runs after the page is painted, late on a slow network; a box that
appeared only then would drop the hero the reader is already looking at by the world's height.
So the inline boot script (`src/boot.js`) makes the cheap tests first (WebGL 2 in the browser,
no Save-Data, no `?3d=off`, the map not switched off and not given up as too slow) and stamps
`html[data-world]`, and `assets/map3d.css` holds the box at the size of the Part buttons' row
and the stage until `map3d.js` fills it, or gives it up and the attribute with it.

When the tier is not the list, the box shows its four Part buttons (disabled until the world
is drawn) and a "Loading the map" panel at once, in the place kept for them, and `map3d.js`
fetches Three.js
(`BM3D.load()`, the loader the 3D scenes share) and the world's own chunk, `bundle/world.js`
(`import()` of `src/world/index.ts`), side by side. If either fails the box goes and the list
stands alone; `BMMap3D.why()` says why. No other page asks for either chunk (the pages suite
watches the requests).

What is drawn (`src/world/`): four **terraces**, one per Part, stepping up and back from the
Foundry to the Observatory, each with its own props made only of Three.js primitives (`props.ts`
places them, seeded, clear of the islands, the path and the gates, tall ones never in front of a
row; `regions.ts` builds them): chimneys with smoke, a furnace, crates and an anvil in the
Foundry; tents, hills and trees in the Fields; a lattice of posts, axis beams and nodes in the Grid;
a dome, a telescope, stars on rods and rocks in the Observatory; and along each terrace's front
edge a rim of low pieces (blocks, bushes, capped posts, crystals), set closer with each tier's
detail; and behind the Observatory, two rows of **far hills** (`placeRange`), so the last Part,
which has no terrace rising behind it as the others have, is not framed under a band of empty
sky. Every prop is inked in its region's `--region-ink`, which stands 3:1 off that region's
ground in both themes, as does the selection ring (the far hills are not inked: lines that far
off break into dashes). On them stand the chapter islands,
the path's stones and the review gates. All of that is **one mesh and one set of ink edges**
(`batch.ts` merges the primitives with vertex colours and flat normals), so the still world is two
draw calls; the progress marks (`marks.ts`: ring, boss, flag, stars) are two more, rebuilt only
when progress changes; the marker, the selection ring, the smoke and the telescope are the rest.
The course map before the world took 109 draw calls a frame at rest and up to 139 in flight; the
world took at most 9 at any tier, width or Part in headless Chromium (7 at 1280 wide, where
`tools/game/map.test.js` measures it). The pointer is tested against invisible
stand-ins for the islands and gates.

**Colour and light.** Every colour is a token, read at run time from probes in the box
(`materials.ts`): the islands' paper and the Parts' hues follow the reading panel, and each
region's ground, rock, sky, fog, glow and ink (`--region-*`) follow the theme. Colour handling is
the scenes' (ColorManagement off, linear output), so a token goes in and comes out as written.
Shading is **toon**: a three-band ramp (a three-texel texture built in code, the only texture) on
one key light, plus an even ambient term, tuned (`lighting.ts`) so a face turned up shows its token
exactly and the others 0.79 and 0.62 of it. The sky is the region's `--region-sky` and the fog its
`--region-fog`, mixed between two regions as the camera moves. The fog starts 4 units behind the
camera's target, where the terrace in view ends, so that terrace keeps its colours exactly, and
is whole 16 behind it: the back of the terrace behind fades by about a third toward the fog, and
what is further back (the next terraces, the far hills) by half or more. `map.test.js` draws the
frame without the fog and checks it changes. No post-processing and no bloom.
Labels over the world sit on solid paper (`--text` on `--surface`, a measured pair).

**Motion.** Frames are drawn on demand: for a camera flight, and on medium and high for five
seconds of **idle motion** after an input (the marker's bob, the Foundry's smoke, the
Observatory's telescope), which then runs to the end of the bob and stops; an idle page asks for no
frames at all. Study mode and reduced motion (the device's or the sheet's) stop idle motion and
turn flights into cuts. Nothing flashes and nothing loops for longer than the window.

**Keyboard and screen readers.** The canvas is `aria-hidden` and not focusable; the chapter list
is the accessible version, and the four Part buttons are real buttons. Focusing a chapter in the
list selects its island (ringed and labelled) and marks the list item, at any size: the world
stands above the hero and the list below it, so on most screens the two are not seen together,
and then the camera cuts to the island, so a keyboard learner who tabs down the list and scrolls
back up finds the world on that chapter; where the stage (half of it) and the link are both in
view, it flies there. Hovering a chapter flies there only while the stage is in view, since a
pointer sweeping the list is not choosing. A click on
an island opens the same link as the list (a modified or middle click a new tab, a tap selects
first). If the world goes (a lost context, the watchdog) while a Part button has the focus, the
focus moves to the list.

`BMMap3D.info()` is the test handle: `triangles`, `calls` (the last frame's draw calls),
`pixelRatio`, `tier`, `reason`, `budget` (the tier's caps), `ambient`, `frames`, `bobbing`,
`flying`, `current`, `hot`, `stones`, `isles` (what each island shows), `ring` (the
selection ring's colour) and `fog` (its near and far). `BMMap3D.fog(false)` draws the same view
at once without the fog (and `fog(true)` with it), for the check that it shows.

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
| `bm.last`, `bm.theme` | where to continue; light or dark, or nothing to match the system (this device only) |
| `bm.game.v1` | achievements, compared solutions, recall per section, Arena bests, medals, Daily days (synced) |
| `bm.run.v1` | the combo meter and an unfinished Arena run (this device only; cleared by reset and sign-out) |
| `bm.prefs.v1` | the settings sheet's and the Arena's settings: `calm` (Study mode), `sound`, `volume` (0 to 100, unset is 50), `motion` and `transparency` (`"reduce"`, unset follows the device), `panel` (`"dark"`, unset for light paper), `gfx` (`"low"`, `"mid"`, `"high"`, unset is Auto: the course world's tier), `map` (`"list"` keeps the chapter list alone), `gfxAuto` (not a setting: the tier the world's watchdog settled on, `"list"`, `"low"` or `"medium"`; cleared by a choice of `gfx` or `map`), `tempo` (this device only; survives a reset; keys the site does not know are kept; a value it does not know reads as unset) |
| `bm.sync.v1` | with accounts on: whose progress this browser holds and the last reset it knows of |
| `bm.sync.pending.v1` | with accounts on: progress that could not be saved when its reader signed out, kept aside per reader until they sign in here again |

Every write is announced on `window.BMStore` (`on(fn)` / `emit(change)`), with change types
`state`, `attempt`, `solved`, `xp`, `sync`, and `reset`, plus `opened`, `chapterDone`, `home`,
`combo`, `level`, `achievement`, `encounter`, `arena` and `prefs` from the game layer, and `theme` when the reader chooses one. The header
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

The theme follows the operating system by default and can be set to light or dark in the
settings sheet ("Match system" goes back to following it).

### The look: tokens, the frame and the panel

Every colour on the site is a custom property in [`src/styles/tokens.css`](src/styles/tokens.css),
which the shell links first of the site's own stylesheets on every page; no other stylesheet
writes a colour (`check-static.js` `colours` fails a hex, `rgb()`, `hsl()` or a named colour anywhere else). The
page has two surfaces, and the tokens keep them apart:

- **The frame** is the page around the reading: the body, with a faint motif of the page's Part
  (the graph paper on a page of no Part), the top bar, the region banner's band, the toasts. It is
  dark in both themes; `html[data-theme]` only changes its shade (`--frame-*`, `--hud-*`,
  `--part-frame`, and the 3D world's `--region-*`, plain six-digit hex because WebGL reads them).
  The top bar is glass (`--glass`) where the browser can blur what scrolls under it, and its solid
  colour (`--glass-solid`) everywhere else and when the reader asks for less transparency, on the
  device or with the settings sheet's Reduce transparency (`html[data-transparency]`, stamped
  before the first paint), which also makes the modal sheet's scrim (`--scrim-glass`) solid.
- **The panel** is the reading column, `.wrap` or `.wrap-narrow`: prose, worked examples, figures,
  3D scenes, exercise cards, the course world's islands and labels (its regions' sky and ground
  are the theme's `--region-*`). It is light paper in both themes, because dark text
  on a light panel reads best for long stretches; a reader can choose a dark panel
  (the settings sheet's Reading panel, `bm.prefs.v1` `panel: "dark"`), which `src/boot.js` stamps
  as `html[data-panel]` before the first paint. The paper tokens (`--bg`, `--surface`, `--text`, `--accent`, `--part`, `--plot-*` …)
  follow `data-panel`, never `data-theme`.

The same file holds the motion tokens (`--dur-press` … `--dur-max` and the easings, with the old
`--t-1` … `--t-5` kept as aliases), magnitude (`--mag-s`, `--mag-m`, `--mag-l`: how far feedback
swells, by the size of the event), and the focus recipe (`--focus` on paper, `--focus-frame` on the
frame: the top bar and the skip link that appears over it). Three static checks hold the rest:
`contrast` measures every pair in `tools/contrast-pairs.json` in both themes with both panels and
every Part, glass laid over the paper it can sit on, and print restating every paper token the dark
panel sets; `animations`
fails anything that loops forever or repeats more than three times, or more than three times a
second, counting the flashes inside a cycle's `@keyframes`; `reading-column` fails an animation, a moving transition
or decoration inside the reading column and the exercise cards unless
`tools/reading-column-allow.json` lists the rule with its reason. Print has no frame: paper, ink,
nothing else.

### Between pages

Every navigation is a full page load. Where the browser has cross-document view transitions,
the page arriving fades in under a top bar that stays put; elsewhere pages load exactly as
before, since a browser that does not know the at-rule ignores it. Support, from
[caniuse](https://caniuse.com/cross-document-view-transitions) and
[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@view-transition) in October 2026:
Chrome and Edge 126 and later, Opera 112 and later, Safari and iOS Safari 18.2 and later, and
Chrome for Android (MDN: 126 and later, with Android's WebView; caniuse lists only its current
version, 154, which has them). Firefox (to 160) has only same-document view transitions, so it
does not run these. The two disagree on Samsung Internet: caniuse lists it without them (to 30),
MDN with them from 28. MDN marks the feature "limited availability", not Baseline.

- **The opt-in** is `@view-transition { navigation: auto; }` inside
  `@media (prefers-reduced-motion: no-preference)`, so a device that asks for less motion never
  opts in. It is the one inline `<style>` of every page, which `tools/lib/shell.js` (`OPT_IN`)
  writes straight after the boot script, and not a rule of the bundle's CSS: the browser asks
  the page arriving whether it opts in before that page's stylesheets are sure to have been
  applied, and with the rule in `all.css` Chromium 153 turned most navigations made soon after
  a page loaded down, with an uncaught "ViewTransition opt-in disabled" error on the new page.
  Inline, it never did.
- **What moves** is in `assets/game.css` ("Between pages", inside the motion block): the top bar
  is the one named element (`view-transition-name: hud`), and its pseudo-elements and every
  group have no animation, so the top bar is the new page's at once and in the same place, and so
  is every part of the HUD in it that both pages show: the parts only some pages have (hearts,
  the clock, a combo that is only a shield) sit to the left of the rest (`tools/lib/shell.js`
  `hud()`), so nothing a reader watches jumps when a chapter or the Arena adds them. The
  settings sheet, open beside the rail on a wide screen, has a name of its own while it is open
  (`hud-sheet`), so a link followed from it fades the sheet out with the page from where it hung
  instead of taking it away with the old top bar in one frame; the modal sheet of a narrow
  screen is in the top layer, which fades with the page anyway. The rest
  of the page is the root's snapshot, the viewport as the reader sees it, so a page left half-way
  down fades out where it was and nothing slides or stretches: the old page goes in `--dur-state`
  eased by `--ease-in`, the new one comes in `--dur-reveal` eased by `--ease-out`, over the old
  with plain alpha and the frame colour behind both. A transition is over about 250ms after the
  new page shows.
- **Clicks in that quarter of a second are lost.** While a transition runs, the page under it is
  not hit-tested: the specification has every captured element, the top bar and the root here,
  behave as if it had `pointer-events: none`, so a click lands on `<html>` and does nothing, even
  on the HUD that looks as if it has not moved. The window is the longest of the fades,
  `--dur-reveal`; the `transitions` suite holds it to 250ms and the menu button to taking clicks
  again once the transition is over, so a longer token cannot widen it quietly. Study mode and
  Reduce motion have no transition and so no such window.
- **Back and forward** restore a page from the browser's back/forward cache, and that page is
  offered a transition like any other: it runs, or the boot script skips it (its listeners are
  still there), exactly as on a page arriving from a link. A page stays in that cache only while
  nothing makes it ineligible (an `unload` listener, `Cache-Control: no-store` on the page or on
  a request it makes); the `transitions` suite, with the pages served under GitHub Pages'
  `max-age=600`, fails when going back or forward does not restore the page.
- **Study mode and Reduce motion** are attributes on `<html>`, which an at-rule cannot read, so
  the boot script (`src/boot.js`) skips the transition itself: on `pageswap` for the page being
  left (Study mode may have been switched on there since it loaded) and on `pagereveal` for the
  page arriving, which it listens for before that page's first frame.
- **Nothing waits for it.** No page holds its first paint back for a transition (no
  `blocking="render"`), so the old page shows for as long as it would have anyway: the old page
  stays live while the next one is fetched, and its snapshot is taken only when the new page
  commits. A navigation that takes longer than the browser's timeout, four seconds in Chrome
  ([Chrome's guide](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document)),
  is shown with no transition. Chromium then reports the rejection of a transition no script was
  handed as an uncaught error; the boot script quiets that one rejection and no other.

The `transitions` browser suite holds all of this in Chromium (`tools/README.md`).

### Checking your changes

`tools/` holds the checks, and `package.json` names them. `npm ci` installs what they need;
the browser ones also need Chromium once, `npx playwright install chromium`
(see [`tools/README.md`](tools/README.md)).

```sh
npm run check           # everything that needs no browser, about 15 s:
npm run typecheck       #   tsc over src/ and vite.config.ts
npm run check:static    #   syntax, progress keys, ids, lesson steps, the shell, links, sections,
                        #   widgets, choices, migrations, placeholders, merge laws, contrast,
                        #   animations (no loop, no flash), colours (only in tokens.css), the reading column
npm run check:gen       #   every Arena generator over 500 seeds
npm run check:scenes    #   every 3D scene: mount, controls, missions, answers
npm run test:node       #   the progress-key, id and lesson-step rules and the CSS checks on small pages;
                        #   BMAccount.merge with the game store and fields this copy has never heard
                        #   of; account sync (stale tabs, resets, failed sign-outs, newer and older
                        #   sites and tables, sign-in through another service); the game's rules
npm run test:unit       #   Vitest: the modules under src/ (src/**/*.test.ts), among them the level
                        #   curve and the HUD's view, drawn the same by the inline HUD script

npm run build           # dist/
npm run check:dist      # dist/ is the source's site, each source page taken with its shell
                        # written: same pages and nothing extra, links and font urls resolve
                        # inside it, <main> and the page around it untouched, the boot script
                        # inline, one module entry whose bundle is its kind's imports (KaTeX
                        # by its vendor module) and the HUD script after the top bar, supabase-js, Three.js and the course world each a chunk of its
                        # own that no page names, no copy of a source script, nothing from
                        # another server, CSS text and cascade the source's with the vendor CSS
                        # ahead, no secrets

npm run test:browser    # the game, the Arena, the account page (and that a signed-out page
                        # never fetches the supabase chunk), the 3D stages, the new 3D exercises
                        # and the course world (its tiers and their budgets, the watchdog, idle
                        # frames, keyboard), each driven in headless Chromium
npm run check:browser   # dist/ served: every page × theme × width (errors, theme before first
                        # paint, scripts ran, KaTeX rendered, no request to any other server,
                        # Three.js fetched only where there is 3D, the world's chunk only on the
                        # contents page, overflow, lesson mode),
                        # figures, every exercise typed back, restore of old progress, saved
                        # state from the last release, reduced motion, the frame and the reading panel
                        # (both themes, both panels, contrast, print), the HUD (no shift when the
                        # bundle loads) and the settings sheet (mouse, keys, focus, each setting
                        # kept and in effect, axe), the view transition between pages (the
                        # HUD still; skipped in Study mode and reduced motion), WebGL and its
                        # fallbacks, axe. About 8 minutes, and nothing in it needs the network

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
