/* The keyboard layer's DOM half: src/ui/keymap.ts decides what a key does; this file reads
   the page, feeds every keydown to step() and does what the Action says with the page's own
   controls (it clicks the Check button, it never grades).

     - The cursor is the focus. A card or a heading the layer moves to gets tabindex="-1"
       and data-keys-cursor (the ring: assets/game.css); the attribute goes when the focus
       leaves it.
     - Typing in a box, a slider, a figure, a scrolling region or any open dialog is insert
       mode: only Escape is ours there, and inside a dialog not even that (the dialog's own
       close request, or settings.ts's capture handler, has it).
     - A link or button the reader tabbed to counts as an item, so Enter and Space on it
       stay native.
     - "?" opens the cheat sheet, a modal <dialog> built once from keymap.ts's rows.
     - "/" opens the go-to palette, another modal <dialog> built once: src/ui/palette.ts lists
       and ranks the targets, read from the page on each open; Enter focuses a section or a
       card (revealing a hidden lesson step through the hash) or opens a page. The cheat sheet
       and the palette are never open at once.
     - The first Tab on a page whose run store has no keysTip shows one toast pointing at
       "?", once per device (bm.run.v1.keysTip).
     - Off when the settings say keys: false (BMGame.prefs().keys).

   window.BMKeys is a console and test handle. */

import {
  INITIAL, ITEMS, cheatSheet, cursorText, detectKind, step,
  type Action, type At, type Ctx, type Kind, type KeyState, type Mode
} from "./keymap.ts";
import { labelOfExercise, rank, targetsOf, type Target } from "./palette.ts";

const ATTR = "data-keys-cursor";
/* a box that takes typing or arrow keys; a checkbox, radio or button-type input takes neither,
   so the cursor keys keep moving over them (the Arena deck, the account page); the course map's stage (assets/map3d.js) */
const INSERT = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]), textarea, select, [contenteditable=""], [contenteditable="true"], [role=slider], [role=application], svg[tabindex], [data-scrolls], [data-map3d-stage]';
/* focus the reader put on a control of the page's own: Enter and Space stay native */
const NATIVE = "a, button, summary, [role=button], label";

let kind: Kind = "page";
let state: KeyState = INITIAL;
let cursor: HTMLElement | null = null;
let sheet: HTMLDialogElement | null = null;
let pal: HTMLDialogElement | null = null;
let tipped = false;

const win = () => window as any;

function active(): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null;
  return a && a !== document.body && a !== document.documentElement ? a : null;
}

function inDialog(el: Element | null): boolean {
  return !!el && !!el.closest("dialog[open]");
}

function mode(): Mode {
  const G = win().BMGame;
  try {
    if (G && typeof G.prefs === "function" && G.prefs().keys === false) return "off";
  } catch { /* the settings unreadable: the layer stays on */ }
  const a = active();
  return a && (a.matches(INSERT) || inDialog(a)) ? "insert" : "normal";
}

/* focus inside a card (the card itself, or a clue the ladder focused) counts as the card,
   so c, h, s, Enter and Escape keep working while a clue is being read */
function at(): At {
  const a = active();
  if (!a) return "body";
  if (a.matches(".ex") || (a.closest(".ex") && !a.matches(NATIVE))) return "card";
  if (a.hasAttribute(ATTR) || a.matches(NATIVE)) return "item";
  return "body";
}

function answered(card: Element | null): boolean {
  if (!card) return false;
  if (card.querySelector(".choices input[type=radio]:checked, .choices input[type=checkbox]:checked")) return true;
  const typed = card.querySelectorAll<HTMLInputElement>(".ex-form input[type=text], input.blank");
  return Array.prototype.some.call(typed, (i: HTMLInputElement) => i.value.trim() !== "");
}

function visible(el: Element): boolean {
  return !el.closest("[hidden]") && el.getClientRects().length > 0;
}

function items(): HTMLElement[] {
  const sel = ITEMS[kind];
  if (!sel) return [];
  return Array.prototype.filter.call(document.querySelectorAll(sel), (el: HTMLElement) =>
    visible(el) && !el.hasAttribute("disabled") && el.getAttribute("aria-disabled") !== "true") as HTMLElement[];
}

