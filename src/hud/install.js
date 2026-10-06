// @ts-check
/* window.BMHud for a page that has no HUD script: the same two modules, from the bundle.

   Every page the shell writes runs the HUD script after its top bar (tools/lib/shell.js
   hudScript()), which puts these functions on window before the bundle runs, and then this
   does nothing. But a page a browser cached from before the HUD script existed could run
   this release's bundle for the ten minutes GitHub Pages, which served the course then,
   let it keep files (OPERATIONS.md, "Cached HTML after the HUD deploy"); without BMHud, site.js could not
   count a day's XP and the answer just earned would be lost. So the bundle brings the
   same source along and installs it where it is missing: one copy of the code, the inline
   script and this its two ways onto a page. Each entry imports levels.js and view.js by
   name before this file, because the build places a module by the entries that import it. */
import * as levels from "./levels.js";
import * as view from "./view.js";

if (typeof window !== "undefined" && !window.BMHud) window.BMHud = Object.assign({}, levels, view);
