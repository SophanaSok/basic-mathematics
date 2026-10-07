"use strict";
/* An in-process static server for the built site, on a free port.
   GET /<path>           the file under `root`: the build in dist/ (lib/target.js picks it)
   GET /__base/<path>    the same path at the base git ref (via `git show`), so a page
                         at the previous commit can be loaded for comparison without
                         a second checkout. Its relative asset links resolve under
                         /__base/ too, so the whole old site is browsable there.
   The tree under `root` is served as it is: a build is whole pages. A page that still
   carries a shell marker there (lib/shell.js) is not a page a reader could get, and is
   refused with a 500 saying so rather than served half-written. A page at the base ref
   is served as a reader of that commit got it: whole, or written by that commit's own
   lib/shell.js where it is marked (lib/site.js shellAt).
   Served as Cloudflare Pages serves the build (lib/headers.js): where the tree holds a
   _headers file, every response of the tree gets the headers its rules give the path
   asked for, the Content-Security-Policy first among them, so every browser check runs
   under the policy readers get, and a script or style the policy does not allow is a
   console error that fails it (lib/browser.js); and a page is found without its .html
   too (/about serves about.html), as Pages serves it. Nothing from /__base/ or an extra
   root gets them: an old commit and the test fixtures are not the site being checked.
   Options:
     gitRoot      the checkout `git show` runs in (default: root). Needed when root is
                  dist/, which holds built files and is not what the ref names.
     extraRoots   { "/url/prefix/": directory }: paths under the prefix are read from
                  that directory instead of root. The test fixtures are served this way,
                  from the source tree, so they never have to be copied into dist/. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const git = require("./git");
const shell = require("./shell");
const site = require("./site");
const headers = require("./headers");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".map": "application/json", ".xml": "application/xml", ".webmanifest": "application/manifest+json"
};

/* What goes out for an HTML file read at a git ref: whole as it is, or, where it
   carries a marker, written by that commit's own lib/shell.js.
   @throws what the shell throws for a page it cannot write, and for a marked page of
           a commit that has no shell */
function atRef(body, rel, gitRoot, base) {
  if (!/\.html$/i.test(rel)) return body;
  const text = body.toString("utf8");
  if (!shell.isMarked(text)) return body;
  const write = site.shellAt(gitRoot, base);
  if (!write) throw new Error(rel + " carries a shell marker, but that commit has no tools/lib/shell.js");
  return Buffer.from(write.renderShell(text, rel), "utf8");
}

/* What goes out for an HTML file of the served tree: the file, unless it is a page
   the shell has not written, which no tree that is a site holds */
function whole(body, rel) {
  if (/\.html$/i.test(rel) && shell.isMarked(body.toString("utf8"))) {
    throw new Error(rel + " carries a shell marker: it is a source page, not a built one. Serve the build (npm run build)");
  }
  return body;
}

function start(root, base, opts) {
  opts = opts || {};
  const log = opts.log || (() => {});
  const gitRoot = opts.gitRoot || root;
  const extra = Object.keys(opts.extraRoots || {}).map(prefix => ({ prefix: prefix.replace(/^\/+/, ""), dir: opts.extraRoots[prefix] }));
  /* the tree's _headers, read once: a build is not rewritten while it is served */
  const rules = fs.existsSync(path.join(root, headers.FILE)) ? headers.parse(fs.readFileSync(path.join(root, headers.FILE), "utf8")) : null;
  const read = (abs) => { try { return fs.statSync(abs).isFile() ? fs.readFileSync(abs) : null; } catch (e) { return null; } };
  const server = http.createServer((req, res) => {
    let url;
    try { url = decodeURIComponent(req.url.split("?")[0].split("#")[0]); } catch (e) { res.writeHead(400); res.end("bad url"); return; }
    const asked = url;
    let fromBase = false;
    if (url.startsWith("/__base/")) { fromBase = true; url = url.slice("/__base".length); }
    if (url.endsWith("/")) url += "index.html";
    let rel = path.posix.normalize(url).replace(/^\/+/, "");
    if (rel.startsWith("..")) { res.writeHead(403); res.end("forbidden"); return; }
    let body = null, refused = null, over = null;
    try {
      if (fromBase) {
        body = git.show(gitRoot, base, rel);
        if (body !== null) body = atRef(body, rel, gitRoot, base);
      } else {
        over = extra.find(x => rel.startsWith(x.prefix)) || null;
        body = read(over ? path.join(over.dir, rel.slice(over.prefix.length)) : path.join(root, rel));
        /* /about is about.html, as Pages serves it */
        if (body === null && !over && !path.posix.extname(rel) && read(path.join(root, rel + ".html")) !== null) {
          rel += ".html";
          body = read(path.join(root, rel));
        }
        if (body !== null && !over) body = whole(body, rel);
      }
    } catch (e) { refused = e.message; }
    log(req.method + " " + req.url + " -> " + (refused ? 500 : body === null ? 404 : 200));
    if (refused) { res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); res.end("refused: " + refused); return; }
    if (body === null) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); res.end("not found: " + rel); return; }
    const out = { "Content-Type": TYPES[path.posix.extname(rel).toLowerCase()] || "application/octet-stream", "Content-Length": body.length, "Cache-Control": "no-store" };
    if (rules && !fromBase && !over) headers.headersFor(rules, asked).forEach(([name, value]) => { out[name] = value; });
    res.writeHead(200, out);
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(opts.port || 0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        server, port,
        url: "http://127.0.0.1:" + port + "/",
        baseUrl: "http://127.0.0.1:" + port + "/__base/",
        close: () => new Promise(r => server.close(r))
      });
    });
  });
}

module.exports = { start, TYPES };

/* `node tools/lib/serve.js [--root=<dir>] [--base=<ref>] [--port=N]` serves the build for a
   manual look (npm run preview does too, on port 8000) */
if (require.main === module) {
  const opts = site.parseArgs(process.argv.slice(2));
  require("./target").start(Object.assign({}, opts, { port: opts.port ? +opts.port : 0, log: console.log })).then(s => {
    console.log("serving " + s.where + " (base " + (opts.base || site.DEFAULT_BASE) + " under " + s.baseUrl + ")");
  }, e => { console.error(e.message); process.exit(1); });
}
