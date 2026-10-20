"use strict";
/* How every Chromium of the harness is launched as far as graphics go: WebGL 2 on
   SwiftShader (software, on the CPU), on every machine, and never the machine's GPU.

   Which build: the headless shell, what a headless launch runs, for every suite; CI's
   frame budgets (the course map's tier watchdog, the forms viewer's memory counts) were
   measured on it, and the full build fails them on a runner. The full build (FULL, the
   channel "chromium", new headless mode) is for the two scripts that need it: the shell
   segfaults a popup tab's first renderer on a Ctrl+click in the site's pages (a core dump
   every run, and now and then the popup stays about:blank and fails the HUD popover check),
   so game/browser.test.js runs on the full build; and the shell has no back/forward cache,
   so suites/transitions.js's second browser does too. `npx playwright install chromium`
   installs both, here and on CI.

   A GitHub runner has no GPU, so there the only WebGL is SwiftShader. A developer's
   machine has one, and a run that drew on it would be faster than CI and pass checks CI
   fails (the course world's tier and its frame-time watchdog both depend on the
   renderer). The flags (ARGS) already put WebGL on SwiftShader; but Chromium's GPU process
   still asks the system's Vulkan loader for every driver it has, and on a machine with an
   NVIDIA card that opens /dev/nvidiactl and the card's render node, though nothing is
   drawn there. env() points the loader at Chromium's own SwiftShader driver
   (vk_swiftshader_icd.json, shipped beside each build) and nothing else, so the
   machine's graphics driver is never loaded and the run sees the devices a runner sees.
   Measured first on the headless shell (Playwright 1.63.0, Chromium 153) on Arch Linux with
   an RTX 5060 Ti: without it the GPU process holds /dev/nvidiactl and /dev/dri/renderD128;
   with it, no device file, and the same SwiftShader context. Measured again on the full
   build (Playwright 1.64.0, build 1248) on 2026-10-20: no device file, SwiftShader.

   opts(chromium, extra) is the launch options every script passes (env() for the build
   extra.channel names, and the script's own such as headless or args); launch() is
   chromium.launch with those and ARGS, and then asks a blank page for its WebGL 2
   renderer: anything but SwiftShader (or no WebGL 2 at all, when `gl` is wanted) is an
   error that says so, rather than checks that quietly measure another machine. */
const fs = require("fs");
const path = require("path");

const ARGS = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"];
const SOFTWARE = /swiftshader/i;
const FULL = "chromium";   /* the full build's channel; a headless launch without a channel runs the headless shell */

/* Chromium's own SwiftShader Vulkan driver for the build a launch runs: the full build's
   (beside its executable) when `channel` is FULL, else the headless shell's of the same
   revision; either way the other is the fallback */
function icd(chromium, channel) {
  let exe = "";
  try { exe = chromium.executablePath(channel ? { channel } : undefined) || ""; } catch (e) { /* an older Playwright */ }
  if (!exe) { try { exe = chromium.executablePath() || ""; } catch (e) { return null; } }
  const beside = exe ? path.join(path.dirname(exe), "vk_swiftshader_icd.json") : null;
  const m = /^(.*)[\\/]chromium-(\d+)[\\/]/.exec(exe);
  const shell = m ? path.join(m[1], "chromium_headless_shell-" + m[2], "chrome-headless-shell-linux64", "vk_swiftshader_icd.json") : null;
  const out = channel === FULL ? [beside, shell] : [shell, beside];
  return out.find((f) => f && fs.existsSync(f)) || null;
}

/* the launch options every script passes: env() for the build extra.channel names (none:
   the headless shell), then the script's own */
function opts(chromium, extra) {
  const o = Object.assign({}, extra || {});
  const e = env(chromium, o.channel);
  if (e) o.env = Object.assign({}, e, o.env || {});
  return o;
}

/* the environment for a launch: the loader held to SwiftShader where its driver file is
   found (Linux; elsewhere nothing changes and the flags alone decide) */
function env(chromium, channel) {
  const f = process.platform === "linux" ? icd(chromium, channel) : null;
  if (!f) return undefined;
  return Object.assign({}, process.env, { VK_DRIVER_FILES: f, VK_ICD_FILENAMES: f });
}

/* the WebGL 2 renderer a page of this browser gets, or "" without WebGL 2 */
async function renderer(browser) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return "";
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      return String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
    });
  } finally { await page.close(); }
}

/* chromium.launch(options) with ARGS (and options.args) and env(); with `gl` the
   renderer must be SwiftShader, without it only "not a hardware renderer" (a launch
   with no WebGL at all is fine for a check that takes the flat fallbacks) */
async function launch(chromium, options, gl) {
  const o = opts(chromium, options);
  o.args = ARGS.concat(o.args || []);
  const browser = await chromium.launch(o);
  const r = await renderer(browser).catch((x) => "?" + (x && x.message || x));
  if ((gl && !SOFTWARE.test(r)) || (r && !SOFTWARE.test(r))) {
    await browser.close();
    throw new Error("Chromium was to draw WebGL 2 on SwiftShader, as on a CI runner, and got " + (r ? JSON.stringify(r) : "no WebGL 2 context") + " (tools/lib/gl.js)");
  }
  return browser;
}

module.exports = { ARGS, SOFTWARE, FULL, env, icd, opts, renderer, launch };