function reduced(): boolean {
  const html = document.documentElement;
  return (!!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ||
    html.getAttribute("data-motion") === "reduce" || html.hasAttribute("data-calm");
}

const LENT = "data-keys-tabindex";   /* the layer lent this element its tabindex="-1" */

function drop(el: HTMLElement): void {
  el.removeAttribute(ATTR);
  /* a card or heading takes a mouse click's focus while it has a tabindex; give it back
     once the cursor leaves, so a click on a card's padding never arms h or s */
  if (el.hasAttribute(LENT)) { el.removeAttribute("tabindex"); el.removeAttribute(LENT); }
}

function setCursor(el: HTMLElement | null): void {
  if (cursor && cursor !== el) drop(cursor);
  cursor = el;
  if (el) el.setAttribute(ATTR, "");
}

function focus(el: HTMLElement): void {
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
}

function labelOf(el: HTMLElement): string {
  if (el.matches(".ex")) {
    const num = el.querySelector(".ex-num");
    return num ? (num.textContent || "").trim() : "";
  }
  if (/^H[1-6]$/.test(el.tagName)) return (el.textContent || "").trim();
  return "";
}

/** Put the cursor on el: focus, scroll (unless told not to) and say where it is. */
function moveTo(el: HTMLElement, opts?: { scroll?: boolean; quiet?: boolean }): void {
  const o = opts || {};
  const native = el.matches("a[href], button, input, select, textarea, summary, [tabindex]");
  if (!native) { el.setAttribute("tabindex", "-1"); el.setAttribute(LENT, ""); }
  focus(el);
  if (o.scroll !== false) {
    try { el.scrollIntoView({ block: el.matches(".ex") ? "center" : "nearest", behavior: reduced() ? "auto" : "smooth" }); }
    catch { el.scrollIntoView(); }
  }
  setCursor(el);
  if (o.quiet) return;
  const G = win().BMGame;
  if (!G || typeof G.announce !== "function") return;
  const list = items();
  let i = list.indexOf(el), n = list.length;
  if (i < 0 && /^H[1-6]$/.test(el.tagName)) {
    let heads = headings();
    if (heads.indexOf(el) < 0) heads = sectionHeads().map((s) => s.head);
    i = heads.indexOf(el);
    n = heads.length;
    G.announce(cursorText("page", i + 1, n, labelOf(el)), { key: "keys-cursor", priority: "low" });
    return;
  }
  if (i < 0) return;
  G.announce(cursorText(kind, i + 1, n, labelOf(el)), { key: "keys-cursor", priority: "low" });
}

const before = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING);
const after = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/** The item `delta` away from `from` in `list`, by document order when `from` is not in it;
    from nothing, the first (forward) or the last (back). */
function nextIn(list: HTMLElement[], from: HTMLElement | null, delta: 1 | -1): HTMLElement | null {
  if (!list.length) return null;
  if (!from) return delta > 0 ? list[0] : list[list.length - 1];
  const i = list.indexOf(from);
  if (i > -1) return list[Math.max(0, Math.min(list.length - 1, i + delta))];
  if (delta > 0) return list.find((el) => after(from, el)) || list[list.length - 1];
  for (let k = list.length - 1; k >= 0; k--) if (before(from, list[k])) return list[k];
  return list[0];
}

function headings(): HTMLElement[] {
  return Array.prototype.filter.call(document.querySelectorAll("main h2[id]"), visible) as HTMLElement[];
}

function topLine(): number {
  const bar = document.querySelector(".topbar");
  return bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
}

function section(delta: 1 | -1): void {
  const heads = headings();
  if (!heads.length) return;
  const i = cursor ? heads.indexOf(cursor) : -1;
  let to: HTMLElement | undefined;
  if (i > -1) to = heads[i + delta];
  else {
    const ref = cursor ? cursor.getBoundingClientRect().top : topLine();
    if (delta > 0) to = heads.find((h) => h.getBoundingClientRect().top > ref + 1);
    else for (let k = heads.length - 1; k >= 0 && !to; k--) if (heads[k].getBoundingClientRect().top < ref - 1) to = heads[k];
  }
  if (to) moveTo(to);
}

function click(sel: string, root?: ParentNode | null): boolean {
  const el = (root || document).querySelector(sel) as HTMLElement | null;
  if (!el || el.hidden || el.closest("[hidden]") || (el as HTMLButtonElement).disabled) return false;
  el.click();
  return true;
}

function card(): HTMLElement | null {
  const a = active();
  return a ? (a.closest(".ex") as HTMLElement | null) : null;
}

