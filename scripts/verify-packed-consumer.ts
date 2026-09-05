import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

interface PackResult {
  filename: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPackResult = (value: unknown): value is PackResult =>
  isRecord(value) && typeof value.filename === 'string';

const packagePath = (root: string, packageName: string): string =>
  join(root, ...packageName.split('/'));

const linkPackage = async (
  sourceNodeModules: string,
  targetNodeModules: string,
  packageName: string,
): Promise<void> => {
  const target = packagePath(targetNodeModules, packageName);
  await mkdir(dirname(target), { recursive: true });
  await symlink(packagePath(sourceNodeModules, packageName), target, 'dir');
};

const runtimeConsumer = `
import assert from 'node:assert/strict';

import {
  AttemptCancellationResultSchema,
  builtInScriptCatalog,
  createRevoScripts,
  ScriptAttemptResultSchema,
  ScriptReconciliationResultSchema,
  systemScripts,
} from '@revisium/revo-scripts';
import { systemEchoScript } from '@revisium/revo-scripts/system';

const terminalEvent = (name, details = {}) => ({
  emissionOrdinal: 1,
  event: {
    name,
    details: {
      script: { id: 'script:test/packed-terminal', version: 1 },
      definitionDigest: 'sha256:${'0'.repeat(64)}',
      attemptOrdinal: 1,
      timestampMs: 0,
      ...details,
    },
  },
});

const echoCatalogEntry = builtInScriptCatalog().find(
  ({ script }) => script.id === 'script:system/echo' && script.version === 1,
);
assert.deepEqual(echoCatalogEntry, {
  script: { id: 'script:system/echo', version: 1 },
  implementation: systemEchoScript.implementation,
});

const echoScripts = createRevoScripts({
  definitions: [systemScripts()],
  providers: [],
  host: {
    resources: { inspect: async () => undefined },
    workspaces: {
      inspect: async () => undefined,
      acquire: async () => { throw new Error('Echo acquires no workspace.'); },
    },
    credentials: {
      inspect: async () => undefined,
      acquire: async () => { throw new Error('Echo acquires no credential.'); },
    },
    clock: { now: () => 1_000, sleep: async () => undefined },
  },
});
const echoBinding = await echoScripts.prepareBinding({
  script: { id: 'script:system/echo', version: 1 },
  resources: {},
  credentials: {},
}, { signal: new AbortController().signal });
const echoAttempt = {
  executionId: 'packed-consumer-echo',
  attemptId: 'packed-consumer-echo:1',
  attemptOrdinal: 1,
  script: echoBinding.script,
  binding: echoBinding,
  input: { message: 'packed consumer' },
};
const observedLiveEventNames = [];
const echoResult = await echoScripts.executeAttempt(echoAttempt, {
  signal: new AbortController().signal,
  events: { emit: async (emission) => { observedLiveEventNames.push(emission.event.name); } },
});
assert.equal(echoResult.kind, 'succeeded');
assert.deepEqual(echoResult.value, { message: 'packed consumer' });
assert.deepEqual(echoResult.evidence, []);
assert.equal(echoResult.terminalEvent.event.name, 'revo.script.succeeded');
assert.equal(echoResult.terminalEvent.event.details.evidenceCount, 0);
assert.deepEqual(observedLiveEventNames, ['revo.script.started']);
assert.deepEqual(
  await echoScripts.reconcileAttempt(echoAttempt, { signal: new AbortController().signal }),
  { kind: 'terminal', result: echoResult },
);
assert.deepEqual(
  await echoScripts.cancelAttempt(
    { executionId: echoAttempt.executionId, attemptId: echoAttempt.attemptId },
    { signal: new AbortController().signal },
  ),
  { kind: 'alreadyTerminal', result: echoResult },
);
assert.deepEqual(
  await echoScripts.cancelAttempt(
    { executionId: 'packed-consumer-unknown', attemptId: 'packed-consumer-unknown:1' },
    { signal: new AbortController().signal },
  ),
  { kind: 'unknown' },
);
assert.deepEqual(
  await echoScripts.reconcileAttempt(
    {
      ...echoAttempt,
      executionId: 'packed-consumer-unknown',
      attemptId: 'packed-consumer-unknown:1',
    },
    { signal: new AbortController().signal },
  ),
  { kind: 'unknown' },
);
assert.deepEqual(
  echoScripts.listManifests().map(({ id, version }) => ({ id, version })),
  [{ id: 'script:system/echo', version: 1 }],
);
assert.deepEqual(echoScripts.listProviderImplementations(), []);

for (const result of [
  {
    kind: 'succeeded',
    value: { message: 'packed consumer' },
    evidence: [],
    terminalEvent: terminalEvent('revo.script.succeeded', { evidenceCount: 0 }),
  },
  {
    kind: 'failed',
    error: {
      code: 'revo.script.provider.rejected',
      message: 'Provider rejected the operation.',
      retryable: false,
      stage: 'provider',
      details: null,
      causes: [],
    },
    evidence: [],
    terminalEvent: terminalEvent('revo.script.failed', {
      code: 'revo.script.provider.rejected', stage: 'provider', retryable: false,
    }),
  },
  { kind: 'cancelled', evidence: [], terminalEvent: terminalEvent('revo.script.cancelled') },
  {
    kind: 'timedOut',
    error: {
      code: 'revo.script.timeout.wall_clock',
      message: 'Script wall-clock deadline expired.',
      retryable: false,
      stage: 'timeout',
      details: null,
      causes: [],
    },
    evidence: [],
    terminalEvent: terminalEvent('revo.script.timed_out', {
      code: 'revo.script.timeout.wall_clock',
    }),
  },
  { kind: 'uncertain', trigger: 'timeout', stage: 'handler', evidence: [] },
]) {
  assert.equal((await ScriptAttemptResultSchema.validate(result)).ok, true);
}
for (const result of [
  { kind: 'acknowledged' },
  {
    kind: 'alreadyTerminal',
    result: { kind: 'cancelled', evidence: [], terminalEvent: terminalEvent('revo.script.cancelled') },
  },
  { kind: 'uncertain', result: { kind: 'uncertain', trigger: 'timeout', stage: 'handler', evidence: [] } },
  { kind: 'notFound' },
  { kind: 'unknown' },
]) {
  assert.equal((await AttemptCancellationResultSchema.validate(result)).ok, true);
}
for (const result of [
  {
    kind: 'terminal',
    result: {
      kind: 'succeeded',
      value: { message: 'packed consumer' },
      evidence: [],
      terminalEvent: terminalEvent('revo.script.succeeded', { evidenceCount: 0 }),
    },
  },
  { kind: 'uncertain', result: { kind: 'uncertain', trigger: 'timeout', stage: 'handler', evidence: [] } },
  { kind: 'notFound' },
  { kind: 'unknown' },
]) {
  assert.equal((await ScriptReconciliationResultSchema.validate(result)).ok, true);
}

await assert.rejects(
  import('@revisium/revo-scripts/dist/application/create-revo-scripts.js'),
  (error) => error instanceof Error && 'code' in error && error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
);
`;

const typeConsumer = `
import {
  builtInScriptCatalog,
  createRevoScripts,
  gitScripts,
  systemScripts,
  type BuiltInScriptDescriptor,
  type RevoScripts,
  type ScriptAttemptResult,
} from '@revisium/revo-scripts';
import type { RevoScriptsHost } from '@revisium/revo-scripts/host';
import type { GitCommitInput } from '@revisium/revo-scripts/git';
import type {
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResult,
} from '@revisium/revo-scripts/github';
import {
  nodeGitProviders,
  type ProcessExecutor,
} from '@revisium/revo-scripts/providers/git';
import {
  systemEchoScript,
  type EchoInput,
  type EchoResult,
} from '@revisium/revo-scripts/system';

declare const host: RevoScriptsHost;
declare const processExecutor: ProcessExecutor;
declare const gitCommitInput: GitCommitInput;
declare const mergeInput: GitHubPullRequestMergeInput;

const catalog: readonly BuiltInScriptDescriptor[] = builtInScriptCatalog();
const echoInput: EchoInput = { message: 'type consumer' };
const echoResult: EchoResult = echoInput;
type MergeApprovalKind = GitHubPullRequestMergeInput['approvalSubject']['kind'];
type MergeResultIssueAction = NonNullable<GitHubPullRequestMergeResult['issueRef']>['action'];
// @ts-expect-error The packed merge input declaration rejects non-merge approval subjects.
const invalidMergeApprovalKind: MergeApprovalKind = 'plan';
// @ts-expect-error The packed merge result declaration cannot emit the input-only none action.
const invalidMergeResultIssueAction: MergeResultIssueAction = 'none';
// @ts-expect-error Packed Git commit declarations keep nested author fields readonly.
gitCommitInput.author.name = 'Mutated author';
// @ts-expect-error Packed Git commit declarations keep the nested author object readonly.
gitCommitInput.author = { name: 'Mutated', email: 'mutated@example.com', timestamp: 'now' };
// @ts-expect-error Packed merge declarations keep nested readiness arrays readonly.
mergeInput.readiness.checks.push({ name: 'mutated', required: false, status: 'success' });
// @ts-expect-error Packed merge declarations keep nested readiness objects readonly.
mergeInput.readiness.completeness.checks = 'truncated';
void catalog;
void echoResult;
void invalidMergeApprovalKind;
void invalidMergeResultIssueAction;
void gitCommitInput;
void mergeInput;
void systemEchoScript;
void systemScripts();

const scripts = createRevoScripts({
  definitions: [gitScripts()],
  providers: nodeGitProviders({ processExecutor }),
  host,
});
const bindingInput = {
  script: { id: 'script:git/status' as const, version: 1 },
  resources: { repository: { resourceRef: 'resource:repository-123' } },
  credentials: {},
};
declare const scriptsFacade: RevoScripts;
const binding = await scriptsFacade.prepareBinding(bindingInput, { signal: new AbortController().signal });
const request = {
  executionId: 'type-consumer',
  attemptId: 'type-consumer:1',
  attemptOrdinal: 1,
  script: binding.script,
  input: {
    resource: 'repository',
    baseCapture: 'git-commit:0123456789abcdef0123456789abcdef01234567',
    headCapture: 'git-tree:89abcdef0123456789abcdef0123456789abcdef',
  },
  binding,
};
const attempt: Promise<ScriptAttemptResult> = scriptsFacade.executeAttempt(request, {
  signal: new AbortController().signal,
  events: { emit: async () => undefined },
});
const describeAttemptResult = (result: ScriptAttemptResult): string => {
  switch (result.kind) {
    case 'succeeded':
    case 'failed':
    case 'cancelled':
    case 'timedOut':
      return result.terminalEvent.event.name;
    case 'uncertain':
      return result.stage;
  }
};
declare const resultForExhaustiveness: ScriptAttemptResult;
void describeAttemptResult(resultForExhaustiveness);
void scripts;
void attempt;
`;

interface PackFile {
  path: string;
}

interface PackManifest {
  files: PackFile[];
}

const isPackManifest = (value: unknown): value is PackManifest =>
  isRecord(value) &&
  Array.isArray(value.files) &&
  value.files.every((file: unknown) => isRecord(file) && typeof file.path === 'string');

const validatePack = (manifest: unknown, packageJson: unknown): void => {
  assert.ok(isPackManifest(manifest));
  assert.ok(isRecord(packageJson) && isRecord(packageJson.exports));
  const paths = manifest.files.map((file) => file.path).sort();
  const requiredPaths = ['LICENSE', 'README.md', 'package.json'];
  for (const entry of Object.values(packageJson.exports)) {
    assert.ok(isRecord(entry));
    for (const target of Object.values(entry)) {
      assert.equal(typeof target, 'string');
      assert.ok(typeof target === 'string' && target.startsWith('./dist/'));
      requiredPaths.push(target.slice(2));
    }
  }
  for (const requiredPath of requiredPaths) {
    assert.ok(paths.includes(requiredPath), `Package is missing ${requiredPath}`);
  }

  const stalePaths = paths.filter((path) =>
    /^(?:dist\/(?:core|spec|definition|registry|execution|validation|facade))(?:\/|$)/.test(path),
  );
  assert.deepEqual(stalePaths, [], `Package contains stale build paths: ${stalePaths.join(', ')}`);

  const unexpectedPaths = paths.filter(
    (path) =>
      !['LICENSE', 'README.md', 'package.json'].includes(path) &&
      !/^dist\/.*\.(?:d\.ts|d\.ts\.map|js|js\.map)$/.test(path),
  );

  assert.deepEqual(unexpectedPaths, [], `Unexpected package files: ${unexpectedPaths.join(', ')}`);
  console.log(`Package content validation passed (${paths.length} files).`);
};

const consumerTsconfig = {
  compilerOptions: {
    target: 'ES2024',
    lib: ['ES2024'],
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    moduleDetection: 'force',
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: false,
    types: ['node'],
  },
  include: ['consumer.ts'],
};

const root = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), 'revo-scripts-packed-consumer-'));
const packDirectory = join(temporaryRoot, 'package');
const consumerDirectory = join(temporaryRoot, 'consumer');
const consumerNodeModules = join(consumerDirectory, 'node_modules');

