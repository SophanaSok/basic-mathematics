/* `npm run test:unit`: the unit tests of the TypeScript modules, each beside its module
   under src/ as <module>.test.ts. A config of its own, so Vitest does not take vite.config.ts and
   with it the site's build (the shell plugin, every page as an input). The tests run in
   Node: the modules under src/learn/ touch neither the DOM nor `window`; of src/ui/ladder.ts
   only the markup that needs no DOM is tested here, and its mount (the DOM, focus, the
   idle timer) in Chromium by tools/game/browser.test.js. The Node
   scripts under tools/ stay as they are and are not run from here. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
});
