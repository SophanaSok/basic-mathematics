/* `npm run test:unit`: the unit tests of the modules under src/, each beside its module
   as <module>.test.ts. A config of its own, so Vitest does not take vite.config.ts and
   with it the site's build (the shell plugin, every page as an input). The tests run in
   Node: the modules under src/core/ and src/learn/ touch neither the DOM nor `window`, and src/hud/
   touches no DOM but what a test hands it; of src/ui/ladder.ts only the markup that needs
   no DOM is tested here, and its mount (the DOM, focus, the idle timer) in Chromium by
   tools/game/browser.test.js; the settings sheet (src/ui/settings.ts) is a matter of
   focus, dialogs and the page, and is tested in Chromium by the `hud` suite of
   tools/check-browser.js. The Node scripts under tools/ stay as they are and are not run
   from here. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
});
