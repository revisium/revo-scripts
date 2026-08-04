import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));

const providerIdentityCases = [
  {
    name: 'Node Git',
    changedSource: 'src/providers/git/adapters/node/node-git-command-runner.ts',
    generatedIdentity:
      'src/providers/git/adapters/node/generated-provider-implementation-digest.ts',
    unrelatedIdentity:
      'src/providers/github/adapters/fetch/generated-provider-implementation-digest.ts',
  },
  {
    name: 'Fetch GitHub',
    changedSource: 'src/providers/github/adapters/fetch/github-api-client.ts',
    generatedIdentity:
      'src/providers/github/adapters/fetch/generated-provider-implementation-digest.ts',
    unrelatedIdentity:
      'src/providers/git/adapters/node/generated-provider-implementation-digest.ts',
  },
] as const;

const definitionDigests = (source: string): ReadonlyMap<string, string> =>
  new Map(
    [...source.matchAll(/'(script:[^']+)':\s*'(sha256:[0-9a-f]{64})'/g)].map((match) => {
      const scriptId = match[1];
      const digest = match[2];
      if (scriptId === undefined || digest === undefined) {
        throw new Error('Expected a complete generated definition digest entry.');
      }
      return [scriptId, digest] as const;
    }),
  );

test('rejects generated definition digests that are stale after a handler change in an isolated fixture', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'revo-scripts-build-digest-fixture-'));
  const sourceDigest = join(repositoryRoot, 'src/runtime/generated/build-digest.ts');

  try {
    await Promise.all([
      cp(join(repositoryRoot, 'src'), join(fixture, 'src'), { recursive: true }),
      cp(join(repositoryRoot, 'scripts'), join(fixture, 'scripts'), { recursive: true }),
      cp(join(repositoryRoot, 'package.json'), join(fixture, 'package.json')),
      cp(join(repositoryRoot, 'tsconfig.build.json'), join(fixture, 'tsconfig.build.json')),
      cp(join(repositoryRoot, 'tsconfig.json'), join(fixture, 'tsconfig.json')),
    ]);
    await symlink(join(repositoryRoot, 'node_modules'), join(fixture, 'node_modules'));
    const originalDigest = await readFile(sourceDigest, 'utf8');
    await writeFile(
      join(fixture, 'src/scripts/git/status/git-status.handler.ts'),
      `${await readFile(join(fixture, 'src/scripts/git/status/git-status.handler.ts'), 'utf8')}\n// fixture handler change\n`,
    );

    let failure: unknown;
    try {
      await execFileAsync(
        process.execPath,
        [
          '--experimental-strip-types',
          join(repositoryRoot, 'scripts/generate-build-digest.ts'),
          '--check',
        ],
        {
          cwd: fixture,
          env: {
            ...process.env,
            PATH: `${join(repositoryRoot, 'node_modules/.bin')}:${process.env.PATH ?? ''}`,
            REVO_SCRIPTS_BUILD_DIGEST_ROOT: fixture,
          },
        },
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) {
      throw new Error('Expected the isolated stale-digest check to fail.');
    }
    expect(failure.message).toContain('Generated identity metadata is stale');
    await expect(readFile(sourceDigest, 'utf8')).resolves.toBe(originalDigest);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('changes only the affected definition digest when an unrelated built-in handler changes', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'revo-scripts-build-digest-fixture-'));
  const fixtureDigest = join(fixture, 'src/runtime/generated/build-digest.ts');

  try {
    await Promise.all([
      cp(join(repositoryRoot, 'src'), join(fixture, 'src'), { recursive: true }),
      cp(join(repositoryRoot, 'scripts'), join(fixture, 'scripts'), { recursive: true }),
      cp(join(repositoryRoot, 'package.json'), join(fixture, 'package.json')),
      cp(join(repositoryRoot, 'tsconfig.build.json'), join(fixture, 'tsconfig.build.json')),
      cp(join(repositoryRoot, 'tsconfig.json'), join(fixture, 'tsconfig.json')),
    ]);
    await symlink(join(repositoryRoot, 'node_modules'), join(fixture, 'node_modules'));
    const before = await readFile(fixtureDigest, 'utf8');
    await writeFile(
      join(fixture, 'src/scripts/git/push/git-push.handler.ts'),
      `${await readFile(join(fixture, 'src/scripts/git/push/git-push.handler.ts'), 'utf8')}\n// fixture handler change\n`,
    );
    await execFileAsync(
      process.execPath,
      ['--experimental-strip-types', join(repositoryRoot, 'scripts/generate-build-digest.ts')],
      {
        cwd: fixture,
        env: {
          ...process.env,
          PATH: `${join(repositoryRoot, 'node_modules/.bin')}:${process.env.PATH ?? ''}`,
          REVO_SCRIPTS_BUILD_DIGEST_ROOT: fixture,
        },
      },
    );
    const after = await readFile(fixtureDigest, 'utf8');

    expect(after).not.toEqual(before);
    expect(after.match(/'script:git\/status': '(sha256:[0-9a-f]{64})'/)?.[1]).toEqual(
      before.match(/'script:git\/status': '(sha256:[0-9a-f]{64})'/)?.[1],
    );
    expect(after.match(/'script:git\/push': '(sha256:[0-9a-f]{64})'/)?.[1]).not.toEqual(
      before.match(/'script:git\/push': '(sha256:[0-9a-f]{64})'/)?.[1],
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('does not change existing definition digests when an unrelated script is added', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'revo-scripts-build-digest-fixture-'));
  const fixtureDigest = join(fixture, 'src/runtime/generated/build-digest.ts');

  try {
    await Promise.all([
      cp(join(repositoryRoot, 'src'), join(fixture, 'src'), { recursive: true }),
      cp(join(repositoryRoot, 'scripts'), join(fixture, 'scripts'), { recursive: true }),
      cp(join(repositoryRoot, 'package.json'), join(fixture, 'package.json')),
      cp(join(repositoryRoot, 'tsconfig.build.json'), join(fixture, 'tsconfig.build.json')),
      cp(join(repositoryRoot, 'tsconfig.json'), join(fixture, 'tsconfig.json')),
    ]);
    await symlink(join(repositoryRoot, 'node_modules'), join(fixture, 'node_modules'));
    const before = await readFile(fixtureDigest, 'utf8');
    await writeFile(
      join(fixture, 'src/scripts/unrelated.ts'),
      "export const unrelated = 'fixture';\n",
    );
    await execFileAsync(
      process.execPath,
      ['--experimental-strip-types', join(repositoryRoot, 'scripts/generate-build-digest.ts')],
      {
        cwd: fixture,
        env: {
          ...process.env,
          PATH: `${join(repositoryRoot, 'node_modules/.bin')}:${process.env.PATH ?? ''}`,
          REVO_SCRIPTS_BUILD_DIGEST_ROOT: fixture,
        },
      },
    );

    expect(await readFile(fixtureDigest, 'utf8')).toEqual(before);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test.each(providerIdentityCases)(
  'rejects stale generated $name provider implementation identity',
  async ({ changedSource }) => {
    const fixture = await mkdtemp(join(tmpdir(), 'revo-scripts-provider-digest-fixture-'));

    try {
      await Promise.all([
        cp(join(repositoryRoot, 'src'), join(fixture, 'src'), { recursive: true }),
        cp(join(repositoryRoot, 'scripts'), join(fixture, 'scripts'), { recursive: true }),
        cp(join(repositoryRoot, 'package.json'), join(fixture, 'package.json')),
        cp(join(repositoryRoot, 'tsconfig.build.json'), join(fixture, 'tsconfig.build.json')),
        cp(join(repositoryRoot, 'tsconfig.json'), join(fixture, 'tsconfig.json')),
      ]);
      await symlink(join(repositoryRoot, 'node_modules'), join(fixture, 'node_modules'));
      const changedPath = join(fixture, changedSource);
      await writeFile(
        changedPath,
        `${await readFile(changedPath, 'utf8')}\n// fixture provider change\n`,
      );

      let failure: unknown;
      try {
        await execFileAsync(
          process.execPath,
          [
            '--experimental-strip-types',
            join(repositoryRoot, 'scripts/generate-build-digest.ts'),
            '--check',
          ],
          {
            cwd: fixture,
            env: {
              ...process.env,
              PATH: `${join(repositoryRoot, 'node_modules/.bin')}:${process.env.PATH ?? ''}`,
              REVO_SCRIPTS_BUILD_DIGEST_ROOT: fixture,
            },
          },
        );
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(Error);
      if (!(failure instanceof Error)) {
        throw new Error('Expected the isolated stale-identity check to fail.');
      }
      expect(failure.message).toContain('Generated identity metadata is stale');
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);

test('fans a publish-policy change out to exactly its five GitHub definitions', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'revo-scripts-build-digest-fixture-'));
  const fixtureDigest = join(fixture, 'src/runtime/generated/build-digest.ts');
  const providerIdentityPaths = providerIdentityCases.map(({ generatedIdentity }) =>
    join(fixture, generatedIdentity),
  );

  try {
    await Promise.all([
      cp(join(repositoryRoot, 'src'), join(fixture, 'src'), { recursive: true }),
      cp(join(repositoryRoot, 'scripts'), join(fixture, 'scripts'), { recursive: true }),
      cp(join(repositoryRoot, 'package.json'), join(fixture, 'package.json')),
      cp(join(repositoryRoot, 'tsconfig.build.json'), join(fixture, 'tsconfig.build.json')),
      cp(join(repositoryRoot, 'tsconfig.json'), join(fixture, 'tsconfig.json')),
    ]);
    await symlink(join(repositoryRoot, 'node_modules'), join(fixture, 'node_modules'));
    const before = definitionDigests(await readFile(fixtureDigest, 'utf8'));
    const providerIdentitiesBefore = await Promise.all(
      providerIdentityPaths.map((path) => readFile(path, 'utf8')),
    );
    const policyPath = join(
      fixture,
      'src/scripts/github/shared/github-publish-manifest-policy-v1.ts',
    );
    await writeFile(
      policyPath,
      `${await readFile(policyPath, 'utf8')}\nexport const fixturePolicyMarker = 'changed';\n`,
    );

    await execFileAsync(
      process.execPath,
      ['--experimental-strip-types', join(repositoryRoot, 'scripts/generate-build-digest.ts')],
      {
        cwd: fixture,
        env: {
          ...process.env,
          PATH: `${join(repositoryRoot, 'node_modules/.bin')}:${process.env.PATH ?? ''}`,
          REVO_SCRIPTS_BUILD_DIGEST_ROOT: fixture,
        },
      },
    );

    const after = definitionDigests(await readFile(fixtureDigest, 'utf8'));
    const changedDefinitions = [...after].flatMap(([scriptId, digest]) =>
      before.get(scriptId) === digest ? [] : [scriptId],
    );
    expect(changedDefinitions).toEqual([
      'script:github/pull-request/mark-ready',
      'script:github/pull-request/merge',
      'script:github/pull-request/upsert',
      'script:github/review-threads/resolve',
      'script:github/review-threads/respond',
    ]);
    await expect(
      Promise.all(providerIdentityPaths.map((path) => readFile(path, 'utf8'))),
    ).resolves.toEqual(providerIdentitiesBefore);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test.each(providerIdentityCases)(
  'changes only the $name provider implementation identity for its emitted closure',
  async ({ changedSource, generatedIdentity, unrelatedIdentity }) => {
    const fixture = await mkdtemp(join(tmpdir(), 'revo-scripts-provider-digest-fixture-'));

    try {
      await Promise.all([
        cp(join(repositoryRoot, 'src'), join(fixture, 'src'), { recursive: true }),
        cp(join(repositoryRoot, 'scripts'), join(fixture, 'scripts'), { recursive: true }),
        cp(join(repositoryRoot, 'package.json'), join(fixture, 'package.json')),
        cp(join(repositoryRoot, 'tsconfig.build.json'), join(fixture, 'tsconfig.build.json')),
        cp(join(repositoryRoot, 'tsconfig.json'), join(fixture, 'tsconfig.json')),
      ]);
      await symlink(join(repositoryRoot, 'node_modules'), join(fixture, 'node_modules'));
      const changedIdentityPath = join(fixture, generatedIdentity);
      const unrelatedIdentityPath = join(fixture, unrelatedIdentity);
      const changedBefore = await readFile(changedIdentityPath, 'utf8');
      const unrelatedBefore = await readFile(unrelatedIdentityPath, 'utf8');
      const changedPath = join(fixture, changedSource);
      await writeFile(
        changedPath,
        `${await readFile(changedPath, 'utf8')}\n// fixture provider change\n`,
      );

      await execFileAsync(
        process.execPath,
        ['--experimental-strip-types', join(repositoryRoot, 'scripts/generate-build-digest.ts')],
        {
          cwd: fixture,
          env: {
            ...process.env,
            PATH: `${join(repositoryRoot, 'node_modules/.bin')}:${process.env.PATH ?? ''}`,
            REVO_SCRIPTS_BUILD_DIGEST_ROOT: fixture,
          },
        },
      );

      expect(await readFile(changedIdentityPath, 'utf8')).not.toEqual(changedBefore);
      expect(await readFile(unrelatedIdentityPath, 'utf8')).toEqual(unrelatedBefore);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);
