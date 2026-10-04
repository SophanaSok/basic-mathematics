"use strict";
/* Progress keys and question fingerprints for the exercises of one chapter page.
   Mirrors assets/site.js initExercises (the block that assigns `key`): walk every
   element with class "ex" in document order; an inline exercise is keyed by its id
   or "i" + running inline count; a scored exercise by its id, or "e" + its position
   among the id-less scored exercises. Nothing else may influence the key. */

const { parse, normText, hash } = require("./html");

/* fingerprint = hash of the answer key and the question text; the same string is
   built in the browser by tools/suites/restore.js */
function fingerprintOf(answer, questionText) {
  return hash((answer || "") + "\u0000" + normText(questionText || ""));
}

/* @param {string|Node} src  page source, or an already-parsed document
   @returns {Array<{key, inline, id, type, kind, answer, fp, line, index, el}>} */
function exercisesOf(src) {
  const doc = typeof src === "string" ? parse(src) : src;
  let position = 0, inlineCount = 0;
  const out = [];
  doc.queryAll(".ex").forEach((ex, index) => {
    const inline = ex.hasAttribute("data-inline");
    let key;
    if (inline) { inlineCount++; key = ex.id || "i" + inlineCount; }
    else if (ex.id) key = ex.id;
    else { position++; key = "e" + position; }
    const q = ex.query(".ex-q");
    const answer = ex.getAttribute("data-answer") || "";
    const type = ex.getAttribute("data-type") || "exact";
    const choices = ex.query("ul.choices, ol.choices");
    const kind = choices ? (type === "multi" ? "multi" : "choice")
      : type === "order" || type === "blank" || type === "figure" ? type : "text";
    out.push({
      key, inline, id: ex.id, type, kind, answer, index, line: ex.line, el: ex,
      fp: fingerprintOf(answer, q ? q.textContent : "")
    });
  });
  return out;
}

module.exports = { exercisesOf, fingerprintOf };