function enter(ex: HTMLElement): void {
  const k = ex.getAttribute("data-kind");
  const sel = k === "choice" || k === "multi" ? ".choices input"
    : k === "order" ? ".order-move"
    : k === "figure" ? "svg[tabindex], [role=application]"
    : ".ex-form input[type=text], input.blank";
  const el = ex.querySelector(sel) as HTMLElement | null;
  if (el) focus(el);
}

function leave(): void {
  const a = active();
  if (a && !a.matches(".ex")) {
    /* from anything inside a card (a box, a clue, the order card's move buttons), back to
       the card; from the card itself, to the page */
    const ex = a.closest(".ex") as HTMLElement | null;
    if (ex) { moveTo(ex, { scroll: false, quiet: true }); return; }
    /* a link or button the reader tabbed to keeps the focus: nothing to leave */
    if (!a.hasAttribute(ATTR) && a.matches(NATIVE)) return;
  }
  setCursor(null);
  if (a) a.blur();
}

function perform(action: Action): void {
  const ex = card();
  switch (action.type) {
    case "move": {
      const to = nextIn(items(), ex || (active() && at() !== "body" ? active() : null), action.delta);
      if (to) moveTo(to);
      return;
    }
    case "edge": {
      const list = items();
      const to = action.to === "first" ? list[0] : list[list.length - 1];
      if (to) moveTo(to);
      return;
    }
    case "unsolved": {
      const list = items().filter((el) => el.matches(".ex") && el.getAttribute("data-state") !== "correct");
      const from = ex || (active() && at() !== "body" ? active() : null);
      let to: HTMLElement | null | undefined;
      if (!from) to = action.delta > 0 ? list[0] : list[list.length - 1];
      else if (action.delta > 0) to = list.find((el) => after(from, el));
      else for (let k = list.length - 1; k >= 0 && !to; k--) if (before(from, list[k])) to = list[k];
      if (to) moveTo(to);
      return;
    }
    case "target": {
      /* the boss's target may sit in a lesson step not shown yet: reach it as the palette does */
      const list = Array.prototype.filter.call(document.querySelectorAll(".ex[id]"), (el: HTMLElement) => reachable(el)) as HTMLElement[];
      const to = list.find((el) => el.getAttribute("data-target") === "true") ||
        list.find((el) => el.getAttribute("data-state") !== "correct");
      if (to) goToId(to.id);
      return;
    }
    case "enter": if (ex) enter(ex); return;
    case "check": if (ex) click(".ex-form > button.btn:not(.ghost)", ex); return;
    case "clue": if (ex) click(".ex-clue-btn", ex); return;
    case "solution": if (ex) click(".ex-show", ex); return;
    case "pick": {
      if (!ex) return;
      const opt = ex.querySelectorAll<HTMLInputElement>(".choices input")[action.n - 1];
      if (opt && !opt.disabled) opt.click();
      return;
    }
    case "continue": click(".lesson-next .btn"); return;
    case "section": section(action.delta); return;
    case "chapter": {
      /* the page's own link, followed even while it sits in a lesson step not shown yet */
      const link = document.querySelector<HTMLAnchorElement>(action.delta > 0 ? "[data-chapter-nav] a.next" : "[data-chapter-nav] a.prev");
      if (link && link.href) location.href = link.href;
      return;
    }
    case "goto": {
      const page = action.to === "home" ? "index.html" : action.to === "arena" ? "arena.html" : "progress.html";
      click('#hud-sheet .hud-links a[href$="' + page + '"]');
      return;
    }
    case "contents":
      if (!click(".sidebar-toggle")) click('#hud-sheet .hud-links a[href$="index.html"]');
      return;
    case "settings": click(".hud-menu"); return;
    case "arenaStart": click('.arena-mode[data-mode="' + action.mode + '"]'); return;
    case "help": open(); return;
    case "palette": palOpen(); return;
    case "leave": leave(); return;
  }
}

/* ------------------------------------------------------- the cheat sheet --- */

let returnTo: HTMLElement | null = null;
let returnCursor = false;

