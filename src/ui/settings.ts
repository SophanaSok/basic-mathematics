/* The menu and settings sheet: the <dialog id="hud-sheet"> the shell writes into every
   top bar (tools/lib/shell.js sheet()), opened by the menu button beside it.

   On a wide screen it opens with show(): a panel hanging under the rail, not modal, so
   the page stays usable; a click or focus outside it closes it. On a narrow screen
   (NARROW) it opens with showModal(): a sheet from the bottom over a scrim, the rest of
   the page inert and the focus kept inside it (Tab and Shift+Tab wrap). Either way
   Escape closes it and hands the focus back to the menu button, and so do the close
   button and a click on the scrim.

   Every input names its preference in data-pref. All of them are this device's
   (bm.prefs.v1, through BMGame.setPref, which keeps the keys it does not know; the theme
   in bm.theme, through BMSite.setTheme), never synced. What changes the first paint is
   stamped on <html> by src/boot.js before it, and by BMGame.setPref on a change. This
   file only shows the preferences and passes changes on. */

const NARROW = "(max-width: 480px)";
const DEVICE_MOTION = "(prefers-reduced-motion: reduce)";
const DEVICE_TRANSPARENCY = "(prefers-reduced-transparency: reduce)";

/* what the sheet reads of window.BMGame (assets/game.js) */
interface Prefs {
  sound: boolean;
  calm: boolean;
  map?: "3d" | "list";
  panel?: "light" | "dark";
  volume?: number;
  motion?: "reduce";
  transparency?: "reduce";
  gfx?: "low" | "mid" | "high";
  /** the tier the course world's watchdog settled on (src/world/tiers.ts) */
  gfxAuto?: "list" | "low" | "medium";
}
interface Game {
  prefs(): Prefs;
  setPref(name: string, value: unknown): Prefs;
  map3dOn(p: Prefs): boolean;
  volume(p: Prefs): number;
}

/* what the reader can reach with Tab inside the sheet, in order: of a radio group only
   the checked one (or the first, when none is), as the browser does */
function tabbable(root: HTMLElement): HTMLElement[] {
  const seen = new Set<string>();
  return Array.from(root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea")).filter((el) => {
    if ((el as HTMLButtonElement).disabled || el.getClientRects().length === 0) return false;
    if (el instanceof HTMLInputElement && el.type === "radio") {
      if (seen.has(el.name)) return false;
      const group = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter((r) => r.name === el.name && !r.disabled);
      const pick = group.find((r) => r.checked) || group[0];
      if (pick !== el) return false;
      seen.add(el.name);
    }
    return true;
  });
}

