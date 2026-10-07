#!/usr/bin/env node
"use strict";
/* US English: the British spellings and the pound money left in what a reader is shown, and
   the lock that lets them only go (decision 0001: the course is rewritten once to US spelling
   and dollars; metric units stay, spelled the US way).

   Usage: node tools/us-english.js [files]                  list every spelling and money hit
          node tools/us-english.js --write [files]          rewrite the spelling hits to US
          node tools/us-english.js --report=wording [files] list the wording hits (report-only)
          node tools/us-english.js --shrink                 lower tools/us-english-allow.json to
                                                            what is found (never raises a count)

   With no files, every reader-facing file: the root pages and parts/<dir>/<page>.html, and
   the scripts under assets/, data/ and src/ but src/vendor/, tests (*.test.*, *.test-helper.*)
   and declaration files. Three lists:
     SPELLING  British word -> US word, matched as a whole word in any letter case. The check
               (`us-english` in check-static.js) counts these, and --write rewrites them with
               the original's capitals (Centre -> Center).
     MONEY     the pound sign (in math too), "pound", "pounds", "pence" and a price in pence
               ("10p"). Counted by the check; never written: a dollar in prose is $\$9$, not
               $9 (KaTeX would open a formula), so each one is rewritten by hand.
     WORDING   British words that are not misspellings (brackets, towards, tick ...).
               Report-only: never in the check or the allow file, never written.

   What counts as reader-facing, by context:
     pages     text, a <title>, and the values of the reader attributes (READER_ATTR); not
               comments, other attributes (id, class, data-answer, data-section, ...), <style>,
               or <code>/<pre>/<kbd>/<samp>, which are code (KaTeX skips them too)
     scripts   string literals and template text, read off rolldown's AST as check-static's
               pure-core check reads them, so no comment or identifier is ever seen. A string
               with no space that reads as a key ("lin-brackets", "bm.play.v1") is code, and so
               are object keys, operands of a comparison, `case` labels, computed member names,
               module names, and the names a DOM call takes (classList, getAttribute, ...).
               A string holding markup is read as markup: tag names and attributes other than
               the reader ones are code.
     both      math is not prose: $...$, $$...$$, \(...\), \[...\] as assets/site.js gives KaTeX,
               found as KaTeX's auto-render finds them (a backslash escapes inside math, nothing
               escapes outside it). In a script the formula is followed across the operands of
               one `+` chain (and a template): a string that is not a literal keeps the state, so
               "$: centre $" after "... = " + x reads ": centre " as prose. A word that is part
               of an identifier (camelCase, digits, underscores, a dot between letters) or of a
               URL is code. */

const fs = require("fs");
const path = require("path");
const site = require("./lib/site");
const { parseAst } = require("rolldown/parseAst");

const ROOT = site.ROOT;
const ALLOW_FILE = path.join(__dirname, "us-english-allow.json");

/* ------------------------------------------------------------ word lists -- */

const SPELLING = {};
/* every stem + suffix: British on the left, US on the right */
function family(brit, us, suffixes) { suffixes.forEach(s => { SPELLING[brit + s] = us + s; }); }

