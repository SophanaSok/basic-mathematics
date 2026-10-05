/* Keyboard access to every box that scrolls sideways.

   A display formula (.katex-display) and a table's wrapper (.tbl-wrap) scroll sideways
   when what they hold is wider than the column, which on a phone a long formula or
   chapter 11's table of values is. A mouse or a finger scrolls them; a keyboard cannot,
   since nothing in them takes focus, so what is past the edge is out of a keyboard user's
   reach (WCAG 2.1.1; axe's scrollable-region-focusable, 39 boxes per theme at 360px).

   So a box that overflows is made a stop in the tab order (tabindex="0", where the arrow
   keys scroll it), with a role and a name that say what it is: a group named "Formula,
   scrolls sideways" or "Table, scrolls sideways". Only while it overflows: at a width
   where everything fits, the box is left as the page wrote it, and no tab stop is added
   that would scroll nothing. Each box is watched with a ResizeObserver, so turning the
   phone, a lesson step opening (a box hidden until then has no size) or the fonts
   arriving puts it right; what this module added is marked with data-scrolls and is
   all it ever takes away again.

   assets/site.js runs watch after every renderMath (window.BMScrollRegions.watch), and
   this module watches the page itself once it has loaded, for a page with no formula. */

/** the boxes of the course text that scroll sideways (assets/site.css gives each
    overflow-x: auto). A .display holds a .katex-display, and whichever of the two
    overflows is the one made a tab stop */
export const SCROLLERS = ".katex-display, .display, .tbl-wrap";

/** marks the attributes this module set, and holds the kind it named */
export const MARK = "data-scrolls";

/** a control or a link: a box inside one is never made a tab stop of its own, which would
    nest one interactive element in another */
const INSIDE_CONTROL = "button, a[href], label, summary, select, textarea, [role=button], [role=link]";

/** The part of an element this module reads and writes, so the logic is testable without a DOM */
export interface Box {
  scrollWidth: number;
  clientWidth: number;
  isConnected?: boolean;
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  matches(selector: string): boolean;
  closest(selector: string): unknown;
}

/** what a box is, for its name */
export function kindOf(el: Box): "table" | "formula" {
  return el.matches(".tbl-wrap") ? "table" : "formula";
}

/** whether the box has content past its edge (a pixel of rounding is not overflow) */
export function overflows(el: Box): boolean {
  return el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0;
}

/** Makes the box a named tab stop while it overflows, and takes back what this module
    added once it does not. Leaves alone a box that has a tabindex, role or name of its
    own, and one inside a control. Returns whether the box is a tab stop of ours now. */
export function update(el: Box): boolean {
  const ours = el.hasAttribute(MARK);
  if (overflows(el) && (ours || !(el.hasAttribute("tabindex") || el.hasAttribute("role") || el.hasAttribute("aria-label") || el.closest(INSIDE_CONTROL)))) {
    if (!ours) {
      const kind = kindOf(el);
      el.setAttribute(MARK, kind);
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", (kind === "table" ? "Table" : "Formula") + ", scrolls sideways");
    }
    return true;
  }
  if (ours) {
    el.removeAttribute(MARK);
    el.removeAttribute("tabindex");
    el.removeAttribute("role");
    el.removeAttribute("aria-label");
  }
  return false;
}

let observer: ResizeObserver | null = null;
const watched = new Set<Element>();

function look(entries: ResizeObserverEntry[]) {
  for (const e of entries) {
    if (!e.target.isConnected) { observer?.unobserve(e.target); watched.delete(e.target); continue; }
    update(e.target as unknown as Box);
  }
}

/** Watches every box under root (and root itself) that can scroll sideways, and puts
    each right now. Returns how many of them are tab stops of this module's. */
export function watch(root: ParentNode | Element): number {
  if (typeof ResizeObserver === "undefined") return 0;
  if (!observer) observer = new ResizeObserver(look);
  const boxes: Element[] = [];
  if ((root as Element).matches && (root as Element).matches(SCROLLERS)) boxes.push(root as Element);
  root.querySelectorAll(SCROLLERS).forEach(el => boxes.push(el));
  let count = 0;
  for (const el of boxes) {
    if (!watched.has(el)) { watched.add(el); observer.observe(el); }
    if (update(el as unknown as Box)) count++;
  }
  return count;
}

/** puts every watched box right again (the fonts arriving widen a formula without
    resizing its box, which no ResizeObserver sees) */
export function refresh(): number {
  let count = 0;
  for (const el of watched) if (el.isConnected && update(el as unknown as Box)) count++;
  return count;
}

/* What the page reaches through window.BMScrollRegions: site.js (a script that cannot
   import this module) calls watch after renderMath; refresh is a console and test handle. */
export const api = { watch, refresh, update, SCROLLERS, MARK };

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.BMScrollRegions = api;
  const start = () => watch(document.body);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", () => { refresh(); });
}
