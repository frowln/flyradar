import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A browser build swaps each `x.ts` for its `x.web.ts`. The type checker only
 * sees `x.ts`, so a name added there and not to the web file compiles, and is
 * `undefined` in the browser (the Pro screen once vanished from the demo
 * that way). Every web file must export what its native sibling does.
 */

function exportsOf(file: string): Set<string> {
  const src = readFileSync(file, 'utf8');
  const names = new Set<string>();
  // Values only: types are erased and cannot be missing at run time.
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|function\*?|class|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]!);
  for (const m of src.matchAll(/export\s+\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && !/^type\s/.test(part.trim())) names.add(name);
    }
  }
  if (/export\s+default/.test(src)) names.add('default');
  return names;
}

function webFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return webFiles(p);
    return /\.web\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('web stand-ins', () => {
  const root = join(__dirname, '..');
  for (const web of [...webFiles(join(root, 'src')), ...webFiles(join(root, 'ui'))]) {
    const native = [web.replace(/\.web\.(tsx?)$/, '.$1'), web.replace(/\.web\.tsx?$/, '.tsx'), web.replace(/\.web\.tsx?$/, '.ts')].find((p) => existsSync(p) && p !== web);
    if (!native) continue;
    it(`${web.slice(root.length + 1)} exports everything ${native.slice(root.length + 1)} does`, () => {
      const missing = [...exportsOf(native)].filter((n) => !exportsOf(web).has(n));
      expect(missing).toEqual([]);
    });
  }
});
