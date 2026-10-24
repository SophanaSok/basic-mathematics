/* The pet's earns: what window.BMPet is. It listens to the Store's changes and turns the
   signals that pay facets (a first strong section, a medal level, a due review, a
   comparison, a mission) into ids in bm.pet.v1 `earned`, and paints the facets slot of the
   HUD. The id is the cause and the dedupe: the same id written twice, or by two devices, is
   one id (mergePet is a union by key), so it pays once. earned[id] is always 1; what an id
   is worth lives in the table in src/learn/pet.ts. Nothing here spends. Ignored on purpose:
   twin, xp, combo, the Daily board, Arena time and speed (decision 0006).
   install(win) builds the api over a window-like object so a test can put one up; the page's
   copy is installed on load. */

import { balance, earnAmount, prunePet } from "../learn/pet.ts";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isObj(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}
const str = (x: unknown): x is string => typeof x === "string" && x.length > 0;

export function install(win: any) {
  const Store: any = win && win.BMStore;
  const con: any = (win && win.console) || (typeof console !== "undefined" ? console : null);
  let stale = false, warned = false;
  const warn = (e: unknown) => { if (!warned) { warned = true; if (con && con.warn) con.warn("[BM] pet earns", e); } };
  const key = (): string => (Store && Store.keys && Store.keys.pet) || "bm.pet.v1";
  const today = (): string => {
    const s = win && win.BMSite;
    if (s && typeof s.dayKey === "function") return s.dayKey(new Date());
    return new Date().toISOString().slice(0, 10);
  };
  const petNow = (): Record<string, unknown> => {
    const p = Store ? Store.read(key(), {}) : {};
    return isObj(p) ? p : {};
  };

  /* the facets slot: the number, the sentence, and whether it shows (a pet with a balance or
     any earned id; an empty pet keeps it hidden) */
  function repaint(): void {
    try {
      const doc = win && win.document;
      const el = doc && doc.querySelector(".hud-facets");
      if (!el) return;
      const pet = petNow(), n = balance(pet);
      const b = el.querySelector("b");
      if (b) b.textContent = String(n);
      el.setAttribute("aria-label", n + " facets for Mochi's pool.");
      const earned = pet.earned;
      if (n > 0 || (isObj(earned) && Object.keys(earned).length > 0)) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    } catch (e) { warn(e); }
  }

  /* one earn id: true when it was newly written */
  function earn(id: string): boolean {
    if (!Store || stale || !str(id) || earnAmount(id) === 0) return false;
    const pet = petNow();
    const earned: Record<string, number> = isObj(pet.earned) ? { ...(pet.earned as Record<string, number>) } : {};
    if (earned[id]) return false;
    earned[id] = 1;
    const next = prunePet({ v: 1, ...pet, earned });
    if (!next.earned || !next.earned[id]) return false;    /* cut by a cap (five reviews a day): nothing to store */
    if (Store.write(key(), next) === false) return false;
    if (typeof Store.emit === "function") Store.emit({ type: "pet", what: "earn", id });
    return true;
  }

  const medals = (ch: unknown, set: unknown, medal: unknown): void => {
    if (!str(ch) || !str(set) || typeof medal !== "number") return;
    for (let k = 1; k <= Math.min(3, Math.floor(medal)); k++) earn("medal:" + ch + ":" + set + ":" + k);
  };

  function onChange(c: any): void {
    if (!isObj(c)) return;
    switch (c.type) {
      case "stale": stale = true; return;
      case "reset": case "sync": repaint(); return;
      case "pet": repaint(); return;
      case "state": if (c.key === key()) repaint(); return;
      case "event": {
        const sec = c.sec, ev = win.BMEvents;
        if (str(sec) && ev && typeof ev.bandOf === "function" && ev.bandOf(sec) === "strong") earn("strong:" + sec);
        return;
      }
      case "encounter": medals(c.chapter, c.set, c.medal); return;
      case "arena": {
        if (c.phase !== "recorded") return;
        const set = c.set, m = typeof set === "string" ? /^([^/]+)\/([^/]+)$/.exec(set) : null;
        if (m && typeof c.medal === "number" && c.medal >= 1) medals(m[1], m[2], c.medal);
        if (Array.isArray(c.due) && typeof c.day === "string" && DAY_RE.test(c.day)) {
          c.due.forEach((sec: unknown) => { if (str(sec)) earn("review:" + c.day + ":" + sec); });
        }
        return;
      }
      case "attempt": {
        if (!(c.correct && c.tryNo === 1 && c.hintLevel === 0 && !c.solutionOpen) || !str(c.section)) return;
        const ev = win.BMEvents, rc = win.BMReview && win.BMReview.recall;
        if (!ev || !rc || typeof ev.schedule !== "function") return;
        const day = today(), s = ev.schedule(c.section, day);
        if (rc.isPlaced(s) && rc.dueOn(s, day)) earn("review:" + day + ":" + c.section);
        return;
      }
      case "compare": if (str(c.chapter) && str(c.key)) earn("compare:" + c.chapter + "/" + c.key); return;
      case "mission": if (str(c.chapter) && str(c.key)) earn("mission:" + c.chapter + "/" + c.key); return;
    }
  }

  const api = {
    balance: (): number => balance(petNow()),
    earn,
    repaint
  };
  if (Store && typeof Store.on === "function") {
    Store.on((c: any) => {
      try { onChange(c); } catch (e) { warn(e); }
    });
  }
  repaint();
  return api;
}

export type PetEarnsApi = ReturnType<typeof install>;

if (typeof window !== "undefined") window.BMPet = install(window);
