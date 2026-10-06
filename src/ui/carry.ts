/* Progress brought from the old address, on the page: what src/carry/format.ts reads,
   asked about and written here. Every entry imports this file after assets/account.js,
   whose merge it uses (BMAccount.merge, the rule an account sync uses).

   1. On any page of the new address (allowedHost: the new address, a local server, the
      project's pages.dev addresses), an address whose fragment carries bm-carry, as the
      legacy site's pages write it (src/carry/send.js): the fragment is taken out of the
      address at once (history.replaceState, so a reload or a bookmark does not bring it
      back; the old page's own fragment, bm-at, is put back and scrolled to, unless it
      is itself a payload: format.ts safeAt), the payload is read and checked, and the
      reader is asked, in a dialog that says what it holds, before anything is kept. Yes
      merges it (plan()), no leaves everything as it was; either way this browser
      records the payload's fingerprint in bm.carry.v1, and the same payload arriving on
      its own (an old link opened again) is not asked about again. Arriving from the
      legacy carry page (bm-ask=1), which a reader only reaches by asking for it, it is
      asked about whatever was answered before, so a "no" can be taken back. A payload
      that cannot be read is refused with a short note, and recorded the same way; so is
      one that holds only settings this browser already has (the question names a
      setting only where it would be written: summary() with this browser's stores).
   2. On the progress page, on the same hosts (the old address, while it still serves the
      course, shows nothing new), the section [data-carry-tools]: links to the legacy
      carry page ([data-carry-old]; it exists only once SITE_CUTOVER has put the legacy
      site at the old address, which OPERATIONS.md says where the new address is tried
      before that), which sends this browser's old progress back here by the same route,
      or as a file; and an import of the file "Download my data" makes (or the legacy
      carry page offers), which goes through the same checks, question and merge.
   3. On any page, on the same hosts, [data-carry-moved] (the about page's account of
      where the course is served from): shown here, and never at the old address, whose
      readers are told nothing of the move until it has happened.

   Nothing carried is ever put into the page as HTML: every word is textContent. */

import { allowedHost, asked, type Course, decode, describe, FLAG, fingerprint, fromFile, legacyCarryUrl, MAX_FILE, plan, readHash, remember, summary, SYNCED, type Outcome, type Owner, type Refusal, type Stores } from "../carry/format.ts";

type Answer = (take: boolean) => void;

const REFUSED: Record<Refusal, string> = {
  version: "It was written by a different version of this site, so nothing was changed.",
  malformed: "It could not be read, so nothing was changed.",
  size: "It is larger than any progress this site writes, so nothing was changed.",
  keys: "It holds things that are not progress from this site, so nothing was changed.",
  unsupported: "This browser cannot unpack it, so nothing was changed. Try another browser, or bring your progress over as a file.",
  empty: "It holds no progress, so nothing was changed."
};
const NOTHING_NEW = "It holds nothing this browser does not already have, so nothing was changed.";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* the question: a modal dialog with the two answers; Escape is "no" */
function ask(title: string, line: string, answer: Answer): HTMLDialogElement {
  const dialog = el("dialog", "carry-ask");
  dialog.setAttribute("aria-labelledby", "carry-ask-title");
  const h = el("h2", undefined, title);
  h.id = "carry-ask-title";
  const yes = el("button", "btn", "Bring it over");
  const no = el("button", "btn ghost", "No, leave it");
  yes.type = no.type = "button";
  yes.setAttribute("data-carry-yes", "");
  no.setAttribute("data-carry-no", "");
  const actions = el("p", "actions");
  actions.append(yes, no);
  dialog.append(h, el("p", "carry-what", line),
    el("p", "fine", "It is joined to what this browser already has here, the way two devices' progress is joined: nothing solved or earned here is lost, and the old address keeps its copy."),
    actions);
  let settled = false;
  const settle = (take: boolean) => {
    if (settled) return;
    settled = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    answer(take);
  };
  yes.addEventListener("click", () => settle(true));
  no.addEventListener("click", () => settle(false));
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); settle(false); });
  document.body.appendChild(dialog);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  yes.focus();
  return dialog;
}

/* a short note at the foot of the screen, closed by its button */
function note(text: string, bad?: boolean): void {
  const old = document.querySelector(".carry-note");
  if (old) old.remove();
  const box = el("div", "carry-note" + (bad ? " bad" : ""));
  box.setAttribute("role", bad ? "alert" : "status");
  const close = el("button", "btn ghost small", "Close");
  close.type = "button";
  close.addEventListener("click", () => box.remove());
  box.append(el("p", undefined, text), close);
  document.body.appendChild(box);
}

/* what this browser holds under a key, as plan() reads it */
function read(key: string): unknown {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(key); } catch (e) { return undefined; }
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch (e) { return undefined; }
}

/* the chapters, sections and achievements the course has, which a carried key must name
   (data/curriculum.js, assets/game.js); nothing when the page has not loaded them */
