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
                  variable CLOUDFLARE_PROJECT_NAME that the deploy job reads. */
export const ORIGIN = "https://learn.groupupmath.org";
export const LEGACY = "https://sophanasok.github.io/basic-mathematics/";
export const PAGES_PROJECT = "groupupmath";
