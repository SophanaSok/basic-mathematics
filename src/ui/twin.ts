/* "Try one like it": the near-transfer twin on an exercise card. While the solution or the
   faded view is open, a button offers a fresh problem of the same kind, answered in a small
   panel under the solution. The first right check pays the difference between the solved
   rate and the assisted rate once (src/learn/twin.ts twinXp), and the attempt record's
   `twin` field says so. A twin never touches the combo, hearts, medal, boxes, progress or
   the event log: it emits one `twin` bus event, never an `attempt`.

   The problem comes from the card's own `template.ex-twin` (authored, markup held by the
   help-markup check) or, failing that, from the Arena's generator for the section. The
   generators are one built chunk (bundle/arena-diagnostic.js) that no chapter page loads
   until the first click here: the import() below is the only way this page reaches it, and
   tools/check-dist.js holds that. assets/site.js, which cannot import, finds the mount
   function on window.BMTwin and passes everything it owns in. */
import { ARENA_SECTIONS } from "../data/arena-sections.ts";
import { pickProblem, seedFor, twinXp } from "../learn/twin.ts";

export interface TwinOptions {
  ex: HTMLElement;
  /** the card's .ex-form; the button goes at its end */
  form: HTMLElement;
  solution: HTMLElement | null;
  chapter: string;
  key: string;
  inline: boolean;
  /** the exercise's section as site.js has it ("angles", "ch02#one-unknown", or empty) */
  section: string;
  template: HTMLTemplateElement | null;
  record: () => any;
  /** Activity.add(xp, "twin") */
  pay: (xp: number) => void;
  /** Attempts.update(chapter, key, a => { a.twin = 1 }) */
  markPaid: () => void;
  judge: (given: string, spec: any) => { kind: string };
  specOf: (src: any) => any;
  render: (el: HTMLElement) => void;
  emit: (change: any) => void;
}

const UNAVAILABLE = "No extra problem available";

/* the section as the Arena names it: "chNN#sec", an unqualified one taking the card's chapter */
export function qualified(chapter: string, section: string): string {
  if (!section) return "";
  return section.indexOf("#") > -1 ? section : chapter + "#" + section;
}

/* the Arena's trimming of a typed answer (assets/arena.js clean): 140° is as good as 140 */
function clean(given: string, type: string): string {
  let s = String(given);
  if (type === "number" || type === "fraction") s = s.replace(/\s*(°|deg(rees?)?)\s*$/i, "");
  return s;
}

/* core first, then the part files that register on it; the one place a chapter page can
   reach the generator chunk */
async function loadGenerators(): Promise<void> {
  /* the files are plain scripts that register on window.BMGen, so TypeScript sees no module */
  // @ts-ignore
  await import("../../data/gen/core.js");
  await Promise.all([
    // @ts-ignore
    import("../../data/gen/part1.js"),
    // @ts-ignore
    import("../../data/gen/part2.js"),
    // @ts-ignore
    import("../../data/gen/part3.js"),
    // @ts-ignore
    import("../../data/gen/part4.js"),
    // @ts-ignore
    import("../../data/gen/packs.js")
  ]);
}

interface Shown { q: string; type: string; answer: string; tol: number; hint?: string; steps?: string[]; chart?: unknown; clone?: DocumentFragment; solution?: HTMLElement | null }

