/* Progress brought from the old address, on the page: what src/carry/format.ts reads,
   asked about and written here.

   1. On any page of the new address (allowedHost: the new address, a local server, the
      project's pages.dev addresses), an address whose fragment carries bm-carry, as the
      legacy site's pages write it (src/carry/send.js). The fragment is taken out of the
      address at once (history.replaceState, so a reload or a bookmark does not bring it
      back; the old page's own fragment, bm-at, is put back and scrolled to, unless it
      is itself a payload: format.ts safeAt). That cleans the address bar and this tab's
      session history only: the browser has already written the arrival address, payload
      and all, to its own history, which it offers in suggestions and syncs wherever it
      syncs history (OPERATIONS.md section 8). It is the reader's signed-out progress and
      settings, never an account's, and an entry opened from there has no referrer and is
      not read. Then:
        - Reached from anywhere but the old address (fromLegacy: document.referrer's
          origin is not the legacy origin), or there on anything but the document's
          own first load (freshLoad: a reload, a step back or forward, a restored
          session, where the fragment may have been changed after the referrer was
          set), nothing more is done with it: it is not read, and the reader is told
          in a short note that progress is brought over from the progress page, by its
          file import or its link to the old address. (No other origin can change the
          fragment while the page is first loading: the site's
          Cross-Origin-Opener-Policy takes away any handle a page that opened the
          window had on it, tools/lib/headers.js.)
        - From the old address, the payload is read and checked, and add() works out
          what of it this browser does not have. The reader is asked, in a dialog made
          from add()'s own counts, before anything is kept. Yes runs add() again on
          what this browser holds by then and writes that (if it would now add
          something else, the reader is asked again about that); no leaves everything
          as it was. Either way this browser records the payload's fingerprint in
          bm.carry.v1, and the same payload arriving on its own (an old link opened
          again) is not asked about again; from the legacy carry page (bm-ask=1),
          which a reader only reaches by asking for it, it is asked about whatever was
          answered before, so a "no" can be taken back. A payload that cannot be read
          is refused with a short note; one that adds nothing is not asked about. When
          a yes could not be saved (storage full or blocked), nothing is recorded, so
          the same link asks again.
      When the old address had a signed-in account (the payload's `w`), the reader is
      told to sign in here with it: its progress comes from the account, never from
      the old browser.
   2. On the progress page, on the same hosts, the section [data-carry-tools]: links to
      the legacy carry page ([data-carry-old]; it exists only once SITE_CUTOVER has put
      the legacy site at the old address), which sends this browser's old progress back
      here by the same route, or as a file; and an import of the file "Download my data"
      makes (or the legacy carry page offers), which goes through the same checks,
      add() and question. A file is the reader's own choice, so it is not held to where
      it came from; it only adds, as a link does.
   3. On any page, on the same hosts, [data-carry-moved] (the about page's account of
      where the course is served from): shown here, and never at the old address.

   Nothing here runs BMAccount's merge on carried progress: add() only adds, and what it
   writes is announced as any change to saved state is ("state", then "sync"), which an
   account that is signed in saves as this browser's own, and one signed in later
   merges as it merges anything done here signed out; with accounts on, the question
   says so (ACCOUNT). Nothing carried is ever put
   into the page as HTML: every word is textContent. */

import { add, adds, allowedHost, asked, type Course, decode, describe, FLAG, fingerprint, freshLoad, fromFile, fromLegacy, legacyCarryUrl, MAX_FILE, readHash, remember, stored, SYNCED, type Outcome, type Refusal } from "../carry/format.ts";

type Answer = (take: boolean) => void;
/* how a question ended: taken and saved (true), not taken (false), or taken and not
   saved (null), which is not recorded, so that it is asked again */
type Done = (took: boolean | null) => void;

const REFUSED: Record<Refusal, string> = {
  version: "It was written by a different version of this site, so nothing was changed.",
  malformed: "It could not be read, so nothing was changed.",
  size: "It is larger than any progress this site writes, so nothing was changed.",
  keys: "It holds things that are not progress from this site, so nothing was changed.",
  unsupported: "This browser cannot unpack it, so nothing was changed. Try another browser, or bring your progress over as a file."
};
const NOTHING_NEW = "It holds nothing this browser does not already have, so nothing was changed.";
const SIGN_IN = "You were signed in at the old address: sign in here with the same account, and everything saved to it comes back. Progress from that browser belongs to the account and is not brought over here.";
const ACCOUNT = "If you sign in here, now or later, it joins your account like any progress made in this browser: where the account already has the same exercise, review section or Daily, the two are merged as from two devices.";
const NOT_FROM_OLD = "This link holds progress, but it did not come from the old address, so it was not read and nothing was changed. To bring your progress over, use Bring your progress here on your progress page.";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* the progress page's carry tools, from this page */
function progressPage(): string {
  const Site = window.BMSite as { rootPrefix?: () => string } | undefined;
  const root = Site && typeof Site.rootPrefix === "function" ? Site.rootPrefix() : "/";
  return new URL(root + "progress.html#carry", window.location.href).href;
}

