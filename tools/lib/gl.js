"use strict";
/* How every Chromium of the harness is launched: the full Chromium build (Playwright's
   channel "chromium", new headless mode), never the headless shell, with WebGL 2 on
   SwiftShader (software, on the CPU), on every machine, and never the machine's GPU.

   Why the full build: the headless shell segfaults the popup tab's first renderer on a
   Ctrl+click in the site's pages (every run left a core dump, and once in a while the
   popup stayed about:blank and failed the check); the full build does not, in five
   harness runs and a whole-suite run on 2026-10-19 (Playwright 1.63/1.64, builds 1243 and
   1248). `npx playwright install chromium` installs both, here and on CI.

   A GitHub runner has no GPU, so there the only WebGL is SwiftShader. A developer's
   machine has one, and a run that drew on it would be faster than CI and pass checks CI
   fails (the course world's tier and its frame-time watchdog both depend on the
   renderer). The flags (ARGS) already put WebGL on SwiftShader; but Chromium's GPU process
   still asks the system's Vulkan loader for every driver it has, and on a machine with an
   NVIDIA card that opens /dev/nvidiactl and the card's render node, though nothing is
   drawn there. env() points the loader at Chromium's own SwiftShader driver
   (vk_swiftshader_icd.json, shipped beside the browser) and nothing else, so the
   machine's graphics driver is never loaded and the run sees the devices a runner sees.
   Measured with Playwright 1.63.0 (Chromium 153 headless shell) on Arch Linux with an
   RTX 5060 Ti: without it the GPU process holds /dev/nvidiactl and /dev/dri/renderD128;
   with it, no device file, and the same SwiftShader context.

   opts(chromium, extra) is the launch options every script passes (the channel, env(),
   and its own extra such as headless or args); launch() is chromium.launch with those
   and ARGS, and then asks a blank page for its WebGL 2 renderer: anything but SwiftShader
   (or no WebGL 2 at all, when `gl` is wanted) is an error that says so, rather than
   checks that quietly measure another machine. */
const fs = require("fs");
const path = require("path");

const ARGS = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"];
const SOFTWARE = /swiftshader/i;
const CHANNEL = "chromium";   /* the full build; a headless launch without it runs the headless shell */

/* Chromium's own SwiftShader Vulkan driver: the full build's (beside its executable) or,
   failing that, the headless shell's of the same revision */
function icd(chromium) {
  let exe = "";
  try { exe = chromium.executablePath({ channel: CHANNEL }) || ""; } catch (e) { /* an older Playwright */ }
  if (!exe) { try { exe = chromium.executablePath() || ""; } catch (e) { return null; } }
  const out = [];
  if (exe) out.push(path.join(path.dirname(exe), "vk_swiftshader_icd.json"));
  const m = /^(.*)[\\/]chromium-(\d+)[\\/]/.exec(exe);
  if (m) out.push(path.join(m[1], "chromium_headless_shell-" + m[2], "chrome-headless-shell-linux64", "vk_swiftshader_icd.json"));
  return out.find((f) => fs.existsSync(f)) || null;
}

/* the launch options every script passes: the full build, env(), then the script's own */
function opts(chromium, extra) {
  const o = Object.assign({ channel: CHANNEL }, extra || {});
  const e = env(chromium);
  if (e) o.env = Object.assign({}, e, o.env || {});
  return o;
}

/* the environment for a launch: the loader held to SwiftShader where its driver file is
   found (Linux; elsewhere nothing changes and the flags alone decide) */
function env(chromium) {
  const f = process.platform === "linux" ? icd(chromium) : null;
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

module.exports = { ARGS, SOFTWARE, CHANNEL, env, icd, opts, renderer, launch };
