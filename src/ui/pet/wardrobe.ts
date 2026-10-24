/* The Wardrobe tab (X-7b-b, docs/decisions/0015-mochi-pool.md), in the lazy `pet` chunk: what Mochi wears. One
   fieldset.pet-slot[data-slot=head|back|tail] per slot, each a radio group of button.pet-wear[role=radio]
   [aria-checked][data-wear=<item id>|"none"]: "Nothing" first, then every OWNED accessory of that slot in catalogue
   order. With nothing owned the panel holds the empty line and no fieldset. Nothing is bought here (the shop does
   that, through `buy`).

   A click reads bm.pet.v1 fresh through BMStore, asks wearAcc(pet, slot, id | null, now) for the next record,
   writes it when there is one and emits { type: "pet", what: "wear", id: "<item id>" | "none" }. Wear is cosmetic:
   a record that names an unowned or unknown id reads as nothing (wornAcc). After a `stale` bus event (isStale())
   nothing is written and the line says why. The pool (./pool.ts) draws what is worn; this module never touches
   the stage. */
import { wearAcc, wornAcc, WEAR_SLOTS, slotOfSocket } from "../../learn/pet.ts";
import type { WearSlot } from "../../learn/pet.ts";
import { PET_ITEMS } from "../../data/pet-items.ts";
import type { PetItem } from "../../data/pet-items.ts";
import { LINES, wore } from "./lines.ts";
import { isStale, readPet } from "./actions.ts";
import type { TabsHandle } from "./tabs.ts";

export interface WardrobeCtx {
  alive(): boolean;
  /** whether the shop is on: with it the tab is always there, without it only when something is owned */
  shop: boolean;
  /** repaint hearts, facets, decor and the stage's accessories from this record */
  repaint(pet: any, now: number): void;
}
export interface WardrobeHandle { dispose(): void; /** repaint the chips from this record (a sync or another tab changed it) */ refresh(pet: any, now: number): void }

const TITLES: Record<WearSlot, string> = { head: "Head", back: "Back", tail: "Tail" };
const ACC: PetItem[] = PET_ITEMS.filter((i) => i.kind === "acc" && slotOfSocket(i.socket) !== undefined);

function w(): any { return window as any; }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
/** the owned accessories of the catalogue, in catalogue order */
function ownedAcc(pet: any): PetItem[] {
  const owned = (pet && typeof pet.owned === "object" && pet.owned) || {};
  return ACC.filter((i) => typeof owned[i.id] === "string");
}