/* -our */
family("colour", "color", ["", "s", "ed", "ing", "ful", "less", "ation"]);
family("recolour", "recolor", ["", "s", "ed", "ing"]);
family("behaviour", "behavior", ["", "s", "al"]);
family("neighbour", "neighbor", ["", "s", "ing", "hood", "hoods", "ly"]);
family("favour", "favor", ["", "s", "ed", "ing", "able", "ably", "ite", "ites"]);
family("honour", "honor", ["", "s", "ed", "ing", "able"]);
family("labour", "labor", ["", "s", "ed", "ing", "er", "ers"]);
family("flavour", "flavor", ["", "s", "ed", "ing"]);
family("endeavour", "endeavor", ["", "s", "ed", "ing"]);
family("harbour", "harbor", ["", "s", "ed"]);
family("rumour", "rumor", ["", "s", "ed"]);
family("humour", "humor", ["", "s", "ed"]);
family("odour", "odor", ["", "s"]);
family("tumour", "tumor", ["", "s"]);
family("vapour", "vapor", ["", "s"]);
family("parlour", "parlor", ["", "s"]);
family("armour", "armor", ["", "ed"]);
["rigour", "vigour", "saviour", "candour", "splendour", "clamour", "valour"].forEach(w => family(w, w.replace(/our$/, "or"), [""]));
/* -re */
family("centre", "center", ["", "s"]);
family("epicentre", "epicenter", ["", "s"]);
Object.assign(SPELLING, { centred: "centered", centring: "centering" });
["", "kilo", "centi", "milli", "nano", "micro"].forEach(p => family(p + "metre", p + "meter", ["", "s"]));
["", "milli", "centi", "deci"].forEach(p => family(p + "litre", p + "liter", ["", "s"]));
["fibre", "theatre", "calibre", "sombre", "spectre", "lustre", "sabre", "meagre"].forEach(w => family(w, w.replace(/re$/, "er"), [""].concat(/^(fibre|theatre|spectre|sabre)$/.test(w) ? ["s"] : [])));
family("manoeuvre", "maneuver", ["", "s"]);
Object.assign(SPELLING, { manoeuvred: "maneuvered", manoeuvring: "maneuvering", manoeuvrable: "maneuverable" });
/* -ise, -isation */
["recognis", "realis", "organis", "reorganis", "summaris", "generalis", "normalis", "memoris", "rationalis",
  "characteris", "minimis", "maximis", "emphasis", "visualis", "standardis", "factoris", "randomis",
  "customis", "capitalis", "serialis", "deserialis", "localis", "prioritis", "optimis", "utilis", "finalis",
  "categoris", "authoris", "criticis", "apologis", "specialis", "symbolis", "parametris", "parameteris",
  "digitis", "harmonis", "stabilis", "equalis", "personalis", "hypothesis", "theoris", "vectoris",
  "discretis", "linearis", "polaris", "scrutinis", "familiaris", "tokenis", "sanitis", "materialis",
  "initialis", "synthesis", "centralis", "formalis", "idealis", "itemis", "modernis", "neutralis",
  "penalis", "popularis", "publicis", "sympathis", "empathis", "synchronis", "systematis", "regularis",
  "canonicalis", "conceptualis", "contextualis", "dramatis", "internalis", "italicis", "memorialis",
  "mobilis", "patronis", "socialis", "trivialis", "verbalis", "economis", "energis", "globalis",
  "humanis", "magnetis", "marginalis", "metabolis", "oxidis", "atomis", "totalis", "visualis"
].forEach(stem => family(stem, stem.replace(/is$/, "iz"), ["e", "es", "ed", "ing", "ation", "ations", "er", "ers", "able"]));
/* -yse ("analyses" is also the plural of analysis, in both) */
["analys", "paralys", "catalys", "electrolys", "hydrolys", "dialys"].forEach(stem => family(stem, stem.replace(/ys$/, "yz"), ["e", "ed", "ing", "er", "ers"]));
/* a doubled l before -ed, -ing, -er (cancellation keeps both: it is US too) */
["travel", "label", "relabel", "cancel", "model", "level", "signal", "total", "fuel", "refuel", "counsel",
  "marvel", "channel", "tunnel", "dial", "duel", "jewel", "quarrel", "shovel", "funnel", "pencil", "rival",
  "equal", "grovel", "revel", "ravel", "unravel", "panel", "parcel", "spiral", "pedal", "initial", "barrel",
  "bevel", "chisel", "gravel", "libel", "snivel", "stencil", "swivel", "towel", "yodel"
].forEach(base => ["ed", "ing", "er", "ers"].forEach(s => { SPELLING[base + "l" + s] = base + s; }));
Object.assign(SPELLING, {
  counsellor: "counselor", counsellors: "counselors", marvellous: "marvelous", marvellously: "marvelously",
  jewellery: "jewelry", medallist: "medalist", medallists: "medalists",
  /* -ll / -l */
  fulfil: "fulfill", fulfils: "fulfills", fulfilment: "fulfillment", enrol: "enroll", enrols: "enrolls",
  enrolment: "enrollment", enrolments: "enrollments", instil: "instill", instils: "instills",
  skilful: "skillful", skilfully: "skillfully", wilful: "willful", wilfully: "willfully",
  instalment: "installment", instalments: "installments",
  /* -ce / -se */
  licence: "license", licences: "licenses", defence: "defense", defences: "defenses", offence: "offense",
  offences: "offenses", pretence: "pretense",
  practise: "practice", practises: "practices", practised: "practiced", practising: "practicing",
  /* -ogue */
  analogue: "analog", analogues: "analogs", catalogue: "catalog", catalogues: "catalogs", catalogued: "cataloged",
  /* one word each */
  grey: "gray", greys: "grays", greyed: "grayed", greying: "graying", greyish: "grayish", greyscale: "grayscale",
  programme: "program", programmes: "programs", maths: "math",
  judgement: "judgment", judgements: "judgments", acknowledgement: "acknowledgment", acknowledgements: "acknowledgments",
  whilst: "while", amongst: "among", learnt: "learned", spelt: "spelled",
  anticlockwise: "counterclockwise", ageing: "aging", storey: "story", storeys: "stories",
  cheque: "check", cheques: "checks", tyre: "tire", tyres: "tires", aluminium: "aluminum",
  sceptic: "skeptic", sceptics: "skeptics", sceptical: "skeptical", scepticism: "skepticism",
  aeroplane: "airplane", aeroplanes: "airplanes", mould: "mold", moulds: "molds", moulded: "molded",
  moulding: "molding", plough: "plow", ploughs: "plows", ploughed: "plowed", sulphur: "sulfur",
  draught: "draft", draughts: "drafts", gramme: "gram", grammes: "grams", kilogramme: "kilogram",
  kilogrammes: "kilograms", encyclopaedia: "encyclopedia", artefact: "artifact", artefacts: "artifacts",
  speciality: "specialty", focussed: "focused", focussing: "focusing", pyjamas: "pajamas", cosy: "cozy",
  /* vocabulary: in US usage a trapezium has no parallel sides at all */
  trapezium: "trapezoid", trapeziums: "trapezoids", trapezia: "trapezoids"
});

