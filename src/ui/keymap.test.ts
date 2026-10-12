import { describe, expect, it } from "vitest";
import {
  BINDINGS,
  INITIAL,
  PREFIX_MS,
  cheatSheet,
  cursorText,
  detectKind,
  step,
  type At,
  type Ctx,
  type Kind,
  type KeyEvent,
  type KeyState,
} from "./keymap.ts";

/* the rules that need no DOM; the focus, scrolling and overlay are held to in Chromium by
   tools/game/browser.test.js */
const KINDS: Kind[] = ["chapter", "home", "arena", "progress", "account", "diagnostic", "page"];

const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  kind: "chapter",
  mode: "normal",
  at: "body",
  answered: false,
  now: 1000,
  ...over,
});
const press = (key: string, c: Partial<Ctx> = {}, ev: Partial<KeyEvent> = {}, st: KeyState = INITIAL) =>
  step(st, { key, ...ev }, ctx(c));

describe("detectKind", () => {
  const only = (sel: string) => (s: string) => s === sel;
  it("maps each marker to its kind", () => {
    expect(detectKind(only("body[data-chapter]"))).toBe("chapter");
    expect(detectKind(only("[data-arena]"))).toBe("arena");
    expect(detectKind(only("a[data-continue]"))).toBe("home");
    expect(detectKind(only("[data-progress]"))).toBe("progress");
    expect(detectKind(only("[data-account]"))).toBe("account");
    expect(detectKind(only("#diag-intro"))).toBe("diagnostic");
  });
  it("falls back to page when nothing matches", () => {
    expect(detectKind(() => false)).toBe("page");
  });
  it("lets the chapter marker win over the others", () => {
    expect(detectKind(() => true)).toBe("chapter");
  });
});

describe("step: guards", () => {
  it("never handles a key with a modifier held", () => {
    for (const m of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(press("j", {}, { [m]: true }).handled).toBe(false);
    }
  });
  it("ignores keys while composing", () => {
    expect(press("j", {}, { isComposing: true }).handled).toBe(false);
  });
  it("handles nothing in off mode", () => {
    for (const k of ["j", "g", "?", "Escape"]) expect(press(k, { mode: "off" }).handled).toBe(false);
  });
  it("handles nothing during an arena run", () => {
    for (const k of ["j", "1", "?", "Escape"]) {
      expect(press(k, { kind: "arena", arenaScreen: "run" }).handled).toBe(false);
    }
  });
  it("in insert mode only Escape leaves", () => {
    expect(press("Escape", { mode: "insert", at: "card" })).toEqual({
      action: { type: "leave" },
      state: INITIAL,
      handled: true,
    });
    for (const k of ["j", "g", "?", "Enter", "1"]) {
      expect(press(k, { mode: "insert", at: "card" }).handled).toBe(false);
    }
  });
});

describe("step: the g prefix", () => {
  it("g alone starts a prefix", () => {
    const r = press("g");
    expect(r).toEqual({ action: null, state: { pending: "g", since: 1000 }, handled: true });
  });
  it("g then g within the window goes to the first item", () => {
    const st = press("g").state;
    const r = step(st, { key: "g" }, ctx({ now: 1000 + PREFIX_MS }));
    expect(r.action).toEqual({ type: "edge", to: "first" });
    expect(r.state).toEqual(INITIAL);
  });
  it("drops a stale prefix and starts a new one", () => {
    const st = press("g").state;
    const r = step(st, { key: "g" }, ctx({ now: 1000 + PREFIX_MS + 1 }));
    expect(r.action).toBeNull();
    expect(r.state).toEqual({ pending: "g", since: 1000 + PREFIX_MS + 1 });
    expect(r.handled).toBe(true);
  });
  it("clears the prefix on an unknown second key", () => {
    const r = step({ pending: "g", since: 1000 }, { key: "x" }, ctx());
    expect(r).toEqual({ action: null, state: INITIAL, handled: false });
  });
  it("a stale prefix is dropped and the key then acts on its own", () => {
    const r = step({ pending: "g", since: 0 }, { key: "j" }, ctx({ now: PREFIX_MS + 1 }));
    expect(r.action).toEqual({ type: "move", delta: 1 });
    expect(r.state).toEqual(INITIAL);
  });
  it("g then Escape at a card still leaves it, and g then j moves", () => {
    const esc = step({ pending: "g", since: 1000 }, { key: "Escape" }, ctx({ at: "card" }));
    expect(esc.action).toEqual({ type: "leave" });
    const j = step({ pending: "g", since: 1000 }, { key: "j" }, ctx());
    expect(j.action).toEqual({ type: "move", delta: 1 });
    expect(j.state).toEqual(INITIAL);
  });
  it("g g does nothing on the diagnostic page, which has no items", () => {
    const r = step({ pending: "g", since: 1000 }, { key: "g" }, ctx({ kind: "diagnostic" }));
    expect(r).toEqual({ action: null, state: INITIAL, handled: false });
  });
  it("a guard clears a pending prefix", () => {
    const st: KeyState = { pending: "g", since: 1000 };
    expect(step(st, { key: "g", ctrlKey: true }, ctx()).state).toEqual(INITIAL);
    expect(step(st, { key: "g" }, ctx({ mode: "insert" })).state).toEqual(INITIAL);
    expect(step(st, { key: "g" }, ctx({ mode: "off" })).state).toEqual(INITIAL);
    expect(step(st, { key: "g" }, ctx({ kind: "arena", arenaScreen: "run" })).state).toEqual(INITIAL);
  });
  it("go-to keys work on every kind", () => {
    const want: Record<string, unknown> = {
      h: { type: "goto", to: "home" },
      a: { type: "goto", to: "arena" },
      p: { type: "goto", to: "progress" },
      c: { type: "contents" },
      s: { type: "settings" },
    };
    for (const kind of KINDS) {
      for (const [k, a] of Object.entries(want)) {
        const r = step({ pending: "g", since: 1000 }, { key: k }, ctx({ kind }));
        expect(r.action).toEqual(a);
        expect(r.handled).toBe(true);
        expect(r.state).toEqual(INITIAL);
      }
    }
  });
});

