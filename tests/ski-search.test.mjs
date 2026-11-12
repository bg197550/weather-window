import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const common = readFileSync(new URL("../assets/common.js", import.meta.url), "utf8");
const areas = [
  ["Alta Badia", "Bolzano/Bozen, IT", 46.55, 11.8, 4399, 8286],
  ["Alta Ski Area", "UT, US", 40.58, -111.63, 8538, 10553],
  ["Altayskiye Alpy", "Shyghys Qazaqstan, KZ", 49, 85, 2114, 3219],
  ["Killington Resort", "VT, US", 43.63, -72.8, 1163, 4139],
  ["Mt. Bachelor", "OR, US", 43.98, -121.69, 5701, 8936],
  ["Whistler Blackcomb", "BC, CA", 50.1, -122.95, 2143, 7413],
];
function ctx() {
  const s = { URL, Math, Number, String, RegExp, Promise, fetch: async () => ({ ok: true, json: async () => ({ areas }) }) };
  vm.createContext(s);
  vm.runInContext(common.slice(common.indexOf("/* ---------- Place lookups")) + ";this.searchSki=searchSki;", s);
  return s;
}
test("ski search: exact names first, filler words ignored, US filter", async () => {
  const { searchSki } = ctx();
  assert.equal((await searchSki("alta"))[0].name, "Alta Ski Area");
  assert.equal((await searchSki("Mount Bachelor"))[0].name, "Mt. Bachelor");
  assert.equal((await searchSki("mt bachelor"))[0].name, "Mt. Bachelor");
  assert.equal((await searchSki("killington ski resort"))[0].ski.base, 1163);
  assert.equal((await searchSki("whistler", { usOnly: true })).length, 0);
  assert.equal((await searchSki("al")).length, 0);
  assert.equal((await searchSki("bach or")).length, 0);
  assert.equal((await searchSki("blackcomb"))[0].name, "Whistler Blackcomb");
});
