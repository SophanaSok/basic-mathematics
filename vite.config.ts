/* `npm run build` writes the site into dist/, page for page and at the same paths. A
   source page holds two markers where its <head> and its top bar go; tools/lib/shell.js
   writes them, here and in the dev server, before Vite reads the page. In that head are
   the boot script inline and one <script type="module"> for the page's kind
   (src/entries/<kind>.js, an ordered list of imports: first src/vendor/katex.js, which
   brings in KaTeX from npm, then the site's scripts), and before the stylesheets of the
   page's kind the two under src/vendor/ that import the fonts' and KaTeX's CSS from npm.
   Vite bundles that entry into dist/bundle/: one chunk per set of page kinds that load a
   file (see bundleNames), the stylesheets joined the same way, the site's own text
   unchanged, and beside them the favicon, every font file the vendor stylesheets
   name, and bundle/LICENSES.txt, the licences of what the bundle holds (licenses()
   below). Nothing on a built page comes from another server (tools/check-dist.js
   `offline`). Nothing in dist/ is named by a hash: Cloudflare Pages has a browser
   revalidate every page and script (dist/_headers), so a hash would buy nothing, and a
   page still open from before a deploy would ask for files the deploy had renamed
   (OPERATIONS.md, "What a deploy does to a page a browser already holds"). */
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { isMarked, renderShell, PAGE_KINDS, VENDOR_STYLES } from "./tools/lib/shell.js";
import { DIR as VENDOR_DIR, NOTICE, vendorOf, licenseNotice } from "./tools/lib/vendor.js";
import { FILE as HEADERS, NOT_FOUND, render as renderHeaders, notFoundPage, fromDist } from "./tools/lib/headers.js";

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

/* How the bundle is split and what its files are called: by the page kinds that load
   each file, read off tools/lib/shell.js (PAGE_KINDS: each kind's stylesheets and its
   entry) and the entries themselves (their imports). A file every kind loads goes into
   dist/bundle/all.js (or all.css); one that only chapters load into bundle/chapter.js;
   one the contents page and the chapters share into bundle/home-chapter.js, the kinds
   in PAGE_KINDS order. So a chunk is named by what loads it, and its name changes only
   when that changes, never because a file in it was edited. Each page's own entry
   chunk is bundle/pages/<page>.js. A module imported on demand, which no entry imports,
   is a chunk under its own name: the WebGL painter (scenes3d.js's dynamic import) is
   bundle/scenes3d-gl.js, supabase-js (account.js's, through src/vendor/supabase.js) is
   bundle/supabase.js, Three.js (three-loader.js's, through src/vendor/three.js) is
   bundle/three.js, and the course world (map3d.js's import of src/world/index.ts, with
   the modules of src/world/ it imports that no entry does) is bundle/world.js. A file
   from node_modules/ goes where the vendor module that
   brings it in goes (tools/lib/vendor.js: KaTeX's scripts with src/vendor/katex.js,
   which every entry imports, so all.js; supabase-js and its dependencies into
   bundle/supabase.js; three's two build files into bundle/three.js, shaken down to
   the names src/vendor/three.js exports). The vendor stylesheets every page links (src/vendor/fonts.css and
   katex.css, VENDOR_STYLES) are every kind's, so they open all.css, before the site's own
   (src/styles/tokens.css, then site.css); the
   packages' CSS they import is inlined into them before rolldown sees a module, and the
   font files it names are emitted beside the bundle. Vite's own helpers (the modulepreload
   polyfill, the preload helper) ride in all.js; rolldown's runtime keeps its fixed
   name. A module this cannot place fails the build rather than get a name rolldown made
   up, which could change from one build to the next.
   This is the split rolldown makes on its own; what it adds is the names.
   tools/check-dist.js reads the same sources and holds every chunk and stylesheet in
   dist to the name its contents call for. */
