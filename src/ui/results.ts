/* A short, skippable reveal for a result screen: the Arena's result and a chapter's finale.

     - The markup is already final when this runs. The sequence only fades the rows in
       (elements with data-step, in that order), counts the numbers up under an aria-hidden
       overlay (elements with data-count) and stamps the medal once. The real text is in the
       DOM, at its final width, from the first frame, so a screen reader and a layout never
       see anything but the final values.
     - It plays at most once per result (bm.run.v1 seen.results, capped), never under reduced
       motion or Study mode (BMFx.still), never on a hidden tab, never on a restored result.
     - Skip, Escape or any click inside the section ends it at once. Afterwards the section
       is exactly what a still render produces: the attributes, overlays, delays and the
       Skip button are all taken off again.
     - It makes no announcement; the pages already make theirs once.

   window.BMResults is a console and test handle. */

export const SEQ_MAX_MS = 2000;   // the whole sequence, including the last count-up
export const STEP_MS = 240;       // --dur-reveal
export const COUNT_MS = 400;      // --dur-bar
export const SEEN_MAX = 50;

export interface PlayOptions {
  key: string;
  restored?: boolean;
  still?: () => boolean;
  heading?: HTMLElement | null;
}

/** Delay of each of n steps, in ms: one step apart, closer when the whole would run past
    SEQ_MAX_MS (the last step must still have room for a count-up). */
export function stepDelays(n: number): number[] {
  const count = Math.max(0, Math.floor(n) || 0);
  if (count === 0) return [];
  const room = SEQ_MAX_MS - COUNT_MS;
  const gap = count > 1 ? Math.min(STEP_MS, Math.floor(room / (count - 1))) : 0;
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(i * gap);
  return out;
}

/** When the sequence ends: the last applied delay, the longer of a reveal and a count-up, a
    little slack, never past SEQ_MAX_MS. */
export function endAt(delays: number[]): number {
  const last = delays.length ? Math.max(...delays) : 0;
  return Math.min(SEQ_MAX_MS, last + Math.max(STEP_MS, COUNT_MS) + 60);
}

/** The key a result is remembered by. */
export function seenKey(parts: readonly (string | number)[]): string {
  return parts.map(p => String(p)).join("/");
}

function seenMap(run: Record<string, unknown>): Record<string, unknown> {
  const s = run && typeof run === "object" ? (run as any).seen : null;
  const r = s && typeof s === "object" && !Array.isArray(s) ? (s as any).results : null;
  return r && typeof r === "object" && !Array.isArray(r) ? r : {};
}

export function hasSeen(run: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(seenMap(run), key);
}

/** A copy of run with key marked; the oldest beyond SEEN_MAX (insertion order) dropped. */
export function markSeen(run: Record<string, unknown>, key: string): Record<string, unknown> {
  const base = run && typeof run === "object" && !Array.isArray(run) ? run : {};
  const results: Record<string, unknown> = { ...seenMap(base) };
  if (!Object.prototype.hasOwnProperty.call(results, key)) results[key] = 1;
  const keys = Object.keys(results);
  for (let i = 0; i < keys.length - SEEN_MAX; i++) delete results[keys[i]];
  const seen = (base as any).seen && typeof (base as any).seen === "object" && !Array.isArray((base as any).seen) ? (base as any).seen : {};
  return { ...base, seen: { ...seen, results } };
}

function runStore(): Record<string, unknown> {
  try {
    const r = window.BMStore.read(window.BMStore.keys.run, {});
    return r && typeof r === "object" && !Array.isArray(r) ? r : {};
  } catch { return {}; }
}

function defaultStill(): boolean {
  try { return !!(window.BMFx && typeof window.BMFx.still === "function" && window.BMFx.still()); } catch { return false; }
}

let active: (() => void) | null = null;