function course(): Course | undefined {
  const C = window.BM_CURRICULUM as { chapters?: { id: string; sections?: { id: string }[] }[] } | undefined;
  if (!C || !Array.isArray(C.chapters) || !C.chapters.length) return undefined;
  const chapters: string[] = [], sections: string[] = [];
  C.chapters.forEach((ch) => {
    chapters.push(ch.id);
    (ch.sections || []).forEach((s) => sections.push(ch.id + "#" + s.id));
  });
  const list = window.BMGame && Array.isArray(window.BMGame.ACHIEVEMENTS) ? window.BMGame.ACHIEVEMENTS as { id: string }[] : null;
  return list ? { chapters, sections, achievements: list.map((a) => a.id) } : { chapters, sections };
}

/* Writes the plan for these stores. Synced stores are written quietly and then
   announced, as a sync announces what it merged ("state" for each, which an account
   that is signed in saves, then "sync", which every view redraws on). */
function take(stores: Stores, owner?: Owner): boolean {
  const Store = window.BMStore, Account = window.BMAccount;
  if (!Store || !Account || typeof Account.merge !== "function" || typeof Account.adopt !== "function") return false;
  const writes = plan(read, stores, { merge: Account.merge, adopt: Account.adopt }, owner);
  let ok = true;
  Object.keys(writes).forEach((k) => { if (!Store.write(k, writes[k], true)) ok = false; });
  const synced = Object.keys(SYNCED).map((f) => SYNCED[f]);
  Object.keys(writes).filter((k) => synced.indexOf(k) >= 0).forEach((k) => Store.emit({ type: "state", key: k }));
  Store.emit({ type: "sync" });
  return ok;
}

function flag(): unknown {
  try { return JSON.parse(String(window.localStorage.getItem(FLAG))); } catch (e) { return null; }
}
function record(print: string, took: boolean): void {
  try { window.localStorage.setItem(FLAG, JSON.stringify(remember(flag(), print, took, Date.now()))); } catch (e) { /* storage blocked: nothing could have been kept either */ }
}

/* the question for a payload that was read, and what follows the answer */
function offer(outcome: Outcome, title: string, subject: string, done: (took: boolean) => void): void {
  if (!outcome.ok) {
    note(subject + " was not brought over. " + REFUSED[outcome.why], true);
    done(false);
    return;
  }
  /* only what would be written is named: a setting this browser already has is not */
  const line = describe(summary(outcome.stores, outcome.owner, read));
  if (!line) {
    note(subject + " was not brought over. " + NOTHING_NEW);
    done(false);
    return;
  }
  ask(title, line, (yes) => {
    if (yes) {
      const ok = take(outcome.stores, outcome.owner);
      note(ok ? "Your progress is here. It was added to what this browser already had." : "Your progress could not be saved in this browser (its storage is full or blocked).", !ok);
    }
    done(yes);
  });
}

/* 1. a carried fragment */
async function arrived(): Promise<void> {
  const found = readHash(window.location.hash);
  if (!found || !allowedHost(window.location.hostname)) return;
  try {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + (found.at ? "#" + found.at : ""));
  } catch (e) { /* the address keeps the fragment; the record below still stops a second question */ }
  if (found.at) {
    const target = document.getElementById(found.at);
    if (target) target.scrollIntoView();
  }
  const print = fingerprint(found.value);
  if (asked(flag(), print) && !found.ask) return;
  const outcome = await decode(found.value, Date.now(), course());
  offer(outcome, "Bring over your progress from the old address?", "The progress in that link", (took) => record(print, took));
}

/* 2. the progress page's tools: where a carried link is read, and nowhere else, so the
   old address shows its readers nothing new while it still serves the course */
function tools(): void {
  const host = document.querySelector<HTMLElement>("[data-carry-tools]");
  if (!host || !allowedHost(window.location.hostname)) return;
  const old = host.querySelector<HTMLElement>("[data-carry-old]");
  const link = host.querySelector<HTMLAnchorElement>("[data-carry-link]");
  const asFile = host.querySelector<HTMLAnchorElement>("[data-carry-file-link]");
  if (old && link) {
    link.href = legacyCarryUrl(window.location.pathname);
    if (asFile) asFile.href = legacyCarryUrl(window.location.pathname, true);
    old.hidden = false;
  }
  const input = host.querySelector<HTMLInputElement>("[data-carry-file]");
  const status = host.querySelector<HTMLElement>("[data-carry-status]");
  const say = (text: string) => { if (status) status.textContent = text; };
  if (input) input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    say("");
    if (file.size > MAX_FILE) { offer({ ok: false, why: "size" }, "Import the progress in this file?", "That file", () => { input.value = ""; }); return; }
    file.text().then((text) => {
      offer(fromFile(text, Date.now(), course()), "Import the progress in this file?", "That file", (took) => {
        say(took ? "Imported " + file.name + "." : "Nothing was imported.");
        input.value = "";
      });
    }, () => { say("That file could not be read."); input.value = ""; });
  });
  host.hidden = false;
}

/* 3. what is true only at the new address */
function moved(): void {
  if (!allowedHost(window.location.hostname)) return;
  document.querySelectorAll<HTMLElement>("[data-carry-moved]").forEach((e) => { e.hidden = false; });
}

export const api = { arrived, tools, take };
if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.BMCarry = api;
  moved();
  tools();
  arrived().catch((e) => { if (window.console) console.error("[BM] carried progress", e); });
}
