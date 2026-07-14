import { expect, test } from 'vitest';

import { ScriptFault } from '../../../src/core/spec/script-errors.js';
import { createGitStatusClient } from '../../../src/providers/git/adapters/node/revisions/r1/status-client.js';
import { nodeGitProviders, type ProcessExecutor } from '../../../src/providers/git/index.js';
import { gitStatusScript } from '../../../src/scripts/git/status/versions/1.0.0/script.js';

const headSha = '0123456789abcdef0123456789abcdef01234567';
const signal = new AbortController().signal;

const captureFault = async (operation: () => Promise<unknown>) => {
  try {
    await operation();
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new TypeError('Expected operation to throw an Error.', { cause: error });
    }

    return {
      name: error.name,
      code: error instanceof ScriptFault ? error.code : undefined,
      message: error.message,
      retryable: error instanceof ScriptFault ? error.retryable : undefined,
    };
  }

  throw new Error('Expected operation to fail.');
};

const createClient = (stdout: string) =>
  createGitStatusClient(async () => ({ exitCode: 0, stdout, stderr: '' }), '/tmp/repository');

test('parses attached, detached, initial, staged, unstaged, conflict and untracked states', async () => {
  const attached = await createClient(
    [
      `# branch.oid ${headSha}`,
      '# branch.head feature',
      `1 M. N... 100644 100644 100644 ${headSha} ${headSha} staged.txt`,
      `2 .M N... 100644 100644 100644 ${headSha} ${headSha} R100 renamed.txt`,
      'renamed-from.txt',
      `u UU N... 100644 100644 100644 100644 ${headSha} ${headSha} ${headSha} conflict.txt`,
      '? untracked.txt',
      '! ignored.txt',
      '# branch.ab +1 -2',
      '',
    ].join('\0'),
  ).readStatus(signal);
  const detached = await createClient(
    [`# branch.oid ${headSha}`, '# branch.head (detached)', ''].join('\0'),
  ).readStatus(signal);
  const initial = await createClient(
    ['# branch.oid (initial)', '# branch.head master', ''].join('\0'),
  ).readStatus(signal);

  expect({ attached, detached, initial }).toEqual({
    attached: {
      branch: 'feature',
      headSha,
      detached: false,
      stagedCount: 1,
      unstagedCount: 1,
      untrackedCount: 1,
      conflictedCount: 1,
    },
    detached: {
      branch: null,
      headSha,
      detached: true,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
    },
    initial: {
      branch: 'master',
      headSha: null,
      detached: false,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
    },
  });
});

test('maps process and output failures without exposing provider output', async () => {
  const processFailure = createGitStatusClient(async () => {
    throw new Error('secret process diagnostics');
  }, '/tmp/repository');
  const exitFailure = createGitStatusClient(
    async () => ({ exitCode: 128, stdout: '', stderr: 'secret git diagnostics' }),
    '/tmp/repository',
  );
  const oversized = createGitStatusClient(
    async () => ({ exitCode: 0, stdout: '', stderr: 'x'.repeat(1_048_577) }),
    '/tmp/repository',
  );

  expect({
    process: await captureFault(() => processFailure.readStatus(signal)),
    exit: await captureFault(() => exitFailure.readStatus(signal)),
    oversized: await captureFault(() => oversized.readStatus(signal)),
  }).toEqual({
    process: {
      name: 'ScriptFault',
      code: 'revo.script.provider.unavailable',
      message: 'Git status execution failed.',
      retryable: false,
    },
    exit: {
      name: 'ScriptFault',
      code: 'revo.script.provider.unavailable',
      message: 'Git status execution failed.',
      retryable: false,
    },
    oversized: {
      name: 'ScriptFault',
      code: 'revo.script.provider.invalid_response',
      message: 'Git status output exceeded the configured limit.',
      retryable: false,
    },
  });
});

test('rejects malformed and unsupported porcelain records', async () => {
  const cases = [
    '# branch.oid invalid\0# branch.head master\0',
    `# branch.oid ${headSha}\0# branch.head (detached)\0# branch.oid (initial)\0`,
    `# branch.oid ${headSha}\0`,
    [`# branch.oid ${headSha}`, '# branch.head master', '3 unsupported', ''].join('\0'),
    [`# branch.oid ${headSha}`, '# branch.head master', '1 X broken', ''].join('\0'),
    [
      `# branch.oid ${headSha}`,
      '# branch.head master',
      `2 R. N... 100644 100644 100644 ${headSha} ${headSha} R100 renamed.txt`,
      '',
    ].join('\0'),
  ];

  const failures = await Promise.all(
    cases.map((stdout) => captureFault(() => createClient(stdout).readStatus(signal))),
  );

  expect(failures).toEqual([
    {
      name: 'ScriptFault',
      code: 'revo.script.provider.invalid_response',
      message: 'Git returned an invalid repository status.',
      retryable: false,
    },
    {
      name: 'ScriptFault',
      code: 'revo.script.provider.invalid_response',
      message: 'Git returned an invalid detached repository status.',
      retryable: false,
    },
    {
      name: 'ScriptFault',
      code: 'revo.script.provider.invalid_response',
      message: 'Git returned an incomplete repository status.',
      retryable: false,
    },
    {
      name: 'ScriptFault',
      code: 'revo.script.provider.invalid_response',
      message: 'Git returned an unsupported repository status record.',
      retryable: false,
    },
    {
      name: 'ScriptFault',
      code: 'revo.script.provider.invalid_response',
      message: 'Git returned an invalid tracked status record.',
      retryable: false,
    },
    {
      name: 'ScriptFault',
      code: 'revo.script.provider.invalid_response',
      message: 'Git returned an incomplete rename status record.',
      retryable: false,
    },
  ]);
});

test('retains one exact provider revision and validates factory selection', async () => {
  const processExecutor: ProcessExecutor = async () => ({ exitCode: 0, stdout: '', stderr: '' });
  const registrations = nodeGitProviders({ processExecutor, defaultRevision: 'r1' });
  const provider = registrations[0]?.module;

  expect(
    await captureFault(async () => {
      nodeGitProviders({ processExecutor, defaultRevision: 'r2' });
    }),
  ).toEqual({
    name: 'TypeError',
    code: undefined,
    message: 'Unknown Node Git provider revision.',
    retryable: undefined,
  });

  expect(provider).toBeDefined();
  expect(
    await captureFault(() =>
      provider!.createResourceClients({
        manifest: gitStatusScript.manifest,
        provider: gitStatusScript.manifest.providers[0]!,
        requirement: gitStatusScript.manifest.resources[0]!,
        binding: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          access: 'read',
          grant: { permissions: ['git.status.read'], effects: ['git.read'] },
          providerCoordinates: {},
        },
        credentials: {},
        signal,
      }),
    ),
  ).toEqual({
    name: 'ScriptFault',
    code: 'revo.script.provider.workspace_required',
    message: 'The Git provider requires a resolved workspace.',
    retryable: false,
  });
});

test('parses a large bounded status without recursive stack growth', async () => {
  const records = Array.from({ length: 50_000 }, (_, index) => `? file-${index}`);
  const stdout = [`# branch.oid ${headSha}`, '# branch.head master', ...records, ''].join('\0');

  const status = await createClient(stdout).readStatus(signal);

  expect(status).toEqual({
    branch: 'master',
    headSha,
    detached: false,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 50_000,
    conflictedCount: 0,
  });
});
