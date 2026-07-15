import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));

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
    expect(failure.message).toContain('Generated build digest is stale');
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
