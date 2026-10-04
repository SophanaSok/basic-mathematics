"use strict";
/* Read files at a git ref without a checkout. */
const { execFileSync } = require("child_process");

function show(root, ref, relPath) {
  try {
    return execFileSync("git", ["show", ref + ":" + relPath], { cwd: root, encoding: "buffer", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    return null; /* not present at that ref */
  }
}
function showText(root, ref, relPath) {
  const b = show(root, ref, relPath);
  return b === null ? null : b.toString("utf8");
}
function listFiles(root, ref, dir) {
  try {
    const out = execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "--", dir || "."], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\n").filter(Boolean);
  } catch (e) {
    return [];
  }
}
function resolveRef(root, ref) {
  try {
    return execFileSync("git", ["rev-parse", "--verify", "--quiet", ref + "^{commit}"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (e) {
    return null;
  }
}

module.exports = { show, showText, listFiles, resolveRef };