function mount(o: TwinOptions): void {
  const { ex, form, solution } = o;
  const section = qualified(o.chapter, o.section);
  const hasTemplate = !!o.template;
  if (!solution || (!hasTemplate && !ARENA_SECTIONS.includes(section))) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn ghost small ex-twin-btn";
  btn.textContent = "Try one like it";
  btn.hidden = true;
  form.appendChild(btn);

  let panel: HTMLElement | null = null;
  let n = 0;
  let current: Shown | null = null;
  let gone = false;

  const helpOpen = () => solution.getAttribute("data-show") === "true" || !!ex.querySelector(".ex-faded");
  const sync = () => { if (!gone) btn.hidden = !helpOpen(); };
  new MutationObserver(sync).observe(ex, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-show"] });
  sync();

  function unavailable(): void {
    gone = true;
    btn.textContent = UNAVAILABLE;
    btn.disabled = true;
    btn.hidden = false;
  }

  function problem(): Shown | null {
    if (o.template) {
      const t = o.template;
      const frag = t.content.cloneNode(true) as DocumentFragment;
      frag.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      const sol = frag.querySelector(".ex-solution") as HTMLElement | null;
      if (sol) sol.parentNode?.removeChild(sol);
      return { q: "", type: t.getAttribute("data-type") || "exact", answer: t.getAttribute("data-answer") || "", tol: parseFloat(t.getAttribute("data-tol") || "") || 0, clone: frag, solution: sol };
    }
    const Gen = (window as any).BMGen;
    if (!Gen) return null;
    const seed = Gen.hash(seedFor(o.chapter, o.key, n));
    const specs = Gen.forSection(section) as any[];
    const spec = pickProblem(specs, seed, (s) => {
      const p = Gen.make(s.id, seed);
      return !!p && (typeof p.verify !== "function" || !!p.verify());
    });
    if (!spec) return null;
    const p = Gen.make(spec.id, seed);
    return { q: p.q, type: p.type || "exact", answer: String(p.answer), tol: p.tol || 0, hint: p.hint, steps: p.steps || [], chart: p.chart };
  }

  function paint(): void {
    current = problem();
    if (!current) { if (panel) panel.hidden = true; unavailable(); return; }
    const cur = current;
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "ex-twin-card";
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-label", "Another problem like this one");
      solution!.insertAdjacentElement("afterend", panel);
    }
    panel.hidden = false;
    panel.textContent = "";
    const q = document.createElement("div");
    q.className = "ex-twin-q";
    if (cur.clone) {
      q.appendChild(cur.clone);
      const inner = q.querySelector(".ex-q");
      if (inner) { q.textContent = ""; q.appendChild(inner); }
    } else q.textContent = cur.q;
    o.render(q);
    panel.appendChild(q);
    const W = (window as any).BMWidgets;
    if (cur.chart && W && W.chartFigure) {
      const fig = W.chartFigure(cur.chart);
      panel.appendChild(fig);
      W.chart(fig);
    }
    const row = document.createElement("div");
    row.className = "ex-twin-row";
    const id = "bm-twin-" + o.chapter + "-" + o.key + "-" + n;
    const label = document.createElement("label");
    label.className = "ex-twin-label";
    label.setAttribute("for", id);
    label.textContent = "Your answer";
    const input = document.createElement("input");
    input.type = "text";
    input.id = id;
    input.autocomplete = "off";
    input.setAttribute("inputmode", cur.type === "number" || cur.type === "fraction" ? "decimal" : "text");
    const check = document.createElement("button");
    check.type = "button";
    check.className = "btn small";
    check.textContent = "Check";
    row.append(label, input, check);
    const verdict = document.createElement("p");
    verdict.className = "ex-twin-verdict";
    verdict.setAttribute("role", "status");
    const extras = document.createElement("div");
    extras.className = "ex-twin-extras";
    panel.append(row, verdict, extras);

    let steps: HTMLButtonElement | null = null;
    const showSteps = () => {
      const box = document.createElement("div");
      box.className = "ex-twin-steps";
      if (cur.solution) {
        box.appendChild(cur.solution.cloneNode(true));
      } else {
        const lines = [cur.hint].concat(cur.steps || []).filter((x): x is string => !!x);
        lines.forEach((t) => { const p = document.createElement("p"); p.textContent = t; box.appendChild(p); });
      }
      o.render(box);
      extras.appendChild(box);
      if (steps) steps.hidden = true;
    };
    const run = () => {
      const given = input.value;
      let v: { kind: string };
      try { v = o.judge(clean(given, cur.type), o.specOf({ answer: cur.answer, type: cur.type, tol: cur.tol })); } catch { v = { kind: "wrong" }; }
      if (v.kind === "unread") { verdict.textContent = "Type your answer in the box, then check again."; return; }
      const correct = v.kind === "right";
      let xp = 0;
      if (correct) {
        xp = twinXp(o.record(), o.inline);
        if (xp > 0) { o.pay(xp); o.markPaid(); }
        verdict.textContent = xp > 0 ? "Right. +" + xp + " XP" : "Right.";
      } else {
        verdict.textContent = "Not quite.";
        if (!steps && (cur.solution || cur.hint || (cur.steps && cur.steps.length))) {
          steps = document.createElement("button");
          steps.type = "button";
          steps.className = "btn ghost small";
          steps.textContent = "Show steps";
          steps.addEventListener("click", showSteps);
          extras.appendChild(steps);
        }
      }
      o.emit({ type: "twin", chapter: o.chapter, key: o.key, section: o.section, inline: o.inline, correct, paid: xp > 0, xp });
    };
    check.addEventListener("click", run);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
    if (!cur.clone) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "btn ghost small";
      more.textContent = "Another one";
      more.addEventListener("click", () => { n++; paint(); const i = panel && panel.querySelector("input"); if (i) (i as HTMLElement).focus(); });
      panel.appendChild(more);
    }
    input.focus();
  }

  let loading = false;
  btn.addEventListener("click", async () => {
    if (loading || gone) return;
    if (panel && !panel.hidden) { (panel.querySelector("input") as HTMLElement | null)?.focus(); return; }
    if (!hasTemplate && !(window as any).BMGen?.forSection) {
      loading = true;
      try { await loadGenerators(); } catch { loading = false; unavailable(); return; }
      loading = false;
    }
    paint();
  });
}

export const api = { mount, qualified };

if (typeof window !== "undefined") (window as any).BMTwin = api;
