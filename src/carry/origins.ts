/* The site's addresses, in one place: the bundle imports them (src/carry/format.ts) and
   the Node tools read this file as text (tools/lib/origins.js: each value must stay a
   string literal on its own `export const` line), so the legacy site, its checks, the
   headers and the runbook's values all come from here.

   ORIGIN         where the site is served from once it has moved: Cloudflare Pages, on
                  the domain bought at Porkbun (OPERATIONS.md, "Moving to Cloudflare
                  Pages"). Never change it once readers' progress is there: storage
                  belongs to an origin, and a new one starts empty.
   LEGACY         where it was served from: the GitHub Pages project site. After the move
                  it serves only dist-legacy/ (tools/build-legacy.js), which sends each
                  old address to the same page at ORIGIN with the reader's progress.
   PAGES_PROJECT  the Cloudflare Pages project's name, the default of the repository
                  variable CLOUDFLARE_PROJECT_NAME that the deploy job reads.
   LEGACY_LOCAL   the old address on a local server: a page of the new address served
                  from localhost takes carried progress from a page of this host, on any
                  port (src/carry/format.ts fromLegacy), as it takes it from LEGACY's
                  origin anywhere. The browser test (tools/game/carry.test.js) and the
                  runbook's local trial serve the legacy site here. A scheme and a host,
                  no port and no path. */
export const ORIGIN = "https://learn.groundupmath.org";
export const LEGACY = "https://sophanasok.github.io/basic-mathematics/";
export const PAGES_PROJECT = "groundupmath";
export const LEGACY_LOCAL = "http://127.0.0.1";
