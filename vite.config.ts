/* The build is a pass-through for now: `npm run build` writes the same site into dist/,
   page for page and at the same paths. A source page holds two markers where its <head>
   and its top bar go; tools/lib/shell.js writes them, here and in the dev server, before
   Vite reads the page. Vite joins the stylesheets the pages link into shared files,
   their text unchanged, and renames those and the favicon; the scripts are still
   classic <script defer> tags, which Vite leaves alone and does not emit, so a plugin
   below copies them across unchanged. */
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { isMarked, renderShell } from "./tools/lib/shell.js";

const root = import.meta.dirname;

/* Dev and build, and first among the plugins: the two below read the stylesheet links
   and script tags of a page, which are not in the source file. A page of the site (the
   rule of htmlPages() below) must carry the markers, and one that does not stops the
   build with the shell's message; any other HTML file the dev server is asked for (a
   test fixture, a report) is left as it is unless it carries them. */
function shell(): Plugin {
  return {
    name: "bm:shell",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const rel = path.relative(root, ctx.filename).split(path.sep).join("/");
        const isPage = /^(?:parts\/[^/]+\/)?[^/]+\.html$/i.test(rel);
        return isPage || isMarked(html) ? renderShell(html, rel) : html;
      }
    }
  };
}

/* root pages plus every parts/<dir>/<file>.html: the rule of htmlPages() in
   tools/lib/site.js. Vite writes each page to the path it has under the root, so the
   keys only have to be unique; they are the page paths without ".html". */
function htmlPages(): Record<string, string> {
  const pages = fs.readdirSync(root).filter((f) => /\.html$/i.test(f));
  const parts = path.join(root, "parts");
  if (fs.existsSync(parts)) {
    for (const d of fs.readdirSync(parts).sort()) {
      const dir = path.join(parts, d);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir).sort()) if (/\.html$/i.test(f)) pages.push("parts/" + d + "/" + f);
    }
  }
  const input: Record<string, string> = {};
  for (const p of pages) input[p.replace(/\.html$/i, "")] = path.join(root, p);
  return input;
}

function scriptFiles(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(path.join(root, dir)).sort()) {
    const rel = dir + "/" + f;
    if (fs.statSync(path.join(root, rel)).isDirectory()) scriptFiles(rel, out);
    else if (/\.js$/.test(f)) out.push(rel);
  }
  return out;
}

/* Temporary, and build-only: it goes when the pages load bundled module entries.
   - every .js under assets/ and data/ is emitted at its own path, byte for byte. That
     covers the scripts the pages name and the ones loaded at run time (the scenes'
     WebGL painter, for one);
   - each classic <script src> gets Vite's documented `vite-ignore` attribute before
     Vite reads the page, which tells it the tag is meant to stay as it is. Vite takes
     the attribute out again (the second plugin closes the gap it leaves), so the tag
     in dist is the tag in the source, and the build does not print "can't be bundled
     without type=module" once per tag. */
