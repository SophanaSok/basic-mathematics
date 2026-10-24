/* The pool's tab strip (X-8b), in the lazy `pet` chunk. Panels register themselves: Pool always, Shop when the
   config shop is on, Growth always. The strip lives in its own module so it does not vanish with the shop.

   A tab is button.pet-tab[role=tab] with a roving tabindex; its panel is role=tabpanel, labelled by the tab and
   hidden unless selected. Arrow keys wrap, Home and End jump. The strip is hidden while a single panel is
   registered. Nothing here reads or writes the record. */
export interface TabsHandle {
  /** register a panel after the ones already there; `onShow` runs each time its tab is shown */
  add(name: string, label: string, panel: HTMLElement, onShow?: () => void): void;
  /** show a tab; `focus` also moves focus to it */
  select(name: string, focus: boolean): void;
}

interface Entry { name: string; tab: HTMLButtonElement; panel: HTMLElement; onShow?: () => void }

/** the index a key moves to from `i` among `n` tabs, or -1 for a key that moves nothing */
export function tabTarget(key: string, i: number, n: number): number {
  if (key === "ArrowRight") return (i + 1) % n;
  if (key === "ArrowLeft") return (i + n - 1) % n;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return -1;
}

export function mountTabs(shell: HTMLElement, titleId: string): TabsHandle {
  const title = shell.querySelector(".pet-title") as HTMLElement;
  const strip = document.createElement("div");
  strip.className = "pet-tabs";
  strip.setAttribute("role", "tablist");
  strip.setAttribute("aria-label", "Mochi's pool");
  strip.hidden = true;
  title.parentNode!.insertBefore(strip, title.nextSibling);
  const entries: Entry[] = [];

  function select(name: string, focus: boolean): void {
    const hit = entries.find((e) => e.name === name);
    if (!hit) return;
    entries.forEach((e) => {
      const on = e === hit;
      e.tab.setAttribute("aria-selected", on ? "true" : "false");
      e.tab.tabIndex = on ? 0 : -1;
      e.panel.hidden = !on;
    });
    if (hit.onShow) hit.onShow();
    if (focus) hit.tab.focus({ preventScroll: true });
  }

  function add(name: string, label: string, panel: HTMLElement, onShow?: () => void): void {
    const tab = document.createElement("button");
    tab.className = "pet-tab";
    tab.type = "button";
    tab.textContent = label;
    tab.id = titleId + "-tab-" + name;
    tab.setAttribute("role", "tab");
    tab.setAttribute("data-tab", name);
    panel.id = titleId + "-panel-" + name;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.setAttribute("aria-controls", panel.id);
    const first = entries.length === 0;
    tab.setAttribute("aria-selected", first ? "true" : "false");
    tab.tabIndex = first ? 0 : -1;
    panel.hidden = !first;
    const entry: Entry = { name, tab, panel, onShow };
    entries.push(entry);
    tab.addEventListener("click", () => select(name, false));
    tab.addEventListener("keydown", (e: KeyboardEvent) => {
      const to = tabTarget(e.key, entries.indexOf(entry), entries.length);
      if (to < 0) return;
      e.preventDefault();
      select(entries[to].name, true);
    });
    strip.appendChild(tab);
    strip.hidden = entries.length < 2;
    if (first && onShow) onShow();
  }
  return { add, select };
}