const WORLD_DIR = "src/world/";
function bundleNames(): (id: string) => string | null {
  const kinds = Object.keys(PAGE_KINDS) as (keyof typeof PAGE_KINDS)[];
  const loadedBy: Record<string, string[]> = {};
  const add = (rel: string, kind: string) => { (loadedBy[rel] ??= []).push(kind); };
  for (const kind of kinds) {
    const { entry, styles } = PAGE_KINDS[kind];
    add(entry, kind);
    for (const s of VENDOR_STYLES.concat(styles)) add(s, kind);
    const dir = path.posix.dirname(entry);
    for (const m of fs.readFileSync(path.join(root, entry), "utf8").matchAll(/^\s*import\s+["']([^"']+)["']\s*;?\s*$/gm)) {
      add(path.posix.normalize(path.posix.join(dir, m[1])), kind);
    }
  }
  const nameOf = (rel: string, id: string): string | null => {
    if (/\.html$/i.test(rel)) return null;    /* a page's own entry module: entryFileNames names it */
    const by = loadedBy[rel];
    if (by) return by.length === kinds.length ? "all" : by.join("-");
    if (/^assets\/[^/]+\.js$/.test(rel)) return path.posix.basename(rel, ".js");   /* a dynamic import of a script's own */
    if (rel.startsWith(WORLD_DIR)) return "world";                                  /* the course world, map3d.js's import() */
    if (rel.startsWith(VENDOR_DIR + "/")) return path.posix.basename(rel, ".js");  /* a vendor module imported on demand */
    if (/(^|\/)node_modules\//.test(rel)) return nameOf(vendorOf(rel).file, id);    /* with the vendor module that brings it in */
    throw new Error("vite.config.ts bundleNames: no entry or kind loads " + JSON.stringify(rel) + " (from " + id + "), so it has no name in dist/bundle/");
  };
  return (id) => {
    if (/^\0vite\//.test(id)) return "all";
    /* rolldown's ids are absolute paths, some with a query (a stylesheet's import flags) */
    return nameOf(path.relative(root, id.replace(/\?.*$/, "")).split(path.sep).join("/"), id);
  };
}

/* Build-only. Vite splits the pages' stylesheets into shared files, and writes the link
   to a page's own file BEFORE the links to the files it shares (vite 8.3: its css-post
   plugin appends the shared files to a list that already holds the page's own). The
   source has them the other way round (tokens.css, site.css, game.css, then arena.css or
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
   it, and every one of them comes from the site itself, so the attribute changes
   nothing and is taken off again: the link in dist is the link in the source but for
   the file it names. (The module script tags Vite writes carry it too, as every module
   script does; those are left as Vite makes them.) */
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

/* Build-only. Everything under dist/bundle/ that is not the site's own (KaTeX's script
   and fonts, the typefaces, supabase-js and what it depends on) is published under
   its package's licence, and the font licence (SIL OFL 1.1) asks that a copy of the
   fonts carry the copyright notice and the licence text, which the fontsource files
   do not hold in their name tables. So bundle/LICENSES.txt goes out beside them: one
   section per installed package the vendor modules bring in, with the licence file it
   ships, written by tools/lib/vendor.js licenseNotice() from node_modules/ at build
   time, so it is never behind the installed versions. tools/check-dist.js `licences`
   holds dist to it, and holds every font file in dist to a file of one of those
   packages. */
function licenses(): Plugin {
  return {
    name: "bm:licenses",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: NOTICE, source: licenseNotice() });
    }
  };
}

/* Build-only, and last: the two files only Cloudflare Pages reads (tools/lib/headers.js
   says what is in them and why). dist/404.html, the page an unknown path gets there;
   then dist/_headers, the security headers and the caching, written from what dist
   holds once everything else is in it: the hashes of the inline scripts of every built
   page and the font files are read off the files themselves, so the policy is never
   behind the pages. tools/check-dist.js `headers` holds dist to it. */
function cloudflare(): Plugin {
  let outDir = "";
  return {
    name: "bm:cloudflare",
    apply: "build",
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir); },
    closeBundle() {
      fs.writeFileSync(path.join(outDir, NOT_FOUND), notFoundPage());
      fs.writeFileSync(path.join(outDir, HEADERS), renderHeaders(fromDist(outDir, root)));
    }
  };
}