export function mountWardrobe(shell: HTMLElement, ctx: WardrobeCtx, tabs: TabsHandle): WardrobeHandle | null {
  const poolPanel = shell.querySelector('.pet-panel[data-panel="pool"]') as HTMLElement;
  const poolLine = poolPanel.querySelector(".pet-line") as HTMLElement;
  if (!ctx.shop && !ownedAcc(readPet()).length) return null;
  let done = false, sig: string | null = null;

  const panel = el("div", "pet-panel");
  panel.setAttribute("data-panel", "wardrobe");
  const slots = el("div", "pet-slots");
  const empty = el("p", "pet-wardrobe-empty", LINES.wardrobeEmpty);
  const line = el("p", "pet-line", "");
  line.tabIndex = -1;
  line.setAttribute("data-wardrobe-line", "");
  line.setAttribute("aria-live", "polite");
  panel.appendChild(empty);
  panel.appendChild(slots);
  panel.appendChild(line);
  const panels = shell.querySelectorAll(".pet-panel");
  const last = panels[panels.length - 1] || poolPanel;
  last.parentNode!.insertBefore(panel, last.nextSibling);

  function say(text: string): void { line.textContent = text; poolLine.textContent = text; }

  function chip(slot: WearSlot, id: string, name: string): HTMLButtonElement {
    const b = el("button", "btn ghost pet-wear", name);
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", "false");
    b.setAttribute("data-wear", id);
    b.tabIndex = -1;
    b.addEventListener("click", () => onClick(slot, id, b));
    return b;
  }
  /* the chips again when the owned list changed; the checked state again always */
  function paint(pet: any): void {
    const have = ownedAcc(pet);
    const key = have.map((i) => i.id).join(",");
    let refocus: { slot: string; wear: string } | null = null;
    if (key !== sig) {
      /* a rebuild while focus is inside the panel: the same chip gets it back (or the slot's first) */
      const a = document.activeElement as HTMLElement | null;
      const fs = a && panel.contains(a) && a.closest ? a.closest("fieldset") : null;
      if (a && fs && a.hasAttribute("data-wear")) refocus = { slot: fs.getAttribute("data-slot") || "", wear: a.getAttribute("data-wear") || "" };
      sig = key;
      slots.textContent = "";
      if (have.length) {
        WEAR_SLOTS.forEach((slot) => {
          const set = el("fieldset", "pet-slot");
          set.setAttribute("data-slot", slot);
          set.setAttribute("role", "radiogroup");
          set.appendChild(el("legend", "", TITLES[slot]));
          set.appendChild(chip(slot, "none", "Nothing"));
          have.filter((i) => slotOfSocket(i.socket) === slot).forEach((i) => set.appendChild(chip(slot, i.id, i.name)));
          set.addEventListener("keydown", (e: KeyboardEvent) => onKey(e, set));
          slots.appendChild(set);
        });
      }
    }
    empty.hidden = have.length > 0;
    slots.hidden = !have.length;
    const worn = wornAcc(pet) as Record<string, string | undefined>;
    slots.querySelectorAll<HTMLButtonElement>("button.pet-wear").forEach((b) => {
      const slot = (b.closest("fieldset") as HTMLElement).getAttribute("data-slot") as WearSlot;
      const id = b.getAttribute("data-wear")!;
      const on = (worn[slot] || "none") === id;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    if (refocus) {
      const set = slots.querySelector('fieldset[data-slot="' + refocus.slot + '"]');
      const chips = set ? Array.from(set.querySelectorAll<HTMLButtonElement>("button.pet-wear")) : [];
      const to = chips.find((b) => b.getAttribute("data-wear") === refocus!.wear) || chips[0];
      if (to) { try { to.focus({ preventScroll: true }); } catch { to.focus(); } }
    }
  }
  /* arrows move among the chips of a slot and choose, as a radio group does */
  function onKey(e: KeyboardEvent, set: HTMLElement): void {
    /* a held arrow or a chord is not a choice: one press writes once */
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    const all = Array.from(set.querySelectorAll<HTMLButtonElement>("button.pet-wear"));
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const to = all[(at + dir + all.length) % all.length];
    to.focus({ preventScroll: true });
    to.click();
  }

  function onClick(slot: WearSlot, id: string, btn: HTMLButtonElement): void {
    if (done || !ctx.alive()) return;
    if (isStale()) { say(LINES.behind); return; }
    /* the chip already shows as chosen (a stale unowned id paints as Nothing): nothing to write, nothing to say.
       The stale id stays in the record until a real change replaces it. */
    if (btn.getAttribute("aria-checked") === "true") return;
    const now = Date.now(), pet = readPet();
    const item = id === "none" ? null : ACC.find((i) => i.id === id) || null;
    const next: any = wearAcc(pet, slot, item ? item.id : null, now);
    let fresh = pet;
    if (next !== pet) {
      /* a full quota answers false and does not throw: nothing was kept, so nothing is announced */
      let kept = true;
      try { kept = w().BMStore.write(w().BMStore.keys.pet, next) !== false; } catch { kept = false; }
      if (!kept) fresh = readPet();
      else {
        fresh = next;
        try { w().BMStore.emit({ type: "pet", what: "wear", id: item ? item.id : "none" }); } catch { /* no bus */ }
        say(item ? wore(item.name) : LINES.tookOff);
      }
    }
    ctx.repaint(fresh, now);
    paint(fresh);
    if (btn.isConnected) { try { btn.focus({ preventScroll: true }); } catch { btn.focus(); } }
  }

  tabs.add("wardrobe", "Wardrobe", panel, () => {
    const pet = readPet();
    paint(pet);
    line.textContent = "";
  });
  paint(readPet());
  return {
    dispose: () => { done = true; },
    refresh: (pet) => { if (!done) paint(pet); }
  };
}
