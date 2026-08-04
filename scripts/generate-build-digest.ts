import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, relative, resolve as resolveHostPath, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export type IdentityPathStyle = 'posix' | 'win32';
export type OutputFile = Readonly<{ path: string; relativePath: string }>;
type ProviderIdentityEntry = Readonly<{
  constantName: string;
  entryPath: string;
  sourcePath: string;
}>;

const repositoryRoot =
  process.env.REVO_SCRIPTS_BUILD_DIGEST_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const generatedDirectory = join(repositoryRoot, 'src/runtime/generated');
const generatedDigestPath = join(generatedDirectory, 'build-digest.ts');
const generatedImplementationPath = join(generatedDirectory, 'built-in-implementation.ts');

const providerIdentityEntries: readonly ProviderIdentityEntry[] = [
  {
    constantName: 'nodeGitProviderImplementationDigest',
    entryPath: 'providers/git/adapters/node/node-git-provider.js',
    sourcePath: join(repositoryRoot, 'src/providers/git/adapters/node/node-git-providers.ts'),
  },
  {
    constantName: 'fetchGitHubProviderImplementationDigest',
    entryPath: 'providers/github/adapters/fetch/fetch-github-provider.js',
    sourcePath: join(
      repositoryRoot,
      'src/providers/github/adapters/fetch/fetch-github-providers.ts',
    ),
  },
];

const hostIdentityPathStyle: IdentityPathStyle = process.platform === 'win32' ? 'win32' : 'posix';

const builtInDefinitionEntries = [
  ['script:approval/subject', 'scripts/approval/subject/script.js'],
  ['script:system/echo', 'scripts/system/echo/script.js'],
  ['script:git/commit', 'scripts/git/commit/script.js'],
  ['script:git/push', 'scripts/git/push/script.js'],
  ['script:git/status', 'scripts/git/status/script.js'],
  ['script:github/pull-request/mark-ready', 'scripts/github/pull-request/mark-ready/script.js'],
  ['script:github/pull-request/merge', 'scripts/github/pull-request/merge/script.js'],
  ['script:github/pull-request/readiness', 'scripts/github/pull-request/readiness/script.js'],
  ['script:github/pull-request/upsert', 'scripts/github/pull-request/upsert/script.js'],
  ['script:github/review-threads/resolve', 'scripts/github/review-thread/resolve/script.js'],
  ['script:github/review-threads/respond', 'scripts/github/review-thread/respond/script.js'],
] as const;

const collectJavaScriptFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<readonly string[]> => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectJavaScriptFiles(path);
      }
      return entry.isFile() && path.endsWith('.js') ? [path] : [];
    }),
  );
  return nested.flat();
};

export const normalizeIdentityPath = (path: string): string => path.replaceAll('\\', '/');

const compareIdentityPaths = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const resolveImportedIdentityPath = (
  importerPath: string,
  importedPath: string,
  style: IdentityPathStyle,
): string => {
  const pathApi = style === 'win32' ? win32 : posix;
  const inStyle = (path: string): string =>
    normalizeIdentityPath(path).split('/').join(pathApi.sep);
  const resolvedPath = pathApi.relative(
    pathApi.sep,
    pathApi.resolve(pathApi.sep, pathApi.dirname(inStyle(importerPath)), inStyle(importedPath)),
  );
  return normalizeIdentityPath(resolvedPath);
};

const outputFiles = async (directory: string): Promise<readonly OutputFile[]> =>
  (await collectJavaScriptFiles(directory))
    .map((path) => ({ path, relativePath: normalizeIdentityPath(relative(directory, path)) }))
    .filter(({ relativePath }) => !relativePath.startsWith('runtime/generated/'))
    .sort((left, right) => compareIdentityPaths(left.relativePath, right.relativePath));

const importedRelativePaths = (source: string): readonly string[] =>
  [...source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g)].map(
    (match) => {
      const importedPath = match[1];
      if (importedPath === undefined) {
        throw new Error('Expected a relative import path.');
      }
      return importedPath;
    },
  );