export default defineConfig({
  root,
  /* relative, so the site works at the root of learn.groundupmath.org, under a sub-path,
     and anywhere else it is put, and rootPrefix() in assets/site.js keeps finding its way
     from data-depth */
  base: process.env.BM_BASE || "./",
  /* a site of separate pages: an unknown path is a 404, not index.html */
  appType: "mpa",
  plugins: [shell(), stylesheetOrder(), plainStylesheetLinks(), licenses(), cloudflare()],
  resolve: {
    /* one copy of Three.js, whatever imports it: a second copy (from a package that
       depended on its own) would be a second chunk and a second set of classes, and
       an object of one is not `instanceof` the other */
    dedupe: ["three"]
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    /* for the scripts as for the stylesheets: a built chunk's map names the source
       files in it, which tools/check-dist.js reads to prove each page's bundle holds
       the files its entry imports and nothing else */
    sourcemap: true,
    /* The stylesheets go out as they are written.
       Vite's CSS minifier (Lightning CSS) rewrites values as well as white space, and
       the scripts read some of them: it turns --plot-fill: rgba(38, 70, 212, .14) into
       #2646d424, which parseColor in assets/scenes3d.js cannot read, and it merges
       selectors into :is(), which changes their weight. With this off, each source
       stylesheet is in dist byte for byte inside the file it was joined into, and
       tools/check-dist.js fails the build that changes that. */
    cssMinify: false,
    /* Every file a stylesheet names is a file in dist, never a data: URL inside the
       stylesheet (Vite's default inlines anything under 4 kB, and three of KaTeX's font
       files are): the fonts are fetched when a glyph needs them, which a data: URL would
       undo by putting every one into the stylesheet every page downloads; and
       check-dist.js `links` resolves each url() in the built CSS to a file. */
    assetsInlineLimit: 0,
    /* bundle/three.js is over Vite's 500 kB line (the renderer is most of the library,
       and it is minified, 570 kB, 144 kB over the wire) and is fetched only when a 3D
       scene or the course map nears the screen, which is what the warning would ask
       for; the line is raised past it so a build prints nothing it does not mean */
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      input: htmlPages(),
      output: {
        /* The entries are lists of side-effect imports whose order is the order the
           scripts run in (site.js initialises the page; game.js, encounter.js and
           lesson.js build on it). Rolldown splits what pages share into shared chunks,
           and without this a chunk's modules run when the chunk is imported, which put
           site.js (in the chunk every page shares) before widgets.js and the scenes.
           With it (rolldown 1.2: output.strictExecutionOrder) each module's body is
           wrapped in an init function and called in the entry's order, whichever chunk
           it landed in. tools/check-dist.js holds each bundle to the entry's files; the
           browser checks hold the order (figures mount, BMGame finds BMStore). */
        strictExecutionOrder: true,
        /* No hash in any name (the top of this file says why), and the chunks named by
           what loads them (bundleNames). [name] of an entry is the page's path without
           .html; of a chunk, the group's name; of a stylesheet or the favicon, the chunk
           or file it belongs to. */
        entryFileNames: "bundle/pages/[name].js",
        chunkFileNames: "bundle/[name].js",
        assetFileNames: "bundle/[name][extname]",
        codeSplitting: {
          /* false: a module goes where its own name says, not where its importer's
             does (true would pull every import of an entry into the entry's chunk) */
          includeDependenciesRecursively: false,
          groups: [{ debugName: "by-page-kinds", name: bundleNames() }]
        },
        /* The init functions one chunk calls in another keep their names (init_site,
           init_widgets) instead of being shortened to a letter that another build might
           give to a different function: a browser that holds one chunk from the last
           deploy and fetches the next from this one still finds what it imports, as
           long as the file is still in that chunk. (rolldown 1.2: defaults to true for
           format es.) */
        minifyInternalExports: false
      }
    }
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
