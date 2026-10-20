/* A developer's panel for Mochi (src/ui/companion.ts mounts it only on a dev server, with ?mochi=qa):
   one button per mood, one for an idle variation, and the mode and mood in words. Never in a build. */
interface QaApi {
  moods(): string[];
  setMood(name: string): boolean;
  variation(name?: string): boolean;
  info(): { mode: string; mood: string };
}

export function mountQa(api: QaApi): void {
  if (document.querySelector(".companion-qa")) return;
  const box = document.createElement("div");
  box.className = "companion-qa";
  const out = document.createElement("output");
  const show = (): void => { const i = api.info(); out.textContent = i.mode + ", " + i.mood; };
  api.moods().forEach((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = m;
    b.addEventListener("click", () => { api.setMood(m); show(); });
    box.appendChild(b);
  });
  const v = document.createElement("button");
  v.type = "button";
  v.textContent = "variation";
  v.addEventListener("click", () => { api.variation(); show(); });
  box.appendChild(v);
  box.appendChild(out);
  show();
  document.body.appendChild(box);
}