export const digestForEmittedClosure = async (
  entryPath: string,
  filesByPath: ReadonlyMap<string, OutputFile>,
  pathStyle: IdentityPathStyle = hostIdentityPathStyle,
): Promise<string> => {
  const closure = new Map<string, OutputFile>();
  const visit = async (relativePath: string): Promise<void> => {
    const normalizedPath = normalizeIdentityPath(relativePath);
    if (closure.has(normalizedPath)) {
      return;
    }
    const file = filesByPath.get(normalizedPath);
    if (file === undefined) {
      throw new Error(`Emitted runtime closure is missing ${normalizedPath}.`);
    }
    closure.set(normalizedPath, file);
    const source = await readFile(file.path, 'utf8');
    await Promise.all(
      importedRelativePaths(source).map(async (importedPath) => {
        const resolvedPath = resolveImportedIdentityPath(normalizedPath, importedPath, pathStyle);
        if (filesByPath.has(resolvedPath)) {
          await visit(resolvedPath);
        }
      }),
    );
  };

  await visit(entryPath);
  const digest = createHash('sha256');
  const files = [...closure.values()].sort((left, right) =>
    compareIdentityPaths(left.relativePath, right.relativePath),
  );
  const contents = await Promise.all(
    files.map(async (file) => ({ file, bytes: await readFile(file.path) })),
  );
  for (const { file, bytes } of contents) {
    digest.update(file.relativePath, 'utf8');
    digest.update('\0');
    digest.update(String(bytes.byteLength), 'utf8');
    digest.update('\0');
    digest.update(bytes);
    digest.update('\0');
  }
  return `sha256:${digest.digest('hex')}`;
};

const buildDigestSource = (digests: ReadonlyMap<string, string>): string =>
  '// Generated by scripts/generate-build-digest.ts. Do not edit by hand.\n' +
  'export const builtInBuildDigests = {\n' +
  [...digests]
    .map(([scriptId, digest]) =>
      scriptId.length + 80 > 100
        ? `  '${scriptId}':\n    '${digest}',`
        : `  '${scriptId}': '${digest}',`,
    )
    .join('\n') +
  '\n} as const;\n';

const buildImplementationSource = (digests: ReadonlyMap<string, string>): string =>
  '// Generated by scripts/generate-build-digest.ts. Do not edit by hand.\n' +
  'export const builtInImplementation = (scriptId: string, version: string) => {\n' +
  '  switch (scriptId) {\n' +
  [...digests]
    .map(
      ([scriptId, digest]) =>
        `    case '${scriptId}': {\n` +
        '      return {\n' +
        `        id: 'revo.builtin.${scriptId.replace(/[:/]/g, '-')}',\n` +
        '        version,\n' +
        '        buildDigest:\n' +
        `          '${digest}' as const,\n` +
        '      };\n' +
        '    }',
    )
    .join('\n') +
  '\n    default: {\n' +
  '      throw new Error(`Unknown built-in script id: ${scriptId}`);\n' +
  '    }\n' +
  '  }\n' +
  '};\n';

const escapedRegularExpression = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isTopLevelCodePosition = (source: string, position: number): boolean => {
  let state:
    | 'code'
    | 'single-quote'
    | 'double-quote'
    | 'template'
    | 'line-comment'
    | 'block-comment' = 'code';
  let blockDepth = 0;

  for (let index = 0; index < position; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (state === 'code') {
      if (character === '/' && nextCharacter === '/') {
        state = 'line-comment';
        index += 1;
      } else if (character === '/' && nextCharacter === '*') {
        state = 'block-comment';
        index += 1;
      } else if (character === "'") {
        state = 'single-quote';
      } else if (character === '"') {
        state = 'double-quote';
      } else if (character === '`') {
        state = 'template';
      } else if (character === '{') {
        blockDepth += 1;
      } else if (character === '}') {
        blockDepth -= 1;
      }
      continue;
    }

    if (state === 'line-comment') {
      if (character === '\n') {
        state = 'code';
      }
      continue;
    }

    if (state === 'block-comment') {
      if (character === '*' && nextCharacter === '/') {
        state = 'code';
        index += 1;
      }
      continue;
    }

    if (character === '\\') {
      index += 1;
      continue;
    }
    if (
      (state === 'single-quote' && character === "'") ||
      (state === 'double-quote' && character === '"') ||
      (state === 'template' && character === '`')
    ) {
      state = 'code';
    }
  }

  return state === 'code' && blockDepth === 0;
};