/* whole words that are money, with the pound sign and a price in pence found apart */
const MONEY_WORDS = new Set(["pound", "pounds", "pence"]);

/* report-only: [pattern, US wording]; the pattern is matched in prose with math taken out */
const WORDING = [
  [/(?<!\b(?:square|curly|angle|angled)\s+)\bbracket(?:s|ed)?\b/gi, "parentheses"],
  [/\btowards\b/gi, "toward"],
  [/\bti(?:ck|cks|cked|cking)\b(?!\s+marks?\b)/gi, "check"],
  [/\bpavements?\b/gi, "sidewalk"],
  [/\bcosts?\s+marks\b/gi, "loses points"],
  [/\bcinemas?\b/gi, "movie theater"],
  [/\bstalls?\b/gi, "stand"]
];

/* ------------------------------------------------------------ the files -- */

const SCRIPT = /\.[cm]?[jt]sx?$/;
const NOT_READER = /\.(test|test-helper)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/;

/* true for a repo-relative path whose text a reader is shown (see the head of this file) */
function isScanned(rel) {
  if (/^[^/]+\.html$/i.test(rel) || /^parts\/[^/]+\/[^/]+\.html$/i.test(rel)) return true;
  return /^(assets|data|src)\//.test(rel) && !/^src\/vendor\//.test(rel) && SCRIPT.test(rel) && !NOT_READER.test(rel);
}

/* every reader-facing file of a tree, repo-relative and sorted */
function scannedFiles(root) {
  root = root || ROOT;
  const out = site.htmlPages(root);
  ["assets", "data", "src"].forEach(d => site.walk(path.join(root, d), p => SCRIPT.test(p), []).forEach(p => {
    const rel = path.relative(root, p).split(path.sep).join("/");
    if (isScanned(rel)) out.push(rel);
  }));
  return out.sort();
}

/* --------------------------------------------------------------- texts -- */

/* A text is { text, at }: characters and, for each one, its offset in the file (-1 for a
   character no file holds: the stand-in for an operand that is not a literal). */
const GAP = "\uffff";

function slice(src, from, to) {
  const at = [];
  for (let i = from; i < to; i++) at.push(i);
  return { text: src.slice(from, to), at };
}

/* a JS string's or template's raw body as its value, each character with its offset */
function cook(raw, base) {
  let text = "";
  const at = [];
  const put = (s, off) => { for (let k = 0; k < s.length; k++) { text += s[k]; at.push(off); } };
  for (let i = 0; i < raw.length;) {
    if (raw[i] !== "\\") { put(raw[i], base + i); i++; continue; }
    const d = raw[i + 1];
    let len = 2, ch;
    if (d === "u" && raw[i + 2] === "{") { const e = raw.indexOf("}", i); ch = String.fromCodePoint(parseInt(raw.slice(i + 3, e), 16)); len = e - i + 1; }
    else if (d === "u") { ch = String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16)); len = 6; }
    else if (d === "x") { ch = String.fromCharCode(parseInt(raw.slice(i + 2, i + 4), 16)); len = 4; }
    else if (d === "\n" || d === "\u2028" || d === "\u2029") ch = "";
    else if (d === "\r") { ch = ""; len = raw[i + 2] === "\n" ? 3 : 2; }
    else ch = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" }[d] || d;
    put(ch, base + i);
    i += len;
  }
  return { text, at };
}

/* ---------------------------------------------------- markup and math -- */

const READER_ATTR = /^(data-hint\d*|data-label|data-placeholder|placeholder|title|alt|aria-label|aria-description|aria-roledescription|aria-valuetext)$/;
const CODE_TAGS = new Set(["code", "pre", "kbd", "samp"]);
const RAW_TAGS = new Set(["script", "style", "textarea", "title"]);
const MATH = [["$$", "$$"], ["\\[", "\\]"], ["$", "$"], ["\\(", "\\)"]];