function build(): HTMLDialogElement {
  const d = document.createElement("dialog");
  d.id = "keys-sheet";
  d.className = "keys-sheet";
  d.setAttribute("aria-labelledby", "keys-sheet-title");
  const h = document.createElement("h2");
  h.id = "keys-sheet-title";
  /* the focus starts on the title: showModal() alone would focus Close, at the bottom */
  h.setAttribute("tabindex", "-1");
  h.textContent = "Keyboard shortcuts";
  d.appendChild(h);
  cheatSheet(kind).forEach((g) => {
    const h3 = document.createElement("h3");
    h3.textContent = g.group;
    d.appendChild(h3);
    const dl = document.createElement("dl");
    g.rows.forEach((row) => {
      const dt = document.createElement("dt");
      row.keys.forEach((k, i) => {
        if (i) dt.appendChild(document.createTextNode(" "));
        const kbd = document.createElement("kbd");
        kbd.textContent = k;
        dt.appendChild(kbd);
      });
      const dd = document.createElement("dd");
      dd.textContent = row.label;
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    d.appendChild(dl);
  });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn ghost";
  close.setAttribute("data-keys-close", "");
  close.textContent = "Close";
  close.addEventListener("click", () => d.close());
  d.appendChild(close);
  d.addEventListener("close", restore);
  document.body.appendChild(d);
  return d;
}

/* the focus goes back where it was when the cheat sheet or the palette closes, unless the
   other one has just opened in its place (it keeps the same place to go back to) */
function restore(): void {
  if ((sheet && sheet.open) || (pal && pal.open)) return;
  const back = returnTo, wasCursor = returnCursor;
  returnTo = null;
  returnCursor = false;
  if (!back || !back.isConnected) return;
  if (wasCursor) moveTo(back, { scroll: false, quiet: true });
  else focus(back);
}

/** before a keys dialog opens: remember the focus, unless the other dialog holds it */
function remember(): void {
  if (pal && pal.open) return;
  if (sheet && sheet.open) return;
  returnTo = active();
  returnCursor = !!returnTo && returnTo === cursor;
}

function open(): void {
  if (!sheet) sheet = build();
  if (sheet.open) return;
  remember();
  sheet.showModal();
  if (pal && pal.open) pal.close();
  const title = sheet.querySelector<HTMLElement>("#keys-sheet-title");
  if (title) focus(title);
  sheet.scrollTop = 0;
}

function close(): void {
  if (sheet && sheet.open) sheet.close();
}

/* ----------------------------------------------------- the go-to palette --- */

let palInput: HTMLInputElement | null = null;
let palList: HTMLUListElement | null = null;
let palEmpty: HTMLElement | null = null;
let palShown: Target[] = [];
let palAt = 0;
let palTargets: Target[] = [];

/* shown, or hidden only by a lesson step not shown yet (lesson.js hides main's children
   one step at a time and shows the steps up to a hash target) */
function reachable(el: HTMLElement): boolean {
  if (visible(el)) return true;
  const main = document.querySelector("main");
  if (!main || document.body.getAttribute("data-lesson") !== "steps") return false;
  const hid = el.closest("[hidden]");
  return !!hid && hid.parentElement === main && !main.closest("[hidden]");
}

/* the chapter's sections: every reachable h2 in main with an id, or inside an element of
   main with one (the Practice head sits in a section#practice) */
function sectionHeads(): { id: string; head: HTMLElement }[] {
  const main = document.querySelector("main");
  if (!main) return [];
  const out: { id: string; head: HTMLElement }[] = [];
  Array.prototype.forEach.call(main.querySelectorAll("h2"), (h: HTMLElement) => {
    if (!reachable(h)) return;
    let id = h.id;
    if (!id) {
      const owner = h.parentElement ? h.parentElement.closest("[id]") : null;
      if (owner && main.contains(owner) && owner !== main && owner.querySelector("h2") === h) id = owner.id;
    }
    if (id && !out.some((s) => s.id === id)) out.push({ id, head: h });
  });
  return out;
}

function palRead(): Target[] {
  const exercises: { id: string; label: string }[] = [];
  Array.prototype.forEach.call(document.querySelectorAll(".ex[id]"), (el: HTMLElement) => {
    if (!reachable(el)) return;
    const num = el.querySelector(".ex-num");
    exercises.push({ id: el.id, label: labelOfExercise(num ? num.textContent || "" : "", el.getAttribute("data-key") || el.id) });
  });
  const S = win().BMSite;
  let root = "";
  try { root = S && typeof S.rootPrefix === "function" ? String(S.rootPrefix() || "") : ""; } catch { root = ""; }
  return targetsOf({
    kind,
    curriculum: win().BM_CURRICULUM || null,
    chapterId: document.body.getAttribute("data-chapter"),
    sections: sectionHeads().map((s) => ({ id: s.id, title: (s.head.textContent || "").replace(/\s+/g, " ").trim() })),
    exercises,
    root
  });
}

function palSelect(i: number): void {
  if (!palList || !palInput) return;
  const n = palShown.length;
  palAt = n ? ((i % n) + n) % n : 0;
  const opts = palList.children;
  for (let k = 0; k < opts.length; k++) {
    const li = opts[k] as HTMLElement;
    const on = k === palAt;
    li.setAttribute("aria-selected", on ? "true" : "false");
    if (on) li.setAttribute("data-selected", "");
    else li.removeAttribute("data-selected");
  }
  if (n) {
    palInput.setAttribute("aria-activedescendant", "keys-palette-opt-" + palAt);
    const li = opts[palAt] as HTMLElement;
    try { li.scrollIntoView({ block: "nearest" }); } catch { /* no layout: nothing to scroll */ }
  } else palInput.removeAttribute("aria-activedescendant");
}

function palRender(): void {
  if (!palList || !palInput || !palEmpty) return;
  palShown = rank(palInput.value, palTargets, 12);
  while (palList.firstChild) palList.removeChild(palList.firstChild);
  palShown.forEach((t, i) => {
    const li = document.createElement("li");
    li.id = "keys-palette-opt-" + i;
    li.setAttribute("role", "option");
    const label = document.createElement("span");
    label.textContent = t.label;
    li.appendChild(label);
    if (t.hint) {
      li.appendChild(document.createTextNode(" "));
      const small = document.createElement("small");
      small.textContent = t.hint;
      li.appendChild(small);
    }
    palList!.appendChild(li);
  });
  palEmpty.hidden = palShown.length > 0;
  palList.hidden = palShown.length === 0;
  palInput.setAttribute("aria-expanded", palShown.length > 0 ? "true" : "false");
  palSelect(0);
}

/* focus an element of this page the palette picked: a card, or a heading (a section's id
   names its head) */
function palLand(id: string): void {
  let el = document.getElementById(id);
  if (!el) return;
  if (!el.matches(".ex") && !/^H[1-6]$/.test(el.tagName)) el = (el.querySelector("h2") as HTMLElement | null) || el;
  if (visible(el)) moveTo(el);
}

/** Move the cursor to the element with this id, revealing the lesson step it sits in first
    (lesson.js shows the steps up to a hash target). */
function goToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (visible(el)) { palLand(id); return; }
  let done = false;
  const land = () => {
    if (done) return;
    done = true;
    window.removeEventListener("hashchange", land);
    palLand(id);
  };
  window.addEventListener("hashchange", land);
  setTimeout(land, 300);
  try {
    if (location.hash === "#" + id) history.replaceState(history.state, "", location.pathname + location.search);
  } catch { /* no history: the hash still changes below when it differs */ }
  location.hash = "#" + id;
}

function palGo(i: number): void {
  const t = palShown[i];
  if (!t || !pal) return;
  if (t.id) {
    returnTo = null;
    returnCursor = false;
    pal.close();
    goToId(t.id);
    return;
  }
  if (t.href) {
    returnTo = null;
    returnCursor = false;
    pal.close();
    location.href = t.href;
  }
}

function palKey(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  switch (e.key) {
    case "ArrowDown": e.preventDefault(); palSelect(palAt + 1); return;
    case "ArrowUp": e.preventDefault(); palSelect(palAt - 1); return;
    case "Tab": {
      /* the box and Close are the two tab stops; the arrows move over the options */
      const close = palInput && palInput.closest("dialog") ? (palInput.closest("dialog") as HTMLElement).querySelector("[data-keys-close]") as HTMLElement | null : null;
      if (!close) { e.preventDefault(); return; }
      e.preventDefault();
      if (e.target === palInput) close.focus(); else palInput && palInput.focus();
      return;
    }
    case "Home": e.preventDefault(); palSelect(0); return;
    case "End": e.preventDefault(); palSelect(palShown.length - 1); return;
    case "Enter": e.preventDefault(); palGo(palAt); return;
    /* a search box spends its first Escape clearing itself; here Escape always closes */
    case "Escape": e.preventDefault(); palClose(); return;
    default: return;
  }
}

function palBuild(): HTMLDialogElement {
  const d = document.createElement("dialog");
  d.id = "keys-palette";
  d.className = "keys-sheet keys-palette";
  d.setAttribute("aria-labelledby", "keys-palette-title");
  const h = document.createElement("h2");
  h.id = "keys-palette-title";
  h.textContent = "Go to";
  d.appendChild(h);
  const input = document.createElement("input");
  input.type = "search";
  input.setAttribute("aria-label", "Go to");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", "keys-palette-list");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");
  input.addEventListener("input", palRender);
  input.addEventListener("keydown", palKey);
  d.appendChild(input);
  const list = document.createElement("ul");
  list.id = "keys-palette-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Places to go");
  list.addEventListener("click", (e) => {
    const li = e.target instanceof Element ? e.target.closest("li[role=option]") : null;
    if (!li || !list.contains(li)) return;
    palGo(Array.prototype.indexOf.call(list.children, li));
  });
  /* a press on an option keeps the focus in the box */
  list.addEventListener("mousedown", (e) => e.preventDefault());
  d.appendChild(list);
  const empty = document.createElement("p");
  empty.className = "keys-palette-empty";
  empty.setAttribute("role", "status");
  empty.textContent = "Nothing matches";
  empty.hidden = true;
  d.appendChild(empty);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn ghost";
  close.setAttribute("data-keys-close", "");
  close.textContent = "Close";
  close.addEventListener("click", () => d.close());
  close.addEventListener("keydown", (e) => {
    if (e.key === "Tab") { e.preventDefault(); input.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); d.close(); }
  });
  d.appendChild(close);
  d.addEventListener("close", restore);
  document.body.appendChild(d);
  palInput = input;
  palList = list;
  palEmpty = empty;
  return d;
}

