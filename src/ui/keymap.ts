/* The keyboard layer's rules, with no DOM: which key does what on which kind of page.

   src/ui/keys.ts is the DOM half. It reads the page (detectKind), builds a Ctx from the
   focus and the cursor, feeds each keydown to step(), and does what the Action says
   (and calls preventDefault when handled is true). This file never touches window,
   document or storage, so Vitest checks every rule in node; Chromium
   (tools/game/browser.test.js) tests the focus, scrolling and the overlay instead.

   The rules it keeps:
     - Nothing is handled with Ctrl, Meta or Alt held, while composing text, while typing
       in a box (only Escape leaves it), or during an arena run.
     - Keys that already do something in the browser (Space, Tab, Home, End, the page
       keys, left and right arrows, and the arrows on the bare page) are left alone.
     - "g" starts a two-key prefix that lapses after PREFIX_MS. */

export type Kind = "chapter" | "home" | "arena" | "progress" | "account" | "diagnostic" | "page";
export type Mode = "normal" | "insert" | "off";
export type At = "body" | "card" | "item";

export type Action =
  | { type: "move"; delta: 1 | -1 }
  | { type: "edge"; to: "first" | "last" }
  | { type: "unsolved"; delta: 1 | -1 }
  | { type: "target" }
  | { type: "enter" }
  | { type: "check" }
  | { type: "clue" }
  | { type: "solution" }
  | { type: "pick"; n: number }
  | { type: "section"; delta: 1 | -1 }
  | { type: "chapter"; delta: 1 | -1 }
  | { type: "goto"; to: "home" | "arena" | "progress" }
  | { type: "contents" }
  | { type: "settings" }
  | { type: "help" }
  | { type: "palette" }
  | { type: "leave" }
  | { type: "continue" }
  | { type: "arenaStart"; mode: "standard" | "daily" | "review" };

export interface KeyState {
  pending: "g" | null;
  since: number;
}
export const INITIAL: KeyState = { pending: null, since: 0 };
export const PREFIX_MS = 1000;

export interface KeyEvent {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}

export interface Ctx {
  kind: Kind;
  mode: Mode;
  at: At;
  answered: boolean;
  now: number;
  arenaScreen?: "lobby" | "run" | "result" | null;
}

export interface Result {
  action: Action | null;
  state: KeyState;
  handled: boolean;
}

const NONE: Result = { action: null, state: INITIAL, handled: false };
const act = (action: Action): Result => ({ action, state: INITIAL, handled: true });

export function step(state: KeyState, ev: KeyEvent, ctx: Ctx): Result {
  if (
    ctx.mode === "off" ||
    ev.ctrlKey ||
    ev.metaKey ||
    ev.altKey ||
    ev.isComposing ||
    ctx.arenaScreen === "run"
  ) {
    return NONE;
  }
  if (ctx.mode === "insert") {
    return ev.key === "Escape" ? act({ type: "leave" }) : NONE;
  }

  let pending = state.pending;
  if (pending && ctx.now - state.since > PREFIX_MS) pending = null;

  const key = ev.key;
  const { kind, at } = ctx;
  const hasItems = kind !== "diagnostic";
  if (pending === "g") {
    /* a second key completes the prefix; any other key drops it and acts on its own */
    switch (key) {
      case "g":
        return hasItems ? act({ type: "edge", to: "first" }) : NONE;
      case "h":
        return act({ type: "goto", to: "home" });
      case "a":
        return act({ type: "goto", to: "arena" });
      case "p":
        return act({ type: "goto", to: "progress" });
      case "c":
        return act({ type: "contents" });
      case "s":
        return act({ type: "settings" });
      default:
        break;
    }
  }

  /* exercise cards exist on chapter pages only */
  const card = at === "card" && kind === "chapter";

  switch (key) {
    case "g":
      return { action: null, state: { pending: "g", since: ctx.now }, handled: true };
    case "j":
      return hasItems ? act({ type: "move", delta: 1 }) : NONE;
    case "k":
      return hasItems ? act({ type: "move", delta: -1 }) : NONE;
    case "ArrowDown":
      return hasItems && at !== "body" ? act({ type: "move", delta: 1 }) : NONE;
    case "ArrowUp":
      return hasItems && at !== "body" ? act({ type: "move", delta: -1 }) : NONE;
    case "G":
      return hasItems ? act({ type: "edge", to: "last" }) : NONE;
    case "n":
      return kind === "chapter" ? act({ type: "unsolved", delta: 1 }) : NONE;
    case "N":
      return kind === "chapter" ? act({ type: "unsolved", delta: -1 }) : NONE;
    case "t":
      return kind === "chapter" ? act({ type: "target" }) : NONE;
    case "Enter":
      if (card) return act({ type: ctx.answered ? "check" : "enter" });
      if (at === "body" && kind === "chapter") return act({ type: "continue" });
      return NONE;
    case "i":
      return card ? act({ type: "enter" }) : NONE;
    case "c":
      return card ? act({ type: "check" }) : NONE;
    case "h":
      return card ? act({ type: "clue" }) : NONE;
    case "s":
      return card ? act({ type: "solution" }) : NONE;
    case "Escape":
      return at === "body" ? NONE : act({ type: "leave" });
    case "{":
      return kind === "chapter" || kind === "page" ? act({ type: "section", delta: -1 }) : NONE;
    case "}":
      return kind === "chapter" || kind === "page" ? act({ type: "section", delta: 1 }) : NONE;
    case "[":
      return act({ type: "chapter", delta: -1 });
    case "]":
      return act({ type: "chapter", delta: 1 });
    case "?":
      return act({ type: "help" });
    case "/":
      return act({ type: "palette" });
    default:
      break;
  }

  if (/^[1-9]$/.test(key)) {
    if (card) return act({ type: "pick", n: Number(key) });
    if (kind === "arena" && at === "body" && "123".includes(key)) {
      const mode = key === "1" ? "standard" : key === "2" ? "daily" : "review";
      return act({ type: "arenaStart", mode });
    }
  }
  return NONE;
}

