import { expect, test } from 'vitest';

import { PorcelainV2Parser } from '../../../src/providers/git/adapters/node/status/porcelain-v2-parser.js';
import {
  captureProviderFault,
  gitProviderHeadSha,
} from '../../support/git/git-provider-fixture.js';

test('returns sorted bounded paths for tracked, renamed, conflicted and untracked changes', () => {
  const output = [
    `# branch.oid ${gitProviderHeadSha}`,
    '# branch.head feature',
    `1 M. N... 100644 100644 100644 ${gitProviderHeadSha} ${gitProviderHeadSha} staged.txt`,
    `2 .M N... 100644 100644 100644 ${gitProviderHeadSha} ${gitProviderHeadSha} R100 renamed.txt`,
    'renamed-from.txt',
    `u UU N... 100644 100644 100644 100644 ${gitProviderHeadSha} ${gitProviderHeadSha} ${gitProviderHeadSha} conflict.txt`,
    '? untracked.txt',
    '! ignored.txt',
    '',
  ].join('\0');

  const changedPaths = new PorcelainV2Parser().parseChangedPaths(output);

  expect(changedPaths).toEqual([
    { path: 'conflict.txt', status: 'modified' },
    { path: 'renamed.txt', status: 'renamed' },
    { path: 'staged.txt', status: 'modified' },
    { path: 'untracked.txt', status: 'untracked' },
  ]);
});

test('does not retain paths between independent payloads', () => {
  const parser = new PorcelainV2Parser();

  const dirty = parser.parseChangedPaths('? untracked.txt\0');
  const clean = parser.parseChangedPaths('');

  expect({ dirty, clean }).toEqual({
    dirty: [{ path: 'untracked.txt', status: 'untracked' }],
    clean: [],
  });
});

test('rejects unsupported records and incomplete rename records', async () => {
  const failures = await Promise.all(
    [
      '3 unsupported\0',
      `2 R. N... 100644 100644 100644 ${gitProviderHeadSha} ${gitProviderHeadSha} R100 renamed.txt\0`,
    ].map((output) =>
      captureProviderFault(() =>
        Promise.resolve(new PorcelainV2Parser().parseChangedPaths(output)),
      ),
    ),
  );

  expect(failures).toEqual([
    {
      name: 'ScriptFault',
      code: 'revo.script.provider.invalid_response',
      message: 'Git returned an unsupported repository status record.',
      retryable: false,
    },
    {
      name: 'ScriptFault',
      code: 'revo.script.provider.invalid_response',
      message: 'Git returned an invalid changed path.',
      retryable: false,
    },
  ]);
});

test('parses a large bounded status without recursive stack growth', () => {
  const output = [...Array.from({ length: 2_048 }, (_, index) => `? file-${index}`), ''].join('\0');

  const changedPaths = new PorcelainV2Parser().parseChangedPaths(output);

  expect({ count: changedPaths.length, first: changedPaths[0], last: changedPaths.at(-1) }).toEqual(
    {
      count: 2_048,
      first: { path: 'file-0', status: 'untracked' },
      last: { path: 'file-999', status: 'untracked' },
    },
  );
});