function palOpen(): void {
  if (!pal) pal = palBuild();
  if (pal.open) return;
  remember();
  palTargets = palRead();
  palInput!.value = "";
  palRender();
  pal.showModal();
  if (sheet && sheet.open) sheet.close();
  focus(palInput!);
  pal.scrollTop = 0;
}

function palClose(): void {
  if (pal && pal.open) pal.close();
}

/* ---------------------------------------------------------------- keys --- */

function tip(): void {
  if (tipped) return;
  tipped = true;
  const G = win().BMGame, S = win().BMStore;
  if (!G || typeof G.updateRun !== "function" || typeof win().BMToast !== "function") return;
  let run: any = null;
  try { run = S ? S.read(S.keys.run, {}) : null; } catch { run = null; }
  if (run && run.keysTip) return;
  win().BMToast("Press <kbd>?</kbd> for keyboard shortcuts");
  G.updateRun((r: Record<string, unknown>) => { r.keysTip = 1; });
}

function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented) return;
  const m = mode();
  const a = active();
  if (e.key === "Tab") {
    if (m !== "off" && kind === "chapter" && !inDialog(a)) tip();
    return;
  }
  /* an open dialog keeps its keys, Escape included (its close request) */
  if (inDialog(a)) return;
  const where = at();
  /* Enter on a control the reader reached is the control's */
  if (e.key === "Enter" && a && where !== "card" && !a.hasAttribute(ATTR) && a.matches(NATIVE + ", input, select, textarea")) return;
  const ctx: Ctx = {
    kind, mode: m, at: where, answered: where === "card" ? answered(a) : false, now: Date.now(),
    arenaScreen: (document.body.getAttribute("data-arena-screen") as Ctx["arenaScreen"]) || null
  };
  const r = step(state, e, ctx);
  state = r.state;
  if (!r.handled) return;
  e.preventDefault();
  if (r.action) perform(r.action);
}

export const api = {
  get kind() { return kind; },
  mode, at,
  cursor: (): Element | null => cursor,
  items: (): Element[] => items(),
  open, close,
  palette: {
    open: palOpen,
    close: palClose,
    query: (q: string): Target[] => rank(q, palRead(), 12)
  },
  pointerAt: 0,
  get sheet() { return cheatSheet(kind); }
};

function mount(): void {
  kind = detectKind((sel) => !!document.querySelector(sel));
  document.addEventListener("keydown", onKey);
  document.addEventListener("focusout", (e) => {
    /* the window losing focus (another window, devtools) keeps the cursor for the return */
    if (!document.hasFocus()) return;
    const t = e.target as HTMLElement | null;
    if (t && t === cursor) { drop(t); cursor = null; }
  });
  document.addEventListener("pointerdown", () => { api.pointerAt = Date.now(); }, { passive: true, capture: true });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  win().BMKeys = api;
  /* after the rest of the page's modules (site.js, game.js, lesson.js) have run */
  let done = false;
  const go = () => { if (!done) { done = true; mount(); } };
  if (document.readyState === "complete") setTimeout(go, 0);
  else {
    document.addEventListener("DOMContentLoaded", go);
    window.addEventListener("load", go);
  }
}
