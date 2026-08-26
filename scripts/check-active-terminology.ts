import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['src', 'test', 'docs'];
const topLevelFiles = ['README.md', 'REPOSITORY.md', 'AGENTS.md', 'REVIEW.md'];
const historicalFiles = new Set(['docs/adr/0001-script-sdk-and-runtime-boundary.md']);
const forbidden = /\beffects?\b|effectClass|ScriptEffect/iu;

const collectFiles = async (path: string): Promise<readonly string[]> => {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        return await collectFiles(child);
      }
      return entry.isFile() && (child.endsWith('.ts') || child.endsWith('.md')) ? [child] : [];
    }),
  );
  return nested.flat();
};

const activeFiles = [
  ...(await Promise.all(roots.map(collectFiles))).flat(),
  ...topLevelFiles,
].filter((path) => !historicalFiles.has(path));
const matches = await Promise.all(
  activeFiles.map(async (path) => {
    const text = await readFile(path, 'utf8');
    return forbidden.test(text) ? path : undefined;
  }),
);
const failures = matches.filter((path): path is string => path !== undefined);

if (failures.length > 0) {
  throw new Error(
    `Active terminology still contains removed effect vocabulary: ${failures.join(', ')}`,
  );
}