export const replaceProviderIdentityPin = (
  source: string,
  constantName: string,
  digest: string,
): string => {
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`Replacement provider identity pin ${constantName} is malformed.`);
  }

  const assignment = new RegExp(
    `^const\\s+${escapedRegularExpression(constantName)}\\s*=\\s*(['"])([^'"\\r\\n]*)\\1\\s+as\\s+const\\s*;`,
    'gm',
  );
  const matches = [...source.matchAll(assignment)].filter(
    (match) => match.index !== undefined && isTopLevelCodePosition(source, match.index),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one provider identity pin named ${constantName}; found ${matches.length}.`,
    );
  }

  const match = matches[0];
  if (match === undefined) {
    throw new Error(`Provider identity pin ${constantName} could not be read.`);
  }
  const currentDigest = match[2];
  if (currentDigest === undefined || !/^sha256:[0-9a-f]{64}$/.test(currentDigest)) {
    throw new Error(`Provider identity pin ${constantName} must be a lowercase SHA-256 digest.`);
  }
  if (match.index === undefined) {
    throw new Error(`Provider identity pin ${constantName} has no source position.`);
  }

  const digestOffset = match[0].indexOf(currentDigest);
  const digestStart = match.index + digestOffset;
  return source.slice(0, digestStart) + digest + source.slice(digestStart + currentDigest.length);
};

const generate = async (): Promise<void> => {
  const temporaryOutput = await mkdtemp(join(tmpdir(), 'revo-scripts-build-'));
  try {
    execFileSync(
      'tsc',
      ['-p', 'tsconfig.build.json', '--outDir', temporaryOutput, '--sourceMap', 'false'],
      { cwd: repositoryRoot, stdio: 'inherit' },
    );
    const files = await outputFiles(temporaryOutput);
    const filesByPath = new Map(files.map((file) => [file.relativePath, file]));
    const digests = new Map(
      await Promise.all(
        builtInDefinitionEntries.map(
          async ([scriptId, entryPath]) =>
            [scriptId, await digestForEmittedClosure(entryPath, filesByPath)] as const,
        ),
      ),
    );
    const digestSource = buildDigestSource(digests);
    const implementationSource = buildImplementationSource(digests);
    const providerIdentitySources = await Promise.all(
      providerIdentityEntries.map(async (entry) => {
        const source = await readFile(entry.sourcePath, 'utf8');
        return {
          entry,
          source: replaceProviderIdentityPin(
            source,
            entry.constantName,
            await digestForEmittedClosure(entry.entryPath, filesByPath),
          ),
        };
      }),
    );
    if (process.argv.includes('--check')) {
      if (
        (await readFile(generatedDigestPath, 'utf8')) !== digestSource ||
        (await readFile(generatedImplementationPath, 'utf8')) !== implementationSource ||
        (
          await Promise.all(
            providerIdentitySources.map(
              async ({ entry, source }) => (await readFile(entry.sourcePath, 'utf8')) === source,
            ),
          )
        ).includes(false)
      ) {
        throw new Error('Generated identity metadata is stale. Run pnpm build:identity:generate.');
      }
      return;
    }
    await Promise.all([
      writeFile(generatedDigestPath, digestSource),
      writeFile(generatedImplementationPath, implementationSource),
      ...providerIdentitySources.map(({ entry, source }) => writeFile(entry.sourcePath, source)),
    ]);
  } finally {
    await rm(temporaryOutput, { recursive: true, force: true });
  }
};

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolveHostPath(invokedPath) === fileURLToPath(import.meta.url)) {
  await generate();
}