export function playResults(section: HTMLElement, opts: PlayOptions): boolean {
  if (!section || !opts || typeof document === "undefined") return false;
  const still = opts.still || defaultStill;
  if (still() || document.hidden || opts.restored) return false;
  if (!window.BMStore || hasSeen(runStore(), opts.key)) return false;
  if (active) active();

  const steps = Array.from(section.querySelectorAll<HTMLElement>("[data-step]"));
  const order = Array.from(new Set(steps.map(el => Number(el.getAttribute("data-step")) || 0))).sort((a, b) => a - b);
  const delays = stepDelays(order.length);
  const delayOf = (el: HTMLElement | null): number => {
    for (let n: Element | null = el; n && n !== section; n = n.parentElement) {
      if (n.hasAttribute("data-step")) return delays[order.indexOf(Number(n.getAttribute("data-step")) || 0)] || 0;
    }
    return 0;
  };

  const heading = opts.heading || section.querySelector<HTMLElement>("h1, h2, h3, .encounter-result-title");
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "btn ghost small";
  skip.setAttribute("data-skip", "");
  skip.textContent = "Skip";
  skip.setAttribute("aria-label", "Skip the reveal");

  section.setAttribute("data-seq", "play");
  steps.forEach(el => el.style.setProperty("--seq-delay", delayOf(el) + "ms"));
  if (heading && heading.parentNode) heading.parentNode.insertBefore(skip, heading.nextSibling);
  else section.insertBefore(skip, section.firstChild);

  const frames = new Set<number>();
  const overlays: HTMLElement[] = [];
  const hosts: HTMLElement[] = [];
  let ended = false;
  let endTimer = 0;

  section.querySelectorAll<HTMLElement>("[data-count]").forEach(host => {
    const text = (host.textContent || "").trim();
    if (!/^\d+$/.test(text)) return;
    const target = Number(text);
    const start = delayOf(host);
    const ov = document.createElement("span");
    ov.className = "bm-count";
    ov.setAttribute("aria-hidden", "true");
    ov.textContent = "0";
    try { ov.style.color = getComputedStyle(host).color; } catch { /* the stylesheet's colour stands */ }
    host.setAttribute("data-counting", "");
    host.appendChild(ov);
    overlays.push(ov);
    hosts.push(host);
    const t0 = performance.now() + start;
    const tick = (now: number) => {
      if (ended) return;
      const p = Math.min(1, Math.max(0, (now - t0) / COUNT_MS));
      ov.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frames.add(requestAnimationFrame(tick));
    };
    frames.add(requestAnimationFrame(tick));
  });

  function finish(): void {
    if (ended) return;
    ended = true;
    active = null;
    window.clearTimeout(endTimer);
    frames.forEach(f => cancelAnimationFrame(f));
    frames.clear();
    document.removeEventListener("keydown", onKey, true);
    section.removeEventListener("click", finish);
    const hadFocus = document.activeElement === skip;
    overlays.forEach(o => o.remove());
    hosts.forEach(h => h.removeAttribute("data-counting"));
    section.removeAttribute("data-seq");
    steps.forEach(el => {
      el.style.removeProperty("--seq-delay");
      if (!el.getAttribute("style")) el.removeAttribute("style");
    });
    skip.remove();
    if (hadFocus && heading) {
      heading.focus();   /* a heading that can take focus has tabindex="-1" in its markup already */
    }
    try {
      window.BMStore.write(window.BMStore.keys.run, markSeen(runStore(), opts.key), true);
    } catch { /* a full or blocked store: the sequence may play again, nothing more */ }
  }
  function onKey(e: KeyboardEvent): void { if (e.key === "Escape") finish(); }

  document.addEventListener("keydown", onKey, true);
  section.addEventListener("click", finish);
  endTimer = window.setTimeout(finish, endAt(delays));
  active = finish;
  return true;
}

export const api = { playResults, stepDelays, endAt, seenKey, hasSeen, markSeen, SEQ_MAX_MS };

if (typeof window !== "undefined") window.BMResults = api;
