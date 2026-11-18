// A tiny CommonJS loader for components in the tests: TypeScript → CJS,
// '@/…' and relative imports resolved inside the repository, packages from
// node_modules (the same loader as tests/design-system.test.mjs). `stubs` maps
// an import to a module object, for a part a test replaces.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

export const rootPath = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const nodeRequire = createRequire(import.meta.url);

export function tsxLoader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    const abs = path.resolve(file);
    if (cache.has(abs)) return cache.get(abs).exports;
    const mod = { exports: {} };
    cache.set(abs, mod);
    const code = ts.transpileModule(readFileSync(abs, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const req = (spec) => {
      if (spec in stubs) return stubs[spec];
      const target = spec.startsWith('@/') ? path.join(rootPath, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(abs), spec) : null;
      if (!target) return nodeRequire(spec);
      for (const ext of ['', '.tsx', '.ts', '/index.ts']) if (existsSync(target + ext) && !target.endsWith('/') && (ext || /\.(tsx?|mjs|js)$/.test(target))) return load(target + ext);
      throw new Error(`Cannot resolve ${spec} from ${abs}`);
    };
    new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
    return mod.exports;
  }
  return (rel) => load(path.join(rootPath, rel));
}