/* findEndOfMath of KaTeX's auto-render: the closing delimiter at brace level 0, a backslash
   escaping the character after it */
function endOfMath(right, text, from, to) {
  let level = 0;
  for (let i = from; i < to; i++) {
    if (level <= 0 && text.startsWith(right, i) && i + right.length <= to) return i;
    if (text[i] === "\\") i++;
    else if (text[i] === "{") level++;
    else if (text[i] === "}") level--;
  }
  return -1;
}
/* marks math[i] for every character of text[from, to) that KaTeX would take as a formula;
   `open`: the text starts inside an inline formula */
function markMath(text, from, to, math, open) {
  let i = from;
  if (open) {
    const end = endOfMath("$", text, from, to);
    const stop = end === -1 ? to : end + 1;
    for (let k = from; k < stop; k++) math[k] = true;
    i = stop;
  }
  while (i < to) {
    let j = i, d = null;
    for (; j < to && !d; j++) d = MATH.find(m => text.startsWith(m[0], j));
    if (!d) return;
    j--;
    const end = endOfMath(d[1], text, j + d[0].length, to);
    if (end === -1) return;
    for (let k = j; k < end + d[1].length; k++) math[k] = true;
    i = end + d[1].length;
  }
}

/* The parts of a text a reader is shown, read as HTML: [{ from, to }] runs of text (each a
   text node, the unit KaTeX looks for formulas in) and of reader attribute values, and
   [{ from, to }] script bodies. Tags, other attributes, comments, <style> and code elements
   are left out. */