export function detectKind(has: (selector: string) => boolean): Kind {
  if (has("body[data-chapter]")) return "chapter";
  if (has("[data-arena]")) return "arena";
  if (has("a[data-continue]")) return "home";
  if (has("[data-progress]")) return "progress";
  if (has("[data-account]")) return "account";
  if (has("#diag-intro")) return "diagnostic";
  return "page";
}

export const ITEMS: Record<Kind, string> = {
  chapter: ".ex",
  home: "a.stop-link, a.next-step-link, .stop-sections[open] .stop-rows a",
  arena: ".arena-mode, input[data-pick]",
  progress: "li.area a.area-title",
  account: "main input:not([type=hidden]), main button",
  page: "h2[id]",
  diagnostic: "",
};

/** what a cursor item is called on this kind of page */
export function nounOf(kind: Kind): string {
  return kind === "chapter" ? "Exercise" : kind === "page" ? "Section" : "Item";
}

export function cursorText(kind: Kind, i: number, n: number, label?: string): string {
  const base = `${nounOf(kind)} ${i} of ${n}`;
  return label ? `${base}: ${label}` : base;
}

export interface Binding {
  keys: string[];
  label: string;
  kinds: Kind[] | "all";
  where: At[] | "any";
  group: "Move" | "Exercise" | "Course map" | "Go" | "Help";
  /* keys the map's stage handles itself (assets/map3d.js); step() never sees them */
  stage?: true;
}

const WITH_ITEMS: Kind[] = ["chapter", "home", "arena", "progress", "account", "page"];

export const BINDINGS: Binding[] = [
  { keys: ["j", "k"], label: "Next or previous exercise", kinds: WITH_ITEMS, where: "any", group: "Move" },
  { keys: ["↓", "↑"], label: "Next or previous exercise", kinds: WITH_ITEMS, where: ["card", "item"], group: "Move" },
  { keys: ["g g", "G"], label: "First or last exercise", kinds: WITH_ITEMS, where: "any", group: "Move" },
  { keys: ["n", "N"], label: "Next or previous unsolved exercise", kinds: ["chapter"], where: "any", group: "Move" },
  { keys: ["t"], label: "The boss's next exercise, else the first unsolved", kinds: ["chapter"], where: "any", group: "Move" },
  { keys: ["{", "}"], label: "Next or previous section", kinds: ["chapter", "page"], where: "any", group: "Move" },
  { keys: ["[", "]"], label: "Next or previous chapter", kinds: "all", where: "any", group: "Move" },
  { keys: ["Enter"], label: "Continue the lesson", kinds: ["chapter"], where: ["body"], group: "Move" },
  { keys: ["Enter", "i"], label: "Type in the box, or check once answered", kinds: ["chapter"], where: ["card"], group: "Exercise" },
  { keys: ["c"], label: "Check the answer", kinds: ["chapter"], where: ["card"], group: "Exercise" },
  { keys: ["h"], label: "Show a clue", kinds: ["chapter"], where: ["card"], group: "Exercise" },
  { keys: ["s"], label: "Show or hide the solution", kinds: ["chapter"], where: ["card"], group: "Exercise" },
  { keys: ["1-9"], label: "Pick an option", kinds: ["chapter"], where: ["card"], group: "Exercise" },
  { keys: ["Esc"], label: "Leave the box, or drop the cursor", kinds: "all", where: ["card", "item"], group: "Move" },
  { keys: ["← → ↑ ↓"], label: "Previous or next chapter on the map", kinds: ["home"], where: "any", group: "Course map", stage: true },
  { keys: ["Home", "End"], label: "First or last chapter", kinds: ["home"], where: "any", group: "Course map", stage: true },
  { keys: ["Enter"], label: "Open the chapter", kinds: ["home"], where: "any", group: "Course map", stage: true },
  { keys: ["Esc"], label: "Leave the map", kinds: ["home"], where: "any", group: "Course map", stage: true },
  { keys: ["1", "2", "3"], label: "Start a Standard, Daily or Review run", kinds: ["arena"], where: ["body"], group: "Go" },
  { keys: ["g h"], label: "Home", kinds: "all", where: "any", group: "Go" },
  { keys: ["g a"], label: "Arena", kinds: "all", where: "any", group: "Go" },
  { keys: ["g p"], label: "Your progress", kinds: "all", where: "any", group: "Go" },
  { keys: ["g c"], label: "Contents", kinds: "all", where: "any", group: "Go" },
  { keys: ["g s"], label: "Settings", kinds: "all", where: "any", group: "Go" },
  { keys: ["/"], label: "Go to a section, exercise, chapter or page", kinds: "all", where: "any", group: "Go" },
  { keys: ["?"], label: "This list", kinds: "all", where: "any", group: "Help" },
];

const ORDER = ["Move", "Exercise", "Course map", "Go", "Help"] as const;

export function cheatSheet(
  kind: Kind,
): { group: string; rows: { keys: string[]; label: string }[] }[] {
  const out: { group: string; rows: { keys: string[]; label: string }[] }[] = [];
  /* the Move rows name an "exercise"; on other pages the item is a section or an item */
  const noun = nounOf(kind).toLowerCase();
  for (const group of ORDER) {
    const rows = BINDINGS.filter(
      (b) => b.group === group && (b.kinds === "all" || b.kinds.includes(kind)),
    ).map((b) => ({ keys: b.keys, label: b.label.replace("exercise", noun) }));
    if (rows.length) out.push({ group, rows });
  }
  return out;
}
