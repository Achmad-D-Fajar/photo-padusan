const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const SRC_ROOT = path.resolve(__dirname, "../src");

let ts;
try {
  ts = require("typescript");
} catch {
  throw new Error(
    "Dependensi 'typescript' belum terpasang. Jalankan 'npm ci' atau 'npm install' terlebih dahulu."
  );
}

// Compile TypeScript modules in memory for repository scripts and tests, with
// optional service doubles. No build output or external services are needed.
function loadTs(file, stubs = {}, cache = new Map()) {
  const resolved = path.resolve(file);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const mod = { exports: {} };
  cache.set(resolved, mod);
  const nativeRequire = createRequire(resolved);
  function localRequire(id) {
    if (Object.hasOwn(stubs, id)) return stubs[id];
    if (id.startsWith("@/") || id.startsWith(".")) {
      const target = id.startsWith("@/")
        ? path.resolve(SRC_ROOT, id.slice(2))
        : path.resolve(path.dirname(resolved), id);
      const source = [target, target + ".ts", target + ".tsx"].find(
        candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      );
      if (source && /\.tsx?$/.test(source)) return loadTs(source, stubs, cache);
    }
    return nativeRequire(id);
  }
  const code = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(localRequire, mod, mod.exports);
  return mod.exports;
}

module.exports = { loadTs };