function markup(text) {
  const runs = [], scripts = [];
  const n = text.length;
  let i = 0, start = 0, code = 0;
  const flush = (to) => { if (!code && to > start) runs.push({ from: start, to }); };
  const TAG = /<(\/?)([A-Za-z][\w:-]*)/y, ATTR = /[^\s"'>\/=]+/y;
  while (i < n) {
    if (text[i] !== "<") { i++; continue; }
    if (text.startsWith("<!--", i)) {
      flush(i);
      const end = text.indexOf("-->", i + 4);
      i = start = end === -1 ? n : end + 3;
      continue;
    }
    if (text[i + 1] === "!" || text[i + 1] === "?") {
      flush(i);
      const end = text.indexOf(">", i);
      i = start = end === -1 ? n : end + 1;
      continue;
    }
    TAG.lastIndex = i;
    const m = TAG.exec(text);
    if (!m) { i++; continue; }
    flush(i);
    const closing = !!m[1], name = m[2].toLowerCase();
    let j = i + m[0].length;
    const attrs = [];
    while (j < n && text[j] !== ">") {
      ATTR.lastIndex = j;
      const am = ATTR.exec(text);
      if (!am) { j++; continue; }
      const attr = { name: am[0].toLowerCase(), value: "" };
      attrs.push(attr);
      j += am[0].length;
      let k = j;
      while (k < n && /\s/.test(text[k])) k++;
      if (text[k] !== "=") continue;
      k++;
      while (k < n && /\s/.test(text[k])) k++;
      const q = text[k];
      let from = k, to;
      if (q === '"' || q === "'") { from = k + 1; to = text.indexOf(q, from); if (to === -1) to = n; j = Math.min(n, to + 1); }
      else { to = k; while (to < n && !/[\s>]/.test(text[to])) to++; j = to; }
      Object.assign(attr, { value: text.slice(from, to), from, to });
    }
    if (!closing && !code) {
      const meta = name === "meta" && attrs.some(a => (a.name === "name" || a.name === "property") && /description|title/i.test(a.value));
      attrs.forEach(a => { if (a.from !== undefined && (READER_ATTR.test(a.name) || (meta && a.name === "content"))) runs.push({ from: a.from, to: a.to }); });
    }
    i = start = Math.min(n, j + 1);
    if (!closing && RAW_TAGS.has(name)) {
      const close = new RegExp("</" + name + "\\s*>", "ig");
      close.lastIndex = i;
      const cm = close.exec(text);
      const end = cm ? cm.index : n;
      const type = (attrs.find(a => a.name === "type") || { value: "" }).value;
      if (name === "script" && (!type || /^(module|text\/javascript)$/i.test(type))) scripts.push({ from: i, to: end });
      else if ((name === "title" || name === "textarea") && !code && end > i) runs.push({ from: i, to: end });
      i = start = cm ? end + cm[0].length : n;
      continue;
    }
    if (CODE_TAGS.has(name)) code = Math.max(0, code + (closing ? -1 : 1));
  }
  flush(n);
  return { runs, scripts };
}

/* ---------------------------------------------------------- the words -- */

const URL_LIKE = /\b(?:https?:\/\/|mailto:|www\.)[^\s"'<>)]*/gi;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi;
const IDENT_CHAR = /[A-Za-z0-9_$]/;

/* The hits in one run of reader text: { kind, form, us, i, len } with i an index into
   text. `math` marks formula characters; only the pound sign is looked for inside one. */
function wordsOf(text, from, to, math, kinds) {
  const out = [];
  const skip = new Array(to - from).fill(false);
  const blank = (re) => { re.lastIndex = 0; let m; const s = text.slice(from, to); while ((m = re.exec(s))) for (let k = 0; k < m[0].length; k++) skip[m.index + k] = true; };
  blank(URL_LIKE);
  const s = text.slice(from, to);
  ENTITY.lastIndex = 0;
  let em;
  while ((em = ENTITY.exec(s))) {
    for (let k = 0; k < em[0].length; k++) skip[em.index + k] = true;
    if (kinds.money && /^(pound|#163|#xa3)$/i.test(em[1])) out.push({ kind: "money", form: "£", us: "$", i: from + em.index, len: em[0].length });
  }
  const live = (k) => !skip[k - from] && !math[k];
  if (kinds.money) for (let k = from; k < to; k++) if (text[k] === "£" && !skip[k - from]) out.push({ kind: "money", form: "£", us: "$", i: k, len: 1 });
  if (kinds.spelling || kinds.money) {
    const W = /[A-Za-z]+/g;
    W.lastIndex = from;
    let m;
    while ((m = W.exec(text)) && m.index < to) {
      const a = m.index, b = Math.min(to, a + m[0].length), word = text.slice(a, b);
      if (!live(a)) continue;
      const before = text[a - 1] || "", after = text[b] || "";
      /* a price in pence: digits (a decimal point among them), then p, then no letter */
      if (word === "p" && /\d/.test(before) && !IDENT_CHAR.test(after)) {
        let c = a - 1;
        while (c >= from && /[\d.]/.test(text[c])) c--;
        if (c < from || !/[A-Za-z_$.]/.test(text[c])) {
          if (kinds.money) out.push({ kind: "money", form: text.slice(c + 1, b).toLowerCase(), us: "cents", i: c + 1, len: b - c - 1 });
        }
        continue;
      }
      /* part of an identifier: next to a digit, _ or $, a dot between letters, or camelCase */
      if (a > from && (IDENT_CHAR.test(before) || (before === "." && /[A-Za-z0-9]/.test(text[a - 2] || "")))) continue;
      if (IDENT_CHAR.test(after) || (after === "." && /[A-Za-z0-9]/.test(text[b + 1] || "") && b + 1 < to)) continue;
      if (/[a-z][A-Z]/.test(word)) continue;
      const lower = word.toLowerCase();
      if (kinds.spelling && Object.prototype.hasOwnProperty.call(SPELLING, lower)) out.push({ kind: "spelling", form: lower, us: matchCase(word, SPELLING[lower]), i: a, len: b - a });
      else if (kinds.money && MONEY_WORDS.has(lower)) out.push({ kind: "money", form: lower, us: lower === "pence" ? "cents" : "dollars", i: a, len: b - a });
    }
  }
  if (kinds.wording) {
    let prose = "";
    for (let k = from; k < to; k++) prose += live(k) ? text[k] : " ";
    WORDING.forEach(([re, us]) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(prose))) out.push({ kind: "wording", form: m[0].toLowerCase().replace(/\s+/g, " "), us, i: from + m.index, len: m[0].length });
    });
  }
  return out;
}

/* the US word in the original's capitals */
function matchCase(orig, us) {
  if (orig.length > 1 && orig === orig.toUpperCase()) return us.toUpperCase();
  if (orig[0] !== orig[0].toLowerCase()) return us[0].toUpperCase() + us.slice(1);
  return us;
}

/* The hits of one text read as markup (a page, or the value a script's `+` chain builds):
   each with the file offset of its first character, `at`, and whether the file holds it
   as written (`whole`), which --write needs. `open`: the text starts inside a formula.
   @returns {{ hits, gaps: { [index]: "math" | "prose" | "code" }, scripts }} */
function textHits(t, kinds, open) {
  const { runs, scripts } = markup(t.text);
  const math = new Array(t.text.length).fill(false);
  const reader = new Array(t.text.length).fill(false);
  const hits = [];
  runs.forEach((r, n) => {
    markMath(t.text, r.from, r.to, math, open && n === 0 && r.from === 0);
    for (let k = r.from; k < r.to; k++) reader[k] = true;
    wordsOf(t.text, r.from, r.to, math, kinds).forEach(h => {
      const first = t.at[h.i], last = t.at[h.i + h.len - 1];
      hits.push(Object.assign(h, { at: first, whole: first >= 0 && last - first === h.len - 1 }));
    });
  });
  const gaps = {};
  for (let k = 0; k < t.text.length; k++) if (t.text[k] === GAP) gaps[k] = !reader[k] ? "code" : math[k] ? "math" : "prose";
  return { hits, gaps, scripts };
}

/* ------------------------------------------------------------- scripts -- */

/* names whose string arguments are names, not words: the first argument of each, all of
   them for classList's */
const NAME_CALLS = new Set(["getAttribute", "setAttribute", "hasAttribute", "removeAttribute", "toggleAttribute",
  "addEventListener", "removeEventListener", "querySelector", "querySelectorAll", "getElementById",
  "getElementsByClassName", "getElementsByTagName", "closest", "matches", "createElement", "createElementNS", "require"]);
const COMPARE = new Set(["===", "!==", "==", "!=", "in", "instanceof"]);
const TS_EXPRESSION = new Set(["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "TSInstantiationExpression"]);

/* a string that is a key, a class, an id or a path, not words: no space, and a hyphen, a dot,
   an underscore, a digit or a capital after a small letter somewhere in it */
function isKey(text) {
  const s = text.split(GAP).join("");
  return !/\s/.test(s) && /^[A-Za-z0-9_$.#:\[\]=\/@%-]*$/.test(s) && /[-_.#:\[\]=\/@%\d]|[a-z][A-Z]/.test(s);
}

/* the hits in a script's strings; `base` is the script's offset in its file */
function scriptHits(src, file, base, kinds) {
  const lang = (/\.[cm]?([jt]sx?)$/.exec(file) || [null, "js"])[1];
  const ast = parseAst(src, { lang: file.endsWith(".html") ? "js" : lang }, file);
  const hits = [];
  const isStr = (n) => n && n.type === "Literal" && typeof n.value === "string";
  const unwrap = (n) => (n && n.type === "ParenthesizedExpression" ? unwrap(n.expression) : n);

  /* the operands of one + chain, templates opened up, in order */
  const flatten = (n, out) => {
    n = unwrap(n);
    if (n.type === "BinaryExpression" && n.operator === "+") { flatten(n.left, out); flatten(n.right, out); }
    else if (n.type === "TemplateLiteral") n.quasis.forEach((q, i) => { out.push(q); if (i < n.expressions.length) out.push(n.expressions[i]); });
    else out.push(n);
    return out;
  };
  /* a chain read as one text, a literal as its value and anything else as GAP; then what a
     conditional's or a fallback's branches would put in each gap is read the same way,
     from the state the gap is in (in a formula, in prose, or in markup: not read) */
  const chain = (parts, open) => {
    let text = "";
    const at = [], gaps = [];
    parts.forEach(p => {
      if (isStr(p)) { const c = cook(src.slice(p.start + 1, p.end - 1), base + p.start + 1); text += c.text; at.push.apply(at, c.at); }
      else if (p.type === "TemplateElement") { const c = cook(p.value.raw, base + p.start + 1); text += c.text; at.push.apply(at, c.at); }
      else { gaps.push({ node: p, index: text.length }); text += GAP; at.push(-1); }
    });
    const key = isKey(text);
    const r = key ? { hits: [], gaps: {} } : textHits({ text, at }, kinds, open);
    r.hits.forEach(h => hits.push(h));
    gaps.forEach(g => {
      const state = key ? "code" : r.gaps[g.index];
      const n = unwrap(g.node);
      if (n.type === "ConditionalExpression") { visit(n.test); branch(n.consequent, state); branch(n.alternate, state); }
      else if (n.type === "LogicalExpression") { branch(n.left, state); branch(n.right, state); }
      else visit(n);
    });
  };
  const branch = (n, state) => {
    n = unwrap(n);
    const parts = isStr(n) || n.type === "TemplateLiteral" || (n.type === "BinaryExpression" && n.operator === "+") ? flatten(n, []) : null;
    if (!parts) { visit(n); return; }
    if (state === "code") { parts.forEach(p => { if (!isStr(p) && p.type !== "TemplateElement") visit(p); }); return; }
    chain(parts, state === "math");
  };
  const visit = (n) => {
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (!n || typeof n !== "object" || typeof n.type !== "string") return;
    n = unwrap(n);
    if (/^TS/.test(n.type) && !TS_EXPRESSION.has(n.type)) return;
    if (n.type === "ImportDeclaration" || n.type === "ExportAllDeclaration") return;
    if (n.type === "JSXText") { const c = slice(src, n.start, n.end); c.at = c.at.map(x => x + base); hits.push.apply(hits, textHits(c, kinds, false).hits); return; }
    if (isStr(n) || n.type === "TemplateLiteral" || (n.type === "BinaryExpression" && n.operator === "+")) { chain(flatten(n, []), false); return; }
    if (n.type === "Property" || n.type === "MethodDefinition" || n.type === "PropertyDefinition") { if (n.computed) visit(n.key); visit(n.value); return; }
    if (n.type === "MemberExpression") { visit(n.object); if (n.computed && !isStr(unwrap(n.property))) visit(n.property); return; }
    if (n.type === "BinaryExpression" && COMPARE.has(n.operator)) { [n.left, n.right].forEach(x => { if (!isStr(unwrap(x))) visit(x); }); return; }
    if (n.type === "SwitchCase") { if (n.test && !isStr(unwrap(n.test))) visit(n.test); visit(n.consequent); return; }
    if (n.type === "ImportExpression" || (n.type === "ExportNamedDeclaration" && n.source)) { visit(n.declaration); return; }
    if (n.type === "CallExpression" || n.type === "NewExpression") {
      const callee = unwrap(n.callee);
      const name = callee.type === "Identifier" ? callee.name : callee.type === "MemberExpression" && !callee.computed ? callee.property.name : null;
      const classList = callee.type === "MemberExpression" && unwrap(callee.object).type === "MemberExpression" && !unwrap(callee.object).computed && unwrap(callee.object).property.name === "classList";
      visit(callee);
      n.arguments.forEach((a, i) => { if (isStr(unwrap(a)) && (classList || (NAME_CALLS.has(name) && i === 0) || (name === "createElementNS" && i < 2))) return; visit(a); });
      return;
    }
    Object.keys(n).forEach(k => { if (k !== "type" && k !== "start" && k !== "end") visit(n[k]); });
  };
  visit(ast);
  return hits;
}

/* ---------------------------------------------------------------- files -- */

/* every hit of one file's source: [{ kind, form, us, line, at, len, whole }] by offset */
function scanText(src, file, kinds) {
  kinds = kinds || { spelling: true, money: true };
  let hits;
  if (/\.html$/i.test(file)) {
    const r = textHits(slice(src, 0, src.length), kinds, false);
    hits = r.hits;
    r.scripts.forEach(s => { hits = hits.concat(scriptHits(src.slice(s.from, s.to), file, s.from, kinds)); });
  } else hits = scriptHits(src, file, 0, kinds);
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  const lineOf = (at) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= at) lo = mid; else hi = mid - 1; } return lo + 1; };
  return hits.sort((a, b) => a.at - b.at).map(h => ({ kind: h.kind, form: h.form, us: h.us, line: h.at >= 0 ? lineOf(h.at) : 0, at: h.at, len: h.len, whole: h.whole }));
}

/* the file with its spelling hits written in US English (money and wording never are)
   @returns {{ text, changed: [hit], left: [hit] }} left: hits whose characters the file
   does not hold as one run (an escape or an entity in the word), to edit by hand */
function rewrite(src, file) {
  const hits = scanText(src, file, { spelling: true });
  const changed = hits.filter(h => h.whole), left = hits.filter(h => !h.whole);
  let text = src;
  changed.slice().sort((a, b) => b.at - a.at).forEach(h => {
    text = text.slice(0, h.at) + matchCase(text.slice(h.at, h.at + h.len), SPELLING[h.form]) + text.slice(h.at + h.len);
  });
  return { text, changed, left };
}

/* {file: {form: count}} of the check's hits (spelling and money), files and forms sorted */
function countsOf(byFile) {
  const out = {};
  Object.keys(byFile).sort().forEach(f => {
    const c = {};
    byFile[f].filter(h => h.kind !== "wording").forEach(h => { c[h.form] = (c[h.form] || 0) + 1; });
    const keys = Object.keys(c).sort();
    if (keys.length) { out[f] = {}; keys.forEach(k => { out[f][k] = c[k]; }); }
  });
  return out;
}

/* What is wrong between the hits found and the allowances: a form found more often than
   allowed (new British spelling or money in reader text), and an allowance higher than what
   is found (the list only shrinks), or one that is not a positive whole number.
   byFile: {file: [hit]}; allow: {file: {form: count}}  @returns {string[]} */
function lockProblems(byFile, allow) {
  const out = [];
  const rel = path.relative(ROOT, ALLOW_FILE);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const files = new Set(Object.keys(byFile).concat(Object.keys(allow)));
  Array.from(files).sort().forEach(f => {
    const hits = (byFile[f] || []).filter(h => h.kind !== "wording");
    const allowed = has(allow, f) ? allow[f] : {};
    if (has(allow, f) && (!allowed || typeof allowed !== "object" || !Object.keys(allowed).length)) { out.push(rel + ": " + f + " has no forms; take the file off the list"); return; }
    const forms = new Set(hits.map(h => h.form).concat(Object.keys(allowed)));
    Array.from(forms).sort().forEach(form => {
      const these = hits.filter(h => h.form === form);
      const a = has(allowed, form) ? allowed[form] : 0;
      if (!Number.isInteger(a) || a < 1) { if (has(allowed, form)) { out.push(rel + ": " + f + " allows " + JSON.stringify(form) + " " + JSON.stringify(a) + " times; an allowance is a whole number, 1 or more"); return; } }
      if (these.length > a) {
        const h = these[0];
        out.push(f + ":" + these.map(x => x.line).join(",") + ": " + JSON.stringify(form) + " " + these.length + " times, " + a + " allowed: " +
          (h.kind === "money" ? "money is in dollars and cents (a dollar in prose is $\\$9$, never a bare $9, which KaTeX opens as a formula)" : "write " + JSON.stringify(h.us) + " (US English)"));
      } else if (these.length < a) {
        out.push(rel + ": " + f + " allows " + JSON.stringify(form) + " " + a + " times, " + these.length + " found: lower it to " + these.length + (these.length ? "" : " (take it off)") + ", so the list only shrinks (node tools/us-english.js --shrink)");
      }
    });
  });
  return out;
}

/* the scan of a tree against an allow list (check-static's `us-english`)
   @returns {{ files: string[], byFile, allow, problems: string[] }} */
function check(root, allowFile) {
  root = root || ROOT;
  const files = scannedFiles(root);
  const byFile = {}, unread = [];
  files.forEach(f => {
    try { byFile[f] = scanText(fs.readFileSync(path.join(root, f), "utf8"), f); }
    catch (e) { unread.push(f + ": does not parse, so its strings cannot be read: " + String(e.message).split("\n").slice(0, 3).join(" ")); }
  });
  const allow = JSON.parse(fs.readFileSync(allowFile || ALLOW_FILE, "utf8"));
  /* a file that could not be read is not held to its allowances either */
  const held = Object.fromEntries(Object.keys(allow).filter(f => !unread.some(u => u.startsWith(f + ":"))).map(f => [f, allow[f]]));
  return { files, byFile, allow, problems: unread.concat(lockProblems(byFile, held)) };
}

/* ----------------------------------------------------------------- main -- */

function main() {
  const opts = site.parseArgs(process.argv.slice(2));
  const named = opts._.map(a => path.relative(ROOT, path.resolve(a)).split(path.sep).join("/"));
  named.filter(f => !isScanned(f)).forEach(f => console.error("skip  " + f + ": not a reader-facing file"));
  const files = named.length ? named.filter(isScanned) : scannedFiles(ROOT);
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const where = (f, h) => f + ":" + h.line + ": " + h.form + " -> " + h.us;

  if (opts.shrink) {
    const found = countsOf(Object.fromEntries(scannedFiles(ROOT).map(f => [f, scanText(read(f), f)])));
    const allow = JSON.parse(fs.readFileSync(ALLOW_FILE, "utf8"));
    const out = {};
    Object.keys(allow).sort().forEach(f => Object.keys(allow[f]).sort().forEach(form => {
      const n = Math.min(allow[f][form], (found[f] || {})[form] || 0);
      if (n > 0) (out[f] = out[f] || {})[form] = n;
    }));
    fs.writeFileSync(ALLOW_FILE, JSON.stringify(out, null, 2) + "\n");
    console.log("wrote " + path.relative(ROOT, ALLOW_FILE) + ": " + Object.keys(out).length + " files");
    return;
  }
  if (opts.report !== undefined) {
    if (opts.report !== "wording") { console.error("--report takes `wording`"); process.exit(2); }
    let n = 0;
    files.forEach(f => scanText(read(f), f, { wording: true }).forEach(h => { n++; console.log(where(f, h) + " (wording, report-only)"); }));
    console.log(n + " wording hits in " + files.length + " files");
    return;
  }
  if (opts.write) {
    let n = 0, left = 0;
    files.forEach(f => {
      const r = rewrite(read(f), f);
      r.changed.forEach(h => console.log("write " + where(f, h)));
      r.left.forEach(h => console.log("left  " + where(f, h) + " (an escape or entity inside the word: edit it by hand)"));
      if (r.changed.length) fs.writeFileSync(path.join(ROOT, f), r.text);
      n += r.changed.length; left += r.left.length;
    });
    console.log(n + " spellings written" + (left ? ", " + left + " left to edit by hand" : "") + "; money and wording are edited by hand");
    return;
  }
  let n = 0;
  files.forEach(f => scanText(read(f), f).forEach(h => { n++; console.log(where(f, h) + " (" + h.kind + ")"); }));
  console.log(n + " hits in " + files.length + " files");
}

if (require.main === module) main();
module.exports = { SPELLING, MONEY_WORDS, WORDING, ALLOW_FILE, isScanned, scannedFiles, scanText, rewrite, countsOf, lockProblems, check };
