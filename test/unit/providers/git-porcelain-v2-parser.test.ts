import { expect, test } from 'vitest';

import { PorcelainV2Parser } from '../../../src/providers/git/adapters/node/status/porcelain-v2-parser.js';
import {
  captureProviderFault,
  createStatusClient,
  gitProviderHeadSha,
  gitProviderSignal,
} from '../../support/git/git-provider-fixture.js';

test('parses attached, detached, initial, staged, unstaged, conflict and untracked states', async () => {
  const attached = await createStatusClient(
    [
      `# branch.oid ${gitProviderHeadSha}`,
      '# branch.head feature',
      `1 M. N... 100644 100644 100644 ${gitProviderHeadSha} ${gitProviderHeadSha} staged.txt`,
      `2 .M N... 100644 100644 100644 ${gitProviderHeadSha} ${gitProviderHeadSha} R100 renamed.txt`,
      'renamed-from.txt',
      `u UU N... 100644 100644 100644 100644 ${gitProviderHeadSha} ${gitProviderHeadSha} ${gitProviderHeadSha} conflict.txt`,
      '? untracked.txt',
      '! ignored.txt',
      '# branch.ab +1 -2',
      '',
    ].join('\0'),
  ).readStatus(gitProviderSignal);
  const detached = await createStatusClient(
    [`# branch.oid ${gitProviderHeadSha}`, '# branch.head (detached)', ''].join('\0'),
  ).readStatus(gitProviderSignal);
  const initial = await createStatusClient(
    ['# branch.oid (initial)', '# branch.head master', ''].join('\0'),
  ).readStatus(gitProviderSignal);

  expect({ attached, detached, initial }).toEqual({
    attached: {
      branch: 'feature',
      headSha: gitProviderHeadSha,
      detached: false,
      stagedCount: 1,
      unstagedCount: 1,
      untrackedCount: 1,
      conflictedCount: 1,
    },
    detached: {
      branch: null,
      headSha: gitProviderHeadSha,
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

test('resets parser state between independent status payloads', () => {
  const parser = new PorcelainV2Parser();

  const dirty = parser.parse(
    [`# branch.oid ${gitProviderHeadSha}`, '# branch.head feature', '? untracked.txt', ''].join(
      '\0',
    ),
  );
  const clean = parser.parse(
    [`# branch.oid ${gitProviderHeadSha}`, '# branch.head master', ''].join('\0'),
  );

  expect({ dirty, clean }).toEqual({
    dirty: {
      branch: 'feature',
      headSha: gitProviderHeadSha,
      detached: false,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 1,
      conflictedCount: 0,
    },
    clean: {
      branch: 'master',
      headSha: gitProviderHeadSha,
      detached: false,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
    },
  });
});

test('rejects malformed and unsupported porcelain records', async () => {
  const cases = [
    '# branch.oid invalid\0# branch.head master\0',
    `# branch.oid ${gitProviderHeadSha}\0# branch.head (detached)\0# branch.oid (initial)\0`,
    `# branch.oid ${gitProviderHeadSha}\0`,
    [`# branch.oid ${gitProviderHeadSha}`, '# branch.head master', '3 unsupported', ''].join('\0'),
    [`# branch.oid ${gitProviderHeadSha}`, '# branch.head master', '1 X broken', ''].join('\0'),
    [
      `# branch.oid ${gitProviderHeadSha}`,
      '# branch.head master',
      `2 R. N... 100644 100644 100644 ${gitProviderHeadSha} ${gitProviderHeadSha} R100 renamed.txt`,
      '',
    ].join('\0'),
  ];

  const failures = await Promise.all(
    cases.map((stdout) =>
      captureProviderFault(() => createStatusClient(stdout).readStatus(gitProviderSignal)),
    ),
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

test('parses a large bounded status without recursive stack growth', async () => {
  const records = Array.from({ length: 50_000 }, (_, index) => `? file-${index}`);
  const stdout = [
    `# branch.oid ${gitProviderHeadSha}`,
    '# branch.head master',
    ...records,
    '',
  ].join('\0');

  const status = await createStatusClient(stdout).readStatus(gitProviderSignal);

  expect(status).toEqual({
    branch: 'master',
    headSha: gitProviderHeadSha,
    detached: false,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 50_000,
    conflictedCount: 0,
  });
});