describe("step: moving", () => {
  it("G goes to the last item", () => {
    expect(press("G").action).toEqual({ type: "edge", to: "last" });
  });
  it("j and k move on every kind but diagnostic", () => {
    for (const kind of KINDS) {
      const j = press("j", { kind });
      const k = press("k", { kind });
      if (kind === "diagnostic") {
        expect(j.handled).toBe(false);
        expect(k.handled).toBe(false);
      } else {
        expect(j.action).toEqual({ type: "move", delta: 1 });
        expect(k.action).toEqual({ type: "move", delta: -1 });
      }
    }
  });
  it("arrows move only when the cursor is on something", () => {
    for (const at of ["card", "item"] as At[]) {
      expect(press("ArrowDown", { at }).action).toEqual({ type: "move", delta: 1 });
      expect(press("ArrowUp", { at }).action).toEqual({ type: "move", delta: -1 });
    }
    expect(press("ArrowDown", { at: "body" }).handled).toBe(false);
    expect(press("ArrowUp", { at: "body" }).handled).toBe(false);
  });
  it("n and N find unsolved exercises on a chapter only", () => {
    expect(press("n").action).toEqual({ type: "unsolved", delta: 1 });
    expect(press("N").action).toEqual({ type: "unsolved", delta: -1 });
    for (const kind of KINDS.filter((k) => k !== "chapter")) {
      expect(press("n", { kind }).handled).toBe(false);
      expect(press("N", { kind }).handled).toBe(false);
    }
  });
  it("braces change section on chapter and page only", () => {
    for (const kind of KINDS) {
      const on = kind === "chapter" || kind === "page";
      expect(press("{", { kind }).handled).toBe(on);
      expect(press("}", { kind }).handled).toBe(on);
    }
    expect(press("}").action).toEqual({ type: "section", delta: 1 });
    expect(press("{").action).toEqual({ type: "section", delta: -1 });
  });
  it("square brackets change chapter on every kind", () => {
    for (const kind of KINDS) {
      expect(press("[", { kind }).action).toEqual({ type: "chapter", delta: -1 });
      expect(press("]", { kind }).action).toEqual({ type: "chapter", delta: 1 });
    }
  });
});

