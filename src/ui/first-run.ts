/* The first-run guide: five cards in a modal dialog, shown once on the first chapter page a
   learner opens, and again from "See the guide again" in the settings sheet.

     - Shows only on a chapter page (body[data-chapter]), after load, when bm.guide.v1 has no
       `seen`, and not while another dialog is open. A learner who already has progress is
       an existing learner: `seen` is written quietly and nothing shows (the same quiet first
       visit as form-unlock.ts).
     - Skip, Done and Escape all close it and write { v: 1, seen: <day key> }. A replay writes
       `replay` and keeps `seen`. The key is this device's only (store.ts), written silent.
     - Where a card names a part of the bar, that part wears data-guide-spot while the card is
       up: a ring by outline only, so no width moves (tools/suites/hud.js measures them).
     - No animation at all, so Study mode and reduced motion need nothing extra; the cards
       show in both (the guide is information) and card 4 says what is off in Study mode.
     - Installed on every page that has the settings sheet, for the replay button, which is
       added to the sheet's Comfort group here because the sheet's markup is the build's. */

/* the names are core/store.ts's STORE_KEYS; that file is types and constants only and has no
   bundle of its own, so a page-side module spells the three it reads (a test pins them) */
const KEY = { guide: "bm.guide.v1", progress: "bm.progress.v1", attempts: "bm.attempts.v1" } as const;

interface Card { title: string; body: string; calm?: string; spot?: string }

const CARDS: Card[] = [
  { title: "Read, then do.",
    body: "A chapter opens one piece at a time. Each piece ends in a question; answer it to go on, or skip it and the course brings you back." },
  { title: "Clues are free.",
    body: "Every problem has Show a clue from the start. A clue never costs anything. A wrong answer on a lesson question costs nothing either: it tells you which slip to look for." },
  { title: "Right? Compare.",
    body: "Once you are right the worked solution opens by itself. Reading it with the box in view earns a shield that absorbs your next miss." },
  { title: "The bar at the top.", spot: ".hud-level, .hud-xp, .hud-streak, .hud-hearts",
    body: "Your level, XP toward the next level, and a flame for days in a row. In a practice set you also see three hearts; a wrong answer costs one, a clue or the solution never does.",
    calm: "Your level, XP toward the next level, and a flame for days in a row. Study mode is on, so hearts and the combo are off: nothing here is lost by a wrong answer." },
  { title: "Make it yours.", spot: ".hud-menu",
    body: "Study mode removes hearts, bosses, motion and sound and keeps every hint. Reduce motion, sound and theme live in the menu (top right). Press ? for keyboard shortcuts. You can see this guide again from the menu." }
];

let dlg: HTMLDialogElement | null = null;
let step = 0;
let returnTo: HTMLElement | null = null;
let replaying = false;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function dayKey(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function readGuide(): Record<string, unknown> {
  const S = window.BMStore;
  if (!S) return {};
  const g = S.read(KEY.guide, null);
  return isObj(g) ? g : {};
}
function writeGuide(patch: Record<string, unknown>): void {
  const S = window.BMStore;
  if (!S) return;
  S.write(KEY.guide, { ...readGuide(), v: 1, ...patch }, true);
}

/** progress already: any solved exercise or any attempt on record */
function hasProgress(): boolean {
  const S = window.BMStore;
  if (!S) return false;
  const p = S.read(KEY.progress, null), a = S.read(KEY.attempts, null);
  const some = (store: unknown, f: (ch: Record<string, unknown>) => boolean): boolean =>
    isObj(store) && Object.values(store).some((ch) => isObj(ch) && f(ch));
  return some(p, (ch) => isObj(ch.solved) && Object.keys(ch.solved).length > 0) ||
    some(a, (ch) => Object.keys(ch).length > 0);
}

function calm(): boolean {
  try { return !!(window.BMGame && window.BMGame.prefs().calm); } catch { return false; }
}

function spots(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-guide-spot]"));
}
function clearSpots(): void {
  spots().forEach((el) => el.removeAttribute("data-guide-spot"));
}

