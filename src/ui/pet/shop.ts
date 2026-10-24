/* The pool's shop (X-7, docs/decisions/0015-mochi-pool.md and 0011), in the lazy `pet` chunk: a second tab
   beside Pool with snacks, toys and decor at fixed facet prices (src/data/pet-items.ts). Facets are earned by
   learning and only spent here; nothing is bought with money and nothing is timed or random.

   A click reads bm.pet.v1 fresh through BMStore, asks the pure helper in src/learn/pet.ts (feedSnack, buy,
   placeDecor) for the next record, writes it when there is one and emits { type: "pet", what: "buy" (a toy or
   decor), "care" (a snack fed) or "wear" (decor placed or put away), id: "<item id>" }. The helper refuses a
   second one-time buy, a buy at a negative balance (after a merge: nothing is revoked, learning earns it back)
   and a snack at a full Tummy, so a replayed click spends again only when the fresh balance allows it. After a
   `stale` bus event (isStale()) nothing is written. Accessories wait for the Blender cards (X-7b). */
import { balance, buy, canBuy, feedSnack, HEARTS_MAX, heartsOf, placeDecor, placedDecor } from "../../learn/pet.ts";
import { PET_ITEMS } from "../../data/pet-items.ts";
import type { PetItem } from "../../data/pet-items.ts";
import { bought, LINES, lineFor, placed, removed } from "./lines.ts";
import { isStale, readPet, today } from "./actions.ts";

export interface ShopCtx {
  alive(): boolean;
  /** repaint hearts, facets, decor and the care row from this record */
  repaint(pet: any, now: number): void;
}
export interface ShopHandle { dispose(): void }

const GROUPS: { kind: PetItem["kind"]; title: string }[] = [
  { kind: "snack", title: "Snacks" }, { kind: "toy", title: "Toys" }, { kind: "decor", title: "Decor" }
];
const CHEAPEST = Math.min(...PET_ITEMS.map((i) => i.price));

