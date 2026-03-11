import { readFileSync, existsSync } from 'fs';
import { resolve, relative, dirname } from 'path';
import { describe, expect, it } from 'vitest';
import { glob } from 'tinyglobby';

const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src');

const IMPORT_PATTERNS = [
  /from\s+['"]([^'"]+)['"]/g,
  /import\s+['"]([^'"]+)['"]/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function extractImports(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  return IMPORT_PATTERNS.flatMap((pattern) =>
    [...content.matchAll(new RegExp(pattern))].map((m) => m[1]!),
  );
}

function resolveImportPath(
  importPath: string,
  fromFile: string,
): string | null {
  if (importPath.startsWith('@/')) {
    return resolve(SRC, importPath.slice(2));
  }
  if (importPath.startsWith('.')) {
    return resolve(dirname(fromFile), importPath);
  }
  return null;
}

function resolveWithExtensions(target: string): string | undefined {
  const candidates = [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    `${target}/index.ts`,
    `${target}/index.tsx`,
  ];
  return candidates.find((c) => existsSync(c));
}

function isForbiddenEngineImport(checkTarget: string): boolean {
  const forbidden = [
    /src\/app\//,
    /src\/lib\/github\//,
    /src\/lib\/supabase\//,
    /^next/,
    /^@supabase/,
    /^octokit/,
    /^@octokit/,
  ];
  return forbidden.some((pattern) => pattern.test(checkTarget));
}

type ImportGraph = Map<string, string[]>;

function buildImportGraph(files: string[]): ImportGraph {
  const graph: ImportGraph = new Map();

  for (const file of files) {
    const neighbours = extractImports(file)
      .map((imp) => resolveImportPath(imp, file))
      .filter((target): target is string => target !== null)
      .map(resolveWithExtensions)
      .filter((found): found is string => found !== undefined);

    graph.set(file, neighbours);
  }

  return graph;
}

function findCycles(graph: ImportGraph): string[][] {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      detectCycle(node, [], graph, visited, inStack, cycles);
    }
  }

  return cycles;
}

function detectCycle(
  node: string,
  path: string[],
  graph: ImportGraph,
  visited: Set<string>,
  inStack: Set<string>,
  cycles: string[][],
): void {
  if (inStack.has(node)) {
    cycles.push([...path.slice(path.indexOf(node)), node]);
    return;
  }
  if (visited.has(node)) return;

  visited.add(node);
  inStack.add(node);

  for (const neighbour of graph.get(node) ?? []) {
    detectCycle(neighbour, [...path, node], graph, visited, inStack, cycles);
  }

  inStack.delete(node);
}

const SOURCE_GLOBS = ['src/**/*.ts', 'src/**/*.tsx'];
const TEST_IGNORES = [
  '**/*.test.ts',
  '**/*.integration.test.ts',
  '**/.gitkeep',
  '**/*.d.ts',
];

describe('Architecture fitness', () => {
  describe('Given the assessment engine module', () => {
    it('then it has no dependencies on framework or infrastructure modules', async () => {
      const engineFiles = await glob(['src/lib/engine/**/*.ts'], {
        cwd: ROOT,
        ignore: TEST_IGNORES,
        absolute: true,
      });

      const violations: { file: string; import: string }[] = [];

      for (const file of engineFiles) {
        for (const imp of extractImports(file)) {
          const resolved = resolveImportPath(imp, file);
          const checkTarget = resolved ? relative(ROOT, resolved) : imp;

          if (isForbiddenEngineImport(checkTarget)) {
            violations.push({ file: relative(ROOT, file), import: imp });
          }
        }
      }

      expect(
        violations,
        violations
          .map((v) => `  ${v.file} → ${v.import}`)
          .join('\n'),
      ).toHaveLength(0);
    });
  });

  describe('Given the module dependency graph', () => {
    it('then there are no circular dependencies', async () => {
      const allFiles = await glob(SOURCE_GLOBS, {
        cwd: ROOT,
        ignore: TEST_IGNORES,
        absolute: true,
      });

      const graph = buildImportGraph(allFiles);
      const cycles = findCycles(graph);

      const formatted = cycles
        .map((c) => c.map((f) => relative(ROOT, f)).join(' → '))
        .join('\n');

      expect(cycles, `Circular dependencies:\n${formatted}`).toHaveLength(0);
    });
  });
});