function render(): void {
  if (!dlg) return;
  const card = CARDS[step];
  const last = step === CARDS.length - 1;
  const title = dlg.querySelector<HTMLElement>("#guide-sheet-title")!;
  title.textContent = card.title;
  dlg.querySelector<HTMLElement>(".guide-body")!.textContent = calm() && card.calm ? card.calm : card.body;
  dlg.querySelector<HTMLElement>(".guide-step")!.textContent = (step + 1) + " of " + CARDS.length;
  dlg.querySelector<HTMLElement>("[data-guide-back]")!.hidden = step === 0;
  dlg.querySelector<HTMLElement>("[data-guide-next]")!.hidden = last;
  dlg.querySelector<HTMLElement>("[data-guide-done]")!.hidden = !last;
  clearSpots();
  if (card.spot) {
    document.querySelectorAll<HTMLElement>(".topbar").forEach((bar) => {
      bar.querySelectorAll<HTMLElement>(card.spot!).forEach((el) => {
        if (el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden") el.setAttribute("data-guide-spot", "");
      });
    });
  }
  title.focus();
}

/** seen, or replay on top of the seen already there; never moves an earlier day */
function mark(): void {
  const g = readGuide();
  if (replaying) writeGuide({ replay: dayKey(), ...(g.seen ? {} : { seen: dayKey() }) });
  else if (!g.seen) writeGuide({ seen: dayKey() });
}

function build(): HTMLDialogElement {
  const d = document.createElement("dialog");
  d.id = "guide-sheet";
  d.className = "guide-sheet";
  d.setAttribute("aria-labelledby", "guide-sheet-title");
  const h = document.createElement("h2");
  h.id = "guide-sheet-title";
  h.className = "guide-title";
  h.setAttribute("tabindex", "-1");
  const body = document.createElement("p");
  body.className = "guide-body";
  const count = document.createElement("p");
  count.className = "guide-step";
  const row = document.createElement("div");
  row.className = "guide-actions";
  const btn = (label: string, attr: string, cls: string, on: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn " + cls;
    b.setAttribute(attr, "");
    b.textContent = label;
    b.addEventListener("click", on);
    return b;
  };
  row.append(
    btn("Skip", "data-guide-skip", "ghost", () => { mark(); d.close(); }),
    btn("Back", "data-guide-back", "ghost", () => { if (step > 0) { step--; render(); } }),
    btn("Next", "data-guide-next", "", () => { if (step < CARDS.length - 1) { step++; render(); } }),
    btn("Done", "data-guide-done", "", () => { mark(); d.close(); })
  );
  d.append(h, body, count, row);
  /* written when the reader decides (Skip, Done, Escape's cancel), not on the close event,
     which comes a task later; the close event writes it again for any other way out */
  d.addEventListener("cancel", mark);
  d.addEventListener("close", () => {
    clearSpots();
    mark();
    const back = returnTo;
    returnTo = null;
    if (back && back.isConnected) back.focus();
  });
  document.body.appendChild(d);
  return d;
}

/** show the guide from the first card; false when a dialog is already open */
export function openGuide(replay: boolean): boolean {
  if (document.querySelector("dialog[open]")) return false;
  if (!dlg) dlg = build();
  replaying = replay;
  step = 0;
  returnTo = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  dlg.showModal();
  render();
  dlg.scrollTop = 0;
  try { window.BMGame.announce("A short guide to the course. " + CARDS.length + " cards.", { priority: "high" }); } catch { /* a note */ }
  return true;
}

/** the replay button, last in the Comfort group of the settings sheet */
function addReplay(): void {
  const sheet = document.getElementById("hud-sheet");
  if (!sheet || sheet.querySelector("[data-guide-replay]")) return;
  const group = Array.from(sheet.querySelectorAll<HTMLElement>(".sheet-group")).find((g) => {
    const l = g.querySelector("legend");
    return !!l && (l.textContent || "").trim() === "Comfort";
  });
  if (!group) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn ghost small";
  b.setAttribute("data-guide-replay", "");
  b.textContent = "See the guide again";
  b.addEventListener("click", () => {
    const x = sheet.querySelector<HTMLElement>("[data-sheet-close]");
    if (x) x.click();
    openGuide(true);
  });
  group.appendChild(b);
}

function mount(): void {
  addReplay();
  if (!document.body.hasAttribute("data-chapter")) return;
  /* storage that throws cannot remember it was shown: stay quiet rather than show it on every page */
  try { window.localStorage.getItem(KEY.guide); } catch { return; }
  if (readGuide().seen) return;
  if (hasProgress()) { writeGuide({ seen: dayKey() }); return; }
  openGuide(false);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  let done = false;
  const go = () => { if (!done) { done = true; mount(); } };
  if (document.readyState === "complete") setTimeout(go, 0);
  else {
    document.addEventListener("DOMContentLoaded", go);
    window.addEventListener("load", go);
  }
}