export function mountSettings(doc: Document = document): boolean {
  const sheet = doc.getElementById("hud-sheet");
  const menu = doc.querySelector<HTMLButtonElement>(".topbar .hud-menu");
  const game: Game | undefined = window.BMGame;
  if (!(sheet instanceof HTMLDialogElement) || !menu || !game || typeof sheet.show !== "function") return false;
  const dialog: HTMLDialogElement = sheet;
  const site = window.BMSite;
  const narrow = window.matchMedia ? window.matchMedia(NARROW) : null;
  /* what the device asks for: Reduce motion and Reduce transparency are on whatever the
     switch says while it does (and motion in Study mode too), so the switch shows on, and
     cannot be turned off, as Sound does in Study mode */
  const device = {
    motion: window.matchMedia ? window.matchMedia(DEVICE_MOTION) : null,
    transparency: window.matchMedia ? window.matchMedia(DEVICE_TRANSPARENCY) : null
  };

  const inputs = () => Array.from(dialog.querySelectorAll<HTMLInputElement>("input[data-pref]"));

  /* the inputs as the preferences are now */
  function sync() {
    const p = game!.prefs();
    const soundOn = p.sound && !p.calm;
    const forced = {
      motion: !!(device.motion && device.motion.matches) || p.calm,
      transparency: !!(device.transparency && device.transparency.matches)
    };
    for (const input of inputs()) {
      const name = input.dataset.pref || "";
      if (input.type === "checkbox") {
        input.checked = name === "map3d" ? game!.map3dOn(p)
          : name === "sound" ? soundOn
          : name === "motion" || name === "transparency" ? p[name] === "reduce" || forced[name]
          : !!(p as unknown as Record<string, unknown>)[name];
        input.disabled = (name === "sound" && p.calm) || ((name === "motion" || name === "transparency") && forced[name]);
        input.setAttribute("aria-checked", input.checked ? "true" : "false");
      } else if (input.type === "radio") {
        const value = name === "theme" ? (site && site.theme ? site.theme() : "system")
          : name === "panel" ? p.panel || "light"
          : name === "gfx" ? p.gfx || "auto" : "";
        input.checked = input.value === value;
      } else if (input.type === "range") {
        const v = String(game!.volume(p));
        if (input.value !== v) input.value = v;
        input.disabled = !soundOn;
        input.setAttribute("aria-valuetext", v + " percent");
      }
    }
  }

  function open() {
    if (dialog.open) return;
    sync();
    if (narrow && narrow.matches) dialog.showModal();
    else dialog.show();
    menu!.setAttribute("aria-expanded", "true");
    const first = tabbable(dialog).find((el) => !el.hasAttribute("data-sheet-close"));
    if (first) first.focus();
  }
  /* returnFocus: Escape, the close button, the menu button and the scrim hand the focus
     back to the menu button; a click or focus elsewhere leaves it where it went, unless
     it was inside the sheet, which is going. Done here and not on the dialog's `close`
     event, which comes a task later. */
  function close(returnFocus: boolean) {
    if (!dialog.open) return;
    const inside = !!doc.activeElement && dialog.contains(doc.activeElement);
    dialog.close();
    menu!.setAttribute("aria-expanded", "false");
    if (returnFocus || inside) menu!.focus();
  }
  /* closed by the browser itself (a close request this file did not see first). The event
     comes a task after the closing, so by then the sheet may be open again (closed and
     reopened quickly): that one is not a close */
  dialog.addEventListener("close", () => {
    if (dialog.open || menu!.getAttribute("aria-expanded") !== "true") return;
    menu!.setAttribute("aria-expanded", "false");
    menu!.focus();
  });

  menu.addEventListener("click", () => { if (dialog.open) close(true); else open(); });
  dialog.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-sheet-close]")) { close(true); return; }
    /* a click on the scrim lands on the dialog itself, outside its box */
    if (t === dialog && dialog.matches(":modal")) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(true);
    }
  });

  /* Escape first, before the page's own keys (the Arena pauses on Escape) */
  window.addEventListener("keydown", (e) => {
    if (!dialog.open) return;
    if (e.key === "Escape" || e.key === "Esc") {
      e.stopPropagation();
      e.preventDefault();
      close(true);
      return;
    }
    /* modal: the focus goes round inside the sheet */
    if (e.key === "Tab" && dialog.matches(":modal")) {
      const list = tabbable(dialog);
      if (!list.length) return;
      const at = list.indexOf(doc.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? list[list.length - 1] : null) : (at === -1 || at === list.length - 1 ? list[0] : null);
      if (next) { e.preventDefault(); next.focus(); }
    }
  }, true);

  /* not modal: a click or the focus outside the sheet closes it, so it never hides the
     control the reader went to */
  const outside = (t: EventTarget | null) => t instanceof Node && !dialog.contains(t) && !menu!.contains(t);
  doc.addEventListener("click", (e) => { if (dialog.open && !dialog.matches(":modal") && outside(e.target)) close(false); });
  doc.addEventListener("focusin", (e) => { if (dialog.open && !dialog.matches(":modal") && outside(e.target)) close(false); });
  /* a screen that changes width while the sheet is open (a phone turned) gets the other
     kind of sheet next time */
  if (narrow) {
    const changed = () => { if (dialog.open && dialog.matches(":modal") !== narrow.matches) close(false); };
    if (narrow.addEventListener) narrow.addEventListener("change", changed);
  }
  /* the device's own setting changed: the switches follow it */
  for (const q of [device.motion, device.transparency]) if (q && q.addEventListener) q.addEventListener("change", sync);

  /* a change passes on at once: the slider on every step, so the volume follows it */
  const pass = (input: HTMLInputElement) => {
    const name = input.dataset.pref || "";
    if (name === "theme") { if (site && site.setTheme) site.setTheme(input.value); }
    else if (input.type === "checkbox") game!.setPref(name, input.checked);
    else if (input.type === "radio") { if (input.checked) game!.setPref(name, input.value); }
    else if (input.type === "range") game!.setPref(name, input.valueAsNumber);
    sync();
  };
  dialog.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.dataset || !input.dataset.pref) return;
    pass(input);
    /* the slider let go: one note at the new volume */
    if (input.type === "range" && window.BMSfx && window.BMSfx.play) window.BMSfx.play("correct");
  });
  dialog.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.type === "range" && input.dataset.pref) pass(input);
  });

  /* the preferences changed elsewhere (the sound button, another script, a reset) */
  const store = window.BMStore;
  if (store && store.on) {
    store.on((c: { type?: string }) => {
      if (c && (c.type === "prefs" || c.type === "theme" || c.type === "reset" || c.type === "sync")) sync();
    });
  }
  sync();
  return true;
}

if (typeof document !== "undefined") mountSettings();