function classicScripts(): Plugin[] {
  return [{
    name: "bm:classic-scripts",
    apply: "build",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(/<script (?![^>]*\btype=["']?module)(?=[^>]*\bsrc=["'](?!https?:|\/\/))/g, "<script vite-ignore ");
      }
    },
    generateBundle() {
      for (const rel of scriptFiles("assets").concat(scriptFiles("data"))) {
        this.emitFile({ type: "asset", fileName: rel, source: fs.readFileSync(path.join(root, rel)) });
      }
    }
  }, {
    name: "bm:classic-scripts:tidy",
    apply: "build",
    transformIndexHtml: { order: "post", handler: (html) => html.replace(/<script  /g, "<script ") }
  }];
}

/* Build-only. Vite splits the pages' stylesheets into shared files, and writes the link
   to a page's own file BEFORE the links to the files it shares (vite 8.3: its css-post
   plugin appends the shared files to a list that already holds the page's own). The
   source has them the other way round (site.css, game.css, then arena.css or
   map3d.css), and rules of equal weight are settled by that order. So: note the order
   each page links its stylesheets in, note which source files went into which built
   file, and put the built links back in the page's order. If no order of the built
   files reproduces the page's, the build fails rather than ship a different cascade. */
function stylesheetOrder(): Plugin[] {
  const linked = new Map<string, string[]>();   /* page -> the stylesheets it links, in order */
  const built = new Map<string, string[]>();    /* built .css file -> the source files in it, in order */
  const LINK = /<link rel="stylesheet" crossorigin href="([^"]+)">/g;
  let base = "./";
  /* the built file a link's href names: under an absolute base (BM_BASE=/sub/) the href
     starts with it; under the relative default it is relative to the page */
  const fileOf = (page: string, href: string) => /^(\/|[a-z]+:)/.test(base) && href.startsWith(base)
    ? href.slice(base.length)
    : path.posix.normalize(path.posix.join(path.posix.dirname(page), href));
  return [{
    name: "bm:stylesheet-order:read",
    apply: "build",
    configResolved(config) { base = config.base; },
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const dir = path.dirname(ctx.filename), list: string[] = [];
        for (const m of html.matchAll(/<link rel="stylesheet" href="(?!https?:|\/\/)([^"]+)">/g)) list.push(path.resolve(dir, m[1]));
        linked.set(ctx.filename, list);
      }
    },
    /* before Vite folds the shared files into each page's list and drops their chunks */
    generateBundle: {
      order: "pre",
      handler(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== "chunk") continue;
          const sources = Object.keys(chunk.modules).filter((id) => /\.css$/.test(id));
          for (const file of chunk.viteMetadata?.importedCss ?? []) built.set(file, sources);
        }
      }
    }
  }, {
    name: "bm:stylesheet-order:write",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const page = ctx.path.slice(1);
        const want = linked.get(ctx.filename) ?? [];
        const tags = [...html.matchAll(LINK)].filter((m) => built.has(fileOf(page, m[1])));
        const first = (m: RegExpMatchArray) => want.indexOf(built.get(fileOf(page, m[1]))![0]);
        const sorted = tags.slice().sort((a, b) => first(a) - first(b));
        const got = sorted.flatMap((m) => built.get(fileOf(page, m[1]))!);
        if (got.join("\n") !== want.join("\n")) {
          throw new Error(ctx.path + ": the built stylesheets cannot be linked in the order the page has them.\n  page:  " +
            want.map((f) => path.relative(root, f)).join(", ") + "\n  built: " + got.map((f) => path.relative(root, f)).join(", "));
        }
        let i = 0;
        return html.replace(LINK, (tag, href) => built.has(fileOf(page, href)) ? sorted[i++][0] : tag);
      }
    }
  }];
}

/* Build-only. Vite writes `crossorigin` on every stylesheet link it makes (vite 8.3: it
   is fixed in its html plugin, with no option). The pages link their stylesheets without
   it, and it is not wanted here: every one of them comes from the site itself, and a
   page opened from disk (file://) is refused a stylesheet asked for that way, so dist/
   would open unstyled. Taken off again, the link in dist is the link in the source but
   for the file it names. */
function plainStylesheetLinks(): Plugin {
  return {
    name: "bm:plain-stylesheet-links",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) => html.replace(/<link rel="stylesheet" crossorigin href=/g, '<link rel="stylesheet" href=')
    }
  };
}

export default defineConfig({
  root,
  /* relative, so the site works under the GitHub Pages sub-path and anywhere else it is
     put, and rootPrefix() in assets/site.js keeps finding its way from data-depth */
  base: process.env.BM_BASE || "./",
  /* a site of separate pages: an unknown path is a 404, not index.html */
  appType: "mpa",
  plugins: [shell(), classicScripts(), stylesheetOrder(), plainStylesheetLinks()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    /* While the build is a pass-through the stylesheets go out as they are written.
       Vite's CSS minifier (Lightning CSS) rewrites values as well as white space, and
       the scripts read some of them: it turns --plot-fill: rgba(38, 70, 212, .14) into
       #2646d424, which parseColor in assets/scenes3d.js cannot read, and it merges
       selectors into :is(), which changes their weight. With this off, each source
       stylesheet is in dist byte for byte inside the file it was joined into, and
       tools/check-dist.js fails the build that changes that. */
    cssMinify: false,
    rolldownOptions: { input: htmlPages() }
  },
  /* http://localhost:8000/account.html is on the Supabase redirect allow-list
     (supabase/README.md), so sign-in only comes back to this port */
  server: {
    port: 8000,
    strictPort: true,
    /* written by the build and by tools/check-browser.js; not part of the site */
    watch: { ignored: ["**/dist/**", "**/.cache/**"] }
  },
  preview: { port: 8000, strictPort: true }
});