try {
  await mkdir(packDirectory);
  await mkdir(consumerDirectory);
  const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', packDirectory], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: join(temporaryRoot, 'npm-cache'),
      npm_config_loglevel: 'silent',
    },
  });
  const parsedPackOutput: unknown = JSON.parse(packOutput);

  assert.ok(Array.isArray(parsedPackOutput) && parsedPackOutput.length === 1);
  const packResult: unknown = parsedPackOutput[0];
  assert.ok(isPackResult(packResult));

  const tarball = join(packDirectory, packResult.filename);
  const rawPackageJson: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.ok(isRecord(rawPackageJson) && isRecord(rawPackageJson.dependencies));
  validatePack(packResult, rawPackageJson);
  execFileSync(
    join(root, 'node_modules/.bin/publint'),
    ['run', tarball, '--strict', '--pack=false'],
    { stdio: 'inherit' },
  );
  execFileSync(join(root, 'node_modules/.bin/attw'), [tarball, '--profile', 'esm-only'], {
    stdio: 'inherit',
  });
  const packageDependencies = Object.keys(rawPackageJson.dependencies);
  const installedPackage = packagePath(consumerNodeModules, '@revisium/revo-scripts');

  await mkdir(installedPackage, { recursive: true });
  execFileSync('tar', ['-xzf', tarball, '-C', installedPackage, '--strip-components=1']);
  await Promise.all(
    [...packageDependencies, '@types/node'].map((packageName) =>
      linkPackage(join(root, 'node_modules'), consumerNodeModules, packageName),
    ),
  );
  await writeFile(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' }, undefined, 2)}\n`,
  );
  await writeFile(join(consumerDirectory, 'consumer.mjs'), runtimeConsumer);
  await writeFile(join(consumerDirectory, 'consumer.ts'), typeConsumer);
  await writeFile(
    join(consumerDirectory, 'tsconfig.json'),
    `${JSON.stringify(consumerTsconfig, undefined, 2)}\n`,
  );

  execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], {
    cwd: consumerDirectory,
    stdio: 'pipe',
  });
  execFileSync(process.execPath, ['consumer.mjs'], {
    cwd: consumerDirectory,
    stdio: 'pipe',
  });

  console.log(
    'Packed consumer validation passed (tarball boundary, types, runtime, deep-import denial).',
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
