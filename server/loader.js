/* Loads the browser game engine (js/*.js) into an isolated Node context and
 * returns { SR, DATA }. The logic files share one global scope (as in the
 * browser); we recreate that with `vm`, exactly like the smoke-test harness.
 * Each call returns a FRESH, independent engine instance — one per room — so
 * concurrent games never touch each other's state or uid counters. */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FILES = ["data", "state", "engine", "battle", "espionage", "diplomacy", "ai", "modeb"];

function loadEngine() {
  const src = FILES.map(n => fs.readFileSync(path.join(ROOT, "js", n + ".js"), "utf8")).join("\n\n");
  const sandbox = { module: { exports: {} }, console, Math, Date, JSON };
  vm.createContext(sandbox);
  vm.runInContext(src + "\n;globalThis.SR = SR; globalThis.DATA = DATA;", sandbox, { filename: "engine-bundle.js" });
  return { SR: sandbox.SR, DATA: sandbox.DATA };
}

module.exports = { loadEngine };
