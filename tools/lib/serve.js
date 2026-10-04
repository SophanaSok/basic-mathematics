"use strict";
/* An in-process static server for the site, on a free port.
   GET /<path>           the file under `root`: the source tree, or the built dist/
   GET /__base/<path>    the same path at the base git ref (via `git show`), so a page
                         at the previous commit can be loaded for comparison without
                         a second checkout. Its relative asset links resolve under
                         /__base/ too, so the whole old site is browsable there.
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

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".map": "application/json", ".xml": "application/xml", ".webmanifest": "application/manifest+json"
};

function start(root, base, opts) {
  opts = opts || {};
  const log = opts.log || (() => {});
  const gitRoot = opts.gitRoot || root;
  const extra = Object.keys(opts.extraRoots || {}).map(prefix => ({ prefix: prefix.replace(/^\/+/, ""), dir: opts.extraRoots[prefix] }));
  const server = http.createServer((req, res) => {
    let url;
    try { url = decodeURIComponent(req.url.split("?")[0].split("#")[0]); } catch (e) { res.writeHead(400); res.end("bad url"); return; }
    let fromBase = false;
    if (url.startsWith("/__base/")) { fromBase = true; url = url.slice("/__base".length); }
    if (url.endsWith("/")) url += "index.html";
    const rel = path.posix.normalize(url).replace(/^\/+/, "");
    if (rel.startsWith("..")) { res.writeHead(403); res.end("forbidden"); return; }
    const type = TYPES[path.posix.extname(rel).toLowerCase()] || "application/octet-stream";
    let body = null;
    if (fromBase) {
      body = git.show(gitRoot, base, rel);
    } else {
      const over = extra.find(x => rel.startsWith(x.prefix));
      const abs = over ? path.join(over.dir, rel.slice(over.prefix.length)) : path.join(root, rel);
      try { if (fs.statSync(abs).isFile()) body = fs.readFileSync(abs); } catch (e) { body = null; }
    }
    log(req.method + " " + req.url + " -> " + (body === null ? 404 : 200));
    if (body === null) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); res.end("not found: " + rel); return; }
    res.writeHead(200, { "Content-Type": type, "Content-Length": body.length, "Cache-Control": "no-store" });
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

/* `node tools/lib/serve.js [--root=<dir>] [--base=<ref>] [--port=N]` serves the site for a
   manual look, from the tree lib/target.js picks */
if (require.main === module) {
  const site = require("./site");
  const opts = site.parseArgs(process.argv.slice(2));
  require("./target").start(Object.assign({}, opts, { port: opts.port ? +opts.port : 0, log: console.log })).then(s => {
    console.log("serving " + s.where + " (base " + (opts.base || site.DEFAULT_BASE) + " under " + s.baseUrl + ")");
  });
}