function w(): any { return window as any; }
/** this device's id for spend ids: the event log's (8 characters 0-9 a-z), else one for this page load */
let fallbackId = "";
function deviceId(): string {
  try { const id = w().BMEvents.device(); if (typeof id === "string" && /^[0-9a-z]{8}$/.test(id)) return id; } catch { /* no log */ }
  if (!fallbackId) fallbackId = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return fallbackId;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function mountShop(shell: HTMLElement, ctx: ShopCtx): ShopHandle {
  const title = shell.querySelector(".pet-title") as HTMLElement;
  const poolPanel = shell.querySelector('.pet-panel[data-panel="pool"]') as HTMLElement;
  const poolLine = poolPanel.querySelector(".pet-line") as HTMLElement;
  let done = false;

  /* the tab strip */
  const tabs = el("div", "pet-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Pool and shop");
  const shopPanel = el("div", "pet-panel");
  shopPanel.setAttribute("data-panel", "shop");
  shopPanel.hidden = true;
  const tabOf: Record<string, HTMLButtonElement> = {};
  (["pool", "shop"] as const).forEach((name) => {
    const b = el("button", "pet-tab", name === "pool" ? "Pool" : "Shop");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("data-tab", name);
    tabOf[name] = b;
    tabs.appendChild(b);
  });
  title.parentNode!.insertBefore(tabs, title.nextSibling);

  /* the shop panel */
  const line = el("p", "pet-line", "");
  line.tabIndex = -1;
  line.setAttribute("data-shop-line", "");
  line.setAttribute("aria-live", "polite");
  const facets = el("p", "pet-facets", "");
  shopPanel.appendChild(facets);
  const rows: Record<string, { li: HTMLLIElement; act: HTMLButtonElement | null; owned: HTMLElement | null; place: HTMLButtonElement | null; item: PetItem }> = {};
  GROUPS.forEach((g) => {
    const h = el("h3", "pet-group", g.title);
    const ul = el("ul", "pet-items");
    PET_ITEMS.filter((i) => i.kind === g.kind).forEach((item) => {
      const li = el("li", "pet-item");
      li.setAttribute("data-item", item.id);
      li.appendChild(el("span", "pet-item-name", item.name));
      li.appendChild(el("span", "pet-item-price", item.price + " facets"));
      const act = el("button", "btn", item.kind === "snack" ? "Feed" : "Buy");
      act.type = "button";
      act.setAttribute("data-shop", item.kind === "snack" ? "feed" : "buy");
      act.setAttribute("aria-label", (item.kind === "snack" ? "Feed " : "Buy ") + item.name.toLowerCase() + ", " + item.price + " facets");
      li.appendChild(act);
      let owned: HTMLElement | null = null, place: HTMLButtonElement | null = null;
      if (item.kind !== "snack") {
        owned = el("span", "pet-owned", "Owned");
        owned.hidden = true;
        li.appendChild(owned);
      }
      if (item.kind === "decor") {
        place = el("button", "btn ghost", "Place");
        place.type = "button";
        place.setAttribute("data-shop", "place");
        place.setAttribute("aria-pressed", "false");
        place.setAttribute("aria-label", "Place " + item.name.toLowerCase() + " in the pool");
        place.hidden = true;
        li.appendChild(place);
      }
      ul.appendChild(li);
      rows[item.id] = { li, act, owned, place, item };
    });
    shopPanel.appendChild(h);
    shopPanel.appendChild(ul);
  });
  shopPanel.appendChild(line);
  poolPanel.parentNode!.insertBefore(shopPanel, poolPanel.nextSibling);

  function say(text: string): void { line.textContent = text; poolLine.textContent = text; }
  /* why nothing can be bought, if so: the line a disabled button cannot give */
  function status(pet: any): string {
    if (balance(pet) < 0) return LINES.behind;
    if (!canBuy(pet, CHEAPEST)) return LINES.notEnough;
    return "";
  }
  function paint(pet: any, now: number): void {
    facets.textContent = shell.querySelector(".pet-panel[data-panel='pool'] .pet-facets")!.textContent;
    const owned = (pet && typeof pet.owned === "object" && pet.owned) || {};
    const out = placedDecor(pet);
    const full = heartsOf("tummy", pet && pet.needs ? pet.needs.tummy : undefined, now) >= HEARTS_MAX;
    PET_ITEMS.forEach((item) => {
      const r = rows[item.id];
      const has = item.kind !== "snack" && typeof owned[item.id] === "string";
      if (r.act) {
        r.act.hidden = has;
        r.act.disabled = item.kind === "snack" ? full || !canBuy(pet, item.price) : !canBuy(pet, item.price);
      }
      if (r.owned) r.owned.hidden = !has;
      if (r.place) {
        const on = out.indexOf(item.id) >= 0;
        r.place.hidden = !has;
        r.place.textContent = on ? "Remove" : "Place";
        r.place.setAttribute("aria-pressed", on ? "true" : "false");
        r.place.setAttribute("aria-label", (on ? "Remove " : "Place ") + item.name.toLowerCase() + (on ? " from the pool" : " in the pool"));
      }
    });
  }
  /* a button that went away would drop focus to the dialog body: the line takes it */
  function keepFocus(b: HTMLElement | null): void {
    if (!b) return;
    const gone = b.hidden || (b as HTMLButtonElement).disabled || !b.isConnected;
    if (gone) { try { line.focus({ preventScroll: true }); } catch { line.focus(); } }
  }

  function onClick(r: (typeof rows)[string], what: "act" | "place", btn: HTMLButtonElement): void {
    if (done || !ctx.alive() || isStale()) return;
    const day = today(), now = Date.now(), pet = readPet(), item = r.item;
    let next: any = null, kind: "buy" | "care" | "wear" = "buy", text = "";
    if (what === "place") {
      const on = placedDecor(pet).indexOf(item.id) < 0;
      next = placeDecor(pet, item.id, on, now);
      if (next === pet) next = null;
      kind = "wear"; text = on ? placed(item.name) : removed(item.name);
    } else if (item.kind === "snack") {
      next = feedSnack(pet, item, day, deviceId(), now);
      kind = "care"; text = LINES.fed;
      if (!next) text = heartsOf("tummy", pet.needs ? pet.needs.tummy : undefined, now) >= HEARTS_MAX ? LINES.full : balance(pet) < 0 ? LINES.behind : LINES.notEnough;
    } else {
      next = buy(pet, item, day, deviceId());
      text = bought(item.name);
      if (!next) text = balance(pet) < 0 ? LINES.behind : LINES.notEnough;
    }
    if (next) {
      try { w().BMStore.write(w().BMStore.keys.pet, next); } catch { return; }
      try { w().BMStore.emit({ type: "pet", what: kind, id: item.id }); } catch { /* no bus */ }
    }
    const fresh = next || pet;
    ctx.repaint(fresh, now);
    paint(fresh, now);
    say(text);
    keepFocus(btn);
  }
  PET_ITEMS.forEach((item) => {
    const r = rows[item.id];
    if (r.act) { const b = r.act; b.addEventListener("click", () => onClick(r, "act", b)); }
    if (r.place) { const b = r.place; b.addEventListener("click", () => onClick(r, "place", b)); }
  });

  /* the tabs */
  function select(name: "pool" | "shop", focus: boolean): void {
    (Object.keys(tabOf) as ("pool" | "shop")[]).forEach((k) => {
      const on = k === name;
      tabOf[k].setAttribute("aria-selected", on ? "true" : "false");
      tabOf[k].tabIndex = on ? 0 : -1;
    });
    poolPanel.hidden = name !== "pool";
    shopPanel.hidden = name !== "shop";
    const pet = readPet(), now = Date.now();
    ctx.repaint(pet, now);
    if (name === "shop") { paint(pet, now); say(status(pet)); }
    else poolLine.textContent = lineFor(pet, now);
    if (focus) tabOf[name].focus({ preventScroll: true });
  }
  const order: ("pool" | "shop")[] = ["pool", "shop"];
  order.forEach((name, i) => {
    tabOf[name].addEventListener("click", () => select(name, false));
    tabOf[name].addEventListener("keydown", (e: KeyboardEvent) => {
      const to = e.key === "ArrowRight" ? (i + 1) % 2 : e.key === "ArrowLeft" ? (i + 1) % 2 : e.key === "Home" ? 0 : e.key === "End" ? 1 : -1;
      if (to < 0) return;
      e.preventDefault();
      select(order[to], true);
    });
  });
  poolPanel.id = poolPanel.id || "pet-panel-pool-" + title.id;
  shopPanel.id = "pet-panel-shop-" + title.id;
  tabOf.pool.setAttribute("aria-controls", poolPanel.id);
  tabOf.shop.setAttribute("aria-controls", shopPanel.id);
  select("pool", false);
  paint(readPet(), Date.now());

  return { dispose: () => { done = true; } };
}
