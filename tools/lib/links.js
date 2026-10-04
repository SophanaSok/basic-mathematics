"use strict";
/* The link check, shared by check-static.js (the source tree) and check-dist.js (the
   built one): every relative href/src on every page resolves to a file inside the tree,
   and its #anchor to an id in that file. */
const path = require("path");

/* ids that exist only after JavaScript has run. Each pattern says where it comes from. */
const RUNTIME_IDS = [
  /* index.html: buildHome() in site.js writes <h2 id="part-<part.id>"> for each Part */
  { page: /^index\.html$/, id: /^part-[a-z0-9-]+$/ },
  /* every page: the skip link target is the <main id="main"> that is in the markup, but
     a generated sidebar on chapter pages also links #warmup / #practice (static ids) */
];

const EXTERNAL = /^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i;

/* the href/src references of one parsed page: [{ el, v, what }] */
function refsOf(doc) {
  const refs = [];
  for (const el of doc.elements()) {
    if (el.name === "a" && el.hasAttribute("href")) refs.push({ el, v: el.getAttribute("href"), what: "href" });
    if (el.name === "link" && el.hasAttribute("href")) refs.push({ el, v: el.getAttribute("href"), what: "link href" });
    if ((el.name === "script" || el.name === "img" || el.name === "iframe") && el.hasAttribute("src")) refs.push({ el, v: el.getAttribute("src"), what: "src" });
  }
  return refs;
}

/* a relative reference on `page` -> the tree-relative path of the file it names, or null
   for an external URL or a bare #anchor */
function targetOf(page, v) {
  if (!v || EXTERNAL.test(v)) return null;
  const filePart = v.split("#")[0].split("?")[0];
  if (!filePart) return null;
  const dir = path.posix.dirname(page);
  return path.posix.normalize(path.posix.join(dir === "." ? "" : dir, filePart));
}

/* @param tree  { pages: [rel], docs: { rel: parsed page }, exists: (rel) => boolean }
   @param r     a result: r.fail(msg), r.warn(msg), r.count */
function checkLinks(tree, r) {
  const idsOf = {};
  function ids(page) {
    if (!idsOf[page]) {
      const s = new Set();
      for (const el of tree.docs[page].elements()) if (el.id) s.add(el.id);
      idsOf[page] = s;
    }
    return idsOf[page];
  }
  tree.pages.forEach(page => {
    refsOf(tree.docs[page]).forEach(({ el, v, what }) => {
      if (!v || EXTERNAL.test(v)) return;
      r.count++;
      const hashAt = v.indexOf("#");
      const anchor = hashAt === -1 ? null : v.slice(hashAt + 1);
      const file = targetOf(page, v), target = file || page;
      if (file) {
        const where = page + ":" + el.line + ": " + what + " " + JSON.stringify(v);
        /* the site is served from a sub-path on GitHub Pages, where "/" is someone else's root */
        if (/^\//.test(v)) { r.fail(where + " is a root-absolute path"); return; }
        if (file === ".." || file.startsWith("../")) { r.fail(where + " -> " + file + " is outside the site"); return; }
        if (!tree.exists(file)) { r.fail(where + " -> " + file + " does not exist"); return; }
      }
      if (anchor !== null && anchor !== "") {
        let dec = anchor;
        try { dec = decodeURIComponent(anchor); } catch (e) { /* keep raw */ }
        if (!tree.docs[target]) { if (/\.html$/.test(target)) r.warn(page + ":" + el.line + ": anchor into " + target + " which is not a known page"); return; }
        if (ids(target).has(dec)) return;
        if (RUNTIME_IDS.some(a => a.page.test(target) && a.id.test(dec))) return;
        r.fail(page + ":" + el.line + ": " + what + " " + JSON.stringify(v) + " -> no id " + JSON.stringify(dec) + " in " + target);
      }
    });
  });
}

module.exports = { checkLinks, refsOf, targetOf, RUNTIME_IDS, EXTERNAL };