describe("step: exercises", () => {
  it("Enter at a card checks once answered, else enters the box", () => {
    expect(press("Enter", { at: "card", answered: true }).action).toEqual({ type: "check" });
    expect(press("Enter", { at: "card", answered: false }).action).toEqual({ type: "enter" });
  });
  it("Enter at the body of a chapter continues the lesson", () => {
    expect(press("Enter", { at: "body" }).action).toEqual({ type: "continue" });
    expect(press("Enter", { at: "body", kind: "page" }).handled).toBe(false);
  });
  it("Enter at an item is left to the browser", () => {
    expect(press("Enter", { at: "item" }).handled).toBe(false);
  });
  it("i enters the box at a card only", () => {
    expect(press("i", { at: "card" }).action).toEqual({ type: "enter" });
    expect(press("i", { at: "body" }).handled).toBe(false);
  });
  it("digits pick an option at a card only", () => {
    for (let n = 1; n <= 9; n++) {
      expect(press(String(n), { at: "card" }).action).toEqual({ type: "pick", n });
      expect(press(String(n), { at: "body" }).handled).toBe(false);
      expect(press(String(n), { at: "item" }).handled).toBe(false);
    }
  });
  it("c, h and s act at a card only", () => {
    expect(press("c", { at: "card" }).action).toEqual({ type: "check" });
    expect(press("h", { at: "card" }).action).toEqual({ type: "clue" });
    expect(press("s", { at: "card" }).action).toEqual({ type: "solution" });
    for (const at of ["body", "item"] as At[]) {
      for (const k of ["c", "h", "s"]) expect(press(k, { at }).handled).toBe(false);
    }
  });
  it("Escape leaves from a card or item, not from the body", () => {
    expect(press("Escape", { at: "card" }).action).toEqual({ type: "leave" });
    expect(press("Escape", { at: "item" }).action).toEqual({ type: "leave" });
    expect(press("Escape", { at: "body" }).handled).toBe(false);
  });
});

describe("step: arena", () => {
  it("1, 2 and 3 start a run from the lobby body", () => {
    expect(press("1", { kind: "arena" }).action).toEqual({ type: "arenaStart", mode: "standard" });
    expect(press("2", { kind: "arena" }).action).toEqual({ type: "arenaStart", mode: "daily" });
    expect(press("3", { kind: "arena" }).action).toEqual({ type: "arenaStart", mode: "review" });
    expect(press("4", { kind: "arena" }).handled).toBe(false);
  });
  it("still allows them on the result screen", () => {
    expect(press("1", { kind: "arena", arenaScreen: "result" }).action).toEqual({
      type: "arenaStart",
      mode: "standard",
    });
  });
  it("does not start runs from other kinds or from an item", () => {
    expect(press("1", { kind: "home" }).handled).toBe(false);
    expect(press("1", { kind: "arena", at: "item" }).handled).toBe(false);
  });
});

describe("step: help and the keys left to the browser", () => {
  it("? opens help on every kind", () => {
    for (const kind of KINDS) expect(press("?", { kind }).action).toEqual({ type: "help" });
  });
  it("leaves the browser's own keys alone on every kind", () => {
    const keys = ["'", ",", " ", "Tab", "Home", "End", "PageUp", "PageDown", "ArrowLeft", "ArrowRight"];
    for (const kind of KINDS) {
      for (const at of ["body", "card", "item"] as At[]) {
        for (const k of keys) expect(press(k, { kind, at }).handled).toBe(false);
      }
    }
  });
});

describe("step: the go-to palette", () => {
  it("/ opens the palette on every kind and place", () => {
    for (const kind of KINDS) {
      for (const at of ["body", "card", "item"] as At[]) {
        expect(press("/", { kind, at }).action).toEqual({ type: "palette" });
      }
    }
  });
  it("/ does nothing in insert mode or during an Arena run", () => {
    expect(press("/", { mode: "insert" }).handled).toBe(false);
    expect(press("/", { kind: "arena", arenaScreen: "run" }).handled).toBe(false);
  });
});

