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
  builtInScriptCatalog,
  createRevoScripts,
  gitScripts,
  systemScripts,
} from '@revisium/revo-scripts';
import { nodeGitProviders } from '@revisium/revo-scripts/providers/git';
import { systemEchoScript } from '@revisium/revo-scripts/system';

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
    workspaces: { resolve: async () => { throw new Error('Echo resolves no workspace.'); } },
    credentials: { resolve: async () => { throw new Error('Echo resolves no credential.'); } },
    events: { emit: async () => undefined },
    clock: { now: () => 1_000, sleep: async () => undefined },
  },
});
assert.deepEqual(await echoScripts.execute({
  executionId: 'packed-consumer-echo',
  script: { id: 'script:system/echo', version: 1 },
  input: { message: 'packed consumer' },
  bindings: { resources: {}, credentials: {} },
}), {
  ok: true,
  value: { message: 'packed consumer' },
  evidence: [],
  attempts: 1,
});

const headSha = '0123456789abcdef0123456789abcdef01234567';
const treeSha = '89abcdef0123456789abcdef0123456789abcdef';
const processRequests = [];
const events = [];
const scripts = createRevoScripts({
  definitions: [gitScripts()],
  providers: nodeGitProviders({
    processExecutor: {
      execute: async (request) => {
        processRequests.push(request);
        const operation = request.args.join(' ');
        const stdout = operation === 'status --porcelain=v2 --branch -z'
          ? '? untracked.txt\\0'
          : operation === 'rev-parse HEAD'
            ? \`\${headSha}\\n\`
            : operation === 'write-tree'
              ? \`\${treeSha}\\n\`
              : '';
        return {
          exitCode: 0,
          stdout,
          stderr: '',
        };
      },
    },
  }),
  host: {
    workspaces: {
      resolve: async (workspaceId) => ({
        workspaceId,
        repositoryId: 'repository-123',
        absolutePath: '/trusted/packed-consumer-worktree',
      }),
    },
    credentials: {
      resolve: async () => {
        throw new Error('Git status must not resolve credentials.');
      },
    },
    events: {
      emit: async (event) => {
        events.push(event);
      },
    },
    clock: {
      now: () => 1_000,
      sleep: async () => undefined,
    },
  },
});
const result = await scripts.execute({
  executionId: 'packed-consumer',
  script: { id: 'script:git/status', version: 1 },
  input: {
    resource: 'repository',
    baseCapture: \`git-commit:\${headSha}\`,
    headCapture: \`git-tree:\${treeSha}\`,
  },
  bindings: {
    resources: {
      repository: {
        resourceId: 'target',
        kind: 'repository',
        repositoryId: 'repository-123',
        workspaceId: 'workspace-456',
        access: 'read',
        grant: {
          permissions: ['git.status.read'],
          effects: ['filesystem.read', 'git.read'],
        },
        providerCoordinates: {},
      },
    },
    credentials: {},
  },
});

assert.deepEqual(result, {
  ok: true,
  value: {
    schemaVersion: 'workspace-change/v1',
    baseCapture: \`git-commit:\${headSha}\`,
    headCapture: \`git-tree:\${treeSha}\`,
    changedPaths: [{ path: 'untracked.txt', status: 'untracked' }],
    clean: false,
  },
  evidence: [],
  attempts: 1,
});
assert.deepEqual(processRequests.map(({ command, args, cwd, maxOutputBytes }) => ({
  command,
  args,
  cwd,
  maxOutputBytes,
})), [
  ['status', '--porcelain=v2', '--branch', '-z'],
  ['rev-parse', 'HEAD'],
  ['read-tree', 'HEAD'],
  ['add', '-A'],
  ['write-tree'],
].map((args) => ({
  command: 'git',
  args,
  cwd: '/trusted/packed-consumer-worktree',
  maxOutputBytes: 1_048_576,
})));
assert.deepEqual(events.map((event) => event.name), [
  'revo.script.started',
  'revo.script.succeeded',
]);

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
  type RevoScriptExecutionRequest,
} from '@revisium/revo-scripts';
import type { RevoScriptsHost } from '@revisium/revo-scripts/host';
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

const catalog: readonly BuiltInScriptDescriptor[] = builtInScriptCatalog();
const echoInput: EchoInput = { message: 'type consumer' };
const echoResult: EchoResult = echoInput;
type MergeApprovalKind = GitHubPullRequestMergeInput['approvalSubject']['kind'];
type MergeResultIssueAction = NonNullable<GitHubPullRequestMergeResult['issueRef']>['action'];
// @ts-expect-error The packed merge input declaration rejects non-merge approval subjects.
const invalidMergeApprovalKind: MergeApprovalKind = 'plan';
// @ts-expect-error The packed merge result declaration cannot emit the input-only none action.
const invalidMergeResultIssueAction: MergeResultIssueAction = 'none';
void catalog;
void echoResult;
void invalidMergeApprovalKind;
void invalidMergeResultIssueAction;
void systemEchoScript;
void systemScripts();

const scripts = createRevoScripts({
  definitions: [gitScripts()],
  providers: nodeGitProviders({ processExecutor }),
  host,
});
const request: RevoScriptExecutionRequest = {
  executionId: 'type-consumer',
  script: { id: 'script:git/status', version: 1 },
  input: {
    resource: 'repository',
    baseCapture: 'git-commit:0123456789abcdef0123456789abcdef01234567',
    headCapture: 'git-tree:89abcdef0123456789abcdef0123456789abcdef',
  },
  bindings: {
    resources: {
      repository: {
        resourceId: 'target',
        kind: 'repository',
        repositoryId: 'repository-123',
        workspaceId: 'workspace-456',
        access: 'read',
        grant: { permissions: ['git.status.read'], effects: ['filesystem.read', 'git.read'] },
        providerCoordinates: {},
      },
    },
    credentials: {},
  },
};

void scripts.execute(request);
`;

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
  const packOutput = execFileSync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_cache: join(temporaryRoot, 'npm-cache'),
        npm_config_loglevel: 'silent',
      },
    },
  );
  const parsedPackOutput: unknown = JSON.parse(packOutput);

  assert.ok(Array.isArray(parsedPackOutput) && parsedPackOutput.length === 1);
  const packResult: unknown = parsedPackOutput[0];
  assert.ok(isPackResult(packResult));

  const tarball = join(packDirectory, packResult.filename);
  const rawPackageJson: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.ok(isRecord(rawPackageJson) && isRecord(rawPackageJson.dependencies));
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
