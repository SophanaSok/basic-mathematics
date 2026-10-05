/* A name for every control, table header and heading whose content is a formula.

   KaTeX draws a formula twice: the picture (.katex-html, hidden from assistive
   technology) and MathML (.katex-mathml, hidden from the eye), which a screen reader
   reads in the flow of a paragraph. But an accessible name is plain text worked out from
   an element's content, and Chromium and axe-core take no text from a <math> element when
   they work it out: an opening-puzzle guess of "$(7,5)$" was a button with no name at
   all, a choice of "$x \le -3$" a radio button with none, a table header of "$\pi/6$"
   an empty header, and a guess of "$\tfrac52$ — five times as much" was announced as
   " — five times as much".

   So, in exactly those places (the elements in NAMED, whose name is their content), each
   formula gets its line of text from src/a11y/math-text.ts in a visually hidden span, and
   its MathML is hidden from assistive technology so that nothing is read twice. Nothing
   visible changes. Everywhere else the MathML is left as KaTeX wrote it.

   assets/site.js runs this after every renderMath (window.BMMathNames.name), so it covers
   what is typeset later too; a formula it has seen already is left alone, so running it
   twice over the same part of the page changes nothing. */

import { mathText, texOf } from "../a11y/math-text.ts";

/** the elements whose accessible name is computed from their content */
export const NAMED = [
  "button", "label", "th", "summary", "legend", "caption", "a[href]",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "[role=button]", "[role=tab]", "[role=link]", "[role=option]", "[role=columnheader]", "[role=rowheader]"
].join(", ");

/** the class of the hidden line; .visually-hidden (assets/site.css) does the hiding */
export const SAID = "math-said";

/** Gives every formula under root that sits in a NAMED element its line of text.
    Returns how many it named. */
export function name(root: ParentNode): number {
  let count = 0;
  root.querySelectorAll(".katex").forEach(k => {
    if (!k.closest(NAMED) || k.querySelector(":scope > ." + SAID)) return;
    const math = k.querySelector("math");
    const text = math ? mathText(math) || texOf(math) : (k.textContent || "").trim();
    if (!text) return;
    const said = document.createElement("span");
    said.className = "visually-hidden " + SAID;
    said.textContent = text;
    const mathml = k.querySelector(".katex-mathml");
    if (mathml) mathml.setAttribute("aria-hidden", "true");
    k.insertBefore(said, k.firstChild);
    count++;
  });
  return count;
}

/* What the page reaches through window.BMMathNames: site.js (a script that cannot import
   this module) calls name; mathText is a console and test handle. */
export const api = { name, mathText, NAMED };

if (typeof window !== "undefined") window.BMMathNames = api;