describe("BINDINGS", () => {
  it("gives every row a label and keys", () => {
    for (const b of BINDINGS) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.keys.length).toBeGreaterThan(0);
    }
  });
  it("never binds the same key twice for one kind and place", () => {
    const places = (w: At[] | "any"): At[] => (w === "any" ? ["body", "card", "item"] : w);
    for (const kind of KINDS) {
      const seen = new Map<string, true>();
      for (const b of BINDINGS) {
        if (b.kinds !== "all" && !b.kinds.includes(kind)) continue;
        for (const key of b.keys) {
          for (const at of places(b.where)) {
            const id = `${key}|${at}`;
            expect(seen.has(id), `${kind} ${id}`).toBe(false);
            seen.set(id, true);
          }
        }
      }
    }
  });
  it("never binds keys the browser needs", () => {
    const banned = new Set(["Space", "Tab", "Home", "End", "PageUp", "PageDown"]);
    for (const b of BINDINGS) {
      for (const key of b.keys) {
        expect(banned.has(key)).toBe(false);
        if (key === "↓" || key === "↑") {
          expect(b.where === "any" || b.where.includes("body")).toBe(false);
        }
      }
    }
  });
  it("shows the Exercise group on a chapter and not on a page", () => {
    expect(cheatSheet("chapter").map((g) => g.group)).toContain("Exercise");
    expect(cheatSheet("page").map((g) => g.group)).not.toContain("Exercise");
  });
  it("puts every row in at least one kind's sheet", () => {
    for (const b of BINDINGS) {
      const found = KINDS.some((k) =>
        cheatSheet(k).some((g) => g.rows.some((r) => r.keys === b.keys && r.label === b.label)),
      );
      expect(found, b.label).toBe(true);
    }
  });
  it("names the item after the page: exercises on a chapter, sections on a page, items elsewhere", () => {
    const first = (kind: Kind) => cheatSheet(kind)[0].rows[0].label;
    expect(first("chapter")).toBe("Next or previous exercise");
    expect(first("page")).toBe("Next or previous section");
    expect(first("home")).toBe("Next or previous item");
    expect(first("arena")).toBe("Next or previous item");
  });
  it("orders the groups Move, Exercise, Go, Help", () => {
    expect(cheatSheet("chapter").map((g) => g.group)).toEqual(["Move", "Exercise", "Go", "Help"]);
    for (const kind of KINDS) {
      const order = cheatSheet(kind).map((g) => g.group);
      const rank = order.map((g) => ["Move", "Exercise", "Go", "Help"].indexOf(g));
      expect(rank).toEqual([...rank].sort((a, b) => a - b));
    }
  });
});

describe("BINDINGS against step", () => {
  /* every row's keys must fire step() for every kind and place the row claims, and
     a chapter-only or card-only row must not fire elsewhere; this is what keeps the
     cheat sheet honest */
  const ATS: At[] = ["body", "card", "item"];
  const keyOf = (shown: string): KeyEvent[] => {
    if (shown === "g g") return [{ key: "g" }, { key: "g" }];
    if (shown.startsWith("g ")) return [{ key: "g" }, { key: shown.slice(2) }];
    if (shown === "↓") return [{ key: "ArrowDown" }];
    if (shown === "↑") return [{ key: "ArrowUp" }];
    if (shown === "Esc") return [{ key: "Escape" }];
    if (shown === "1-9") return [{ key: "5" }];
    return [{ key: shown }];
  };
  const fires = (shown: string, kind: Kind, at: At): boolean => {
    let st: KeyState = INITIAL;
    let r = { action: null as unknown, state: st, handled: false };
    for (const ev of keyOf(shown)) {
      r = step(st, ev, ctx({ kind, at, now: 1000 }));
      st = r.state;
    }
    return r.handled && r.action !== null;
  };
  it("fires where the row says it does", () => {
    for (const b of BINDINGS) {
      const kinds = b.kinds === "all" ? KINDS : b.kinds;
      const ats = b.where === "any" ? ATS : b.where;
      for (const kind of kinds) for (const at of ats) for (const k of b.keys) {
        expect(fires(k, kind, at), `${k} on ${kind} at ${at}`).toBe(true);
      }
    }
  });
  it("stays quiet where the row says it does not", () => {
    for (const b of BINDINGS) {
      if (b.kinds === "all" && b.where === "any") continue;
      const kinds = b.kinds === "all" ? KINDS : b.kinds;
      const ats = b.where === "any" ? ATS : b.where;
      for (const kind of KINDS) for (const at of ATS) {
        if (kinds.includes(kind) && ats.includes(at)) continue;
        for (const k of b.keys) {
          /* a key may be claimed by another row for this kind and place */
          const covers = (shown: string) => shown === k || (shown === "1-9" && /^[1-9]$/.test(k));
          const other = BINDINGS.some((o) => o !== b && o.keys.some(covers) &&
            (o.kinds === "all" || o.kinds.includes(kind)) && (o.where === "any" || o.where.includes(at)));
          if (other) continue;
          expect(fires(k, kind, at), `${k} on ${kind} at ${at}`).toBe(false);
        }
      }
    }
  });
});

describe("cursorText", () => {
  it("words each kind", () => {
    expect(cursorText("chapter", 3, 14)).toBe("Exercise 3 of 14");
    expect(cursorText("page", 2, 7)).toBe("Section 2 of 7");
    expect(cursorText("arena", 1, 4)).toBe("Item 1 of 4");
    expect(cursorText("home", 1, 4)).toBe("Item 1 of 4");
  });
  it("adds the label when given", () => {
    expect(cursorText("chapter", 3, 14, "Fractions")).toBe("Exercise 3 of 14: Fractions");
    expect(cursorText("page", 2, 7, "Rules")).toBe("Section 2 of 7: Rules");
  });
});