/* the question: a modal dialog with the two answers; Escape is "no" */
function ask(title: string, line: string, signedIn: boolean, answer: Answer): HTMLDialogElement {
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
  dialog.append(h, el("p", "carry-what", line));
  if (signedIn) dialog.append(el("p", "carry-signed-in", SIGN_IN));
  if (accounts()) dialog.append(el("p", "carry-account", ACCOUNT));
  dialog.append(el("p", "fine", "This is only added to what this browser has here: nothing already here is changed or removed, and the old address keeps its copy."), actions);
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

/* whether this copy of the site has accounts (assets/config.js) */
function accounts(): boolean {
  const cfg = window.BM_CONFIG as { supabaseUrl?: unknown } | undefined;
  return !!cfg && typeof cfg.supabaseUrl === "string" && !!cfg.supabaseUrl;
}

/* a short note at the foot of the screen, closed by its button; `link` adds a link to
   the progress page's carry tools */
function note(text: string, bad?: boolean, link?: boolean): void {
  const old = document.querySelector(".carry-note");
  if (old) old.remove();
  const box = el("div", "carry-note" + (bad ? " bad" : ""));
  box.setAttribute("role", bad ? "alert" : "status");
  const close = el("button", "btn ghost small", "Close");
  close.type = "button";
  close.addEventListener("click", () => box.remove());
  const line = el("p", undefined, text);
  if (link) {
    const a = el("a", "carry-note-link", "Open your progress page");
    a.href = progressPage();
    line.append(" ", a);
  }
  box.append(line, close);
  document.body.appendChild(box);
}

/* What this browser holds under a key, as add() reads it (format.ts stored()):
   undefined where there is none; a value whose text is not exactly the JSON the site
   writes is passed as its text, which add() never writes over or into. Storage that
   cannot be read is treated as holding something under every key, so nothing is
   written over it either. */
const BLOCKED = "\u0000blocked";
function read(key: string): unknown {
  try { return stored(window.localStorage.getItem(key)); } catch (e) { return BLOCKED; }
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

/* Writes what add() returns now. Synced stores are written quietly and then announced,
   as a sync announces what it merged ("state" for each, which an account that is signed
   in saves, then "sync", which every view redraws on). */
function write(writes: Record<string, unknown>): boolean {
  const Store = window.BMStore;
  if (!Store) return false;
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
function record(print: string, took: boolean | null): void {
  if (took === null) return;
  try { window.localStorage.setItem(FLAG, JSON.stringify(remember(flag(), print, took, Date.now()))); } catch (e) { /* storage blocked: nothing could have been kept either */ }
}

/* The question for a payload that was read, and what follows the answer. The line asked
   is describe() of add()'s counts; yes writes add()'s writes, run again on what this
   browser holds then. Should that now add something other than what was asked about
   (another tab changed this browser's progress meanwhile), it is asked about again. */
function offer(outcome: Outcome, title: string, subject: string, done: Done): void {
  if (!outcome.ok) {
    note(subject + " was not brought over. " + REFUSED[outcome.why], true);
    done(false);
    return;
  }
  const first = add(read, outcome.stores);
  if (!adds(first.added)) {
    note(outcome.signedIn ? SIGN_IN : subject + " was not brought over. " + NOTHING_NEW);
    done(false);
    return;
  }
  const line = describe(first.added);
  ask(title, line, outcome.signedIn, (yes) => {
    if (!yes) { done(false); return; }
    const now = add(read, outcome.stores);
    if (describe(now.added) !== line) { offer(outcome, title, subject, done); return; }
    const ok = write(now.writes);
    note(ok ? "Your progress is here. It was added to what this browser already had." : "Your progress could not be saved in this browser (its storage is full or blocked). Make room and open the link again, or import it as a file.", !ok);
    done(ok ? true : null);
  });
}

function navigation(): unknown {
  try { return performance.getEntriesByType("navigation"); } catch (e) { return null; }
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
  /* only the old address sends progress, and only on the page's own first load: from
     anywhere else, or on a reload or a step back or forward, it is not even read */
  if (!fromLegacy(document.referrer, window.location.origin) || !freshLoad(navigation())) {
    if (found.value) note(NOT_FROM_OLD, false, true);
    return;
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
        say(took ? "Imported " + file.name + "." : took === null ? file.name + " could not be saved." : "Nothing was imported.");
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

export const api = { arrived, tools, write };
if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.BMCarry = api;
  moved();
  tools();
  arrived().catch((e) => { if (window.console) console.error("[BM] carried progress", e); });
}
