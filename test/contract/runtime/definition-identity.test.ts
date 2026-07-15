import { describe, expect, it } from 'vitest';

import { builtInScripts } from '../../../src/application/registration/built-ins.js';
import { builtInBuildDigests } from '../../../src/runtime/generated/build-digest.js';
import { builtInImplementation } from '../../../src/runtime/generated/built-in-implementation.js';
import type { ScriptDefinition } from '../../../src/runtime/spec/definition/index.js';
import type { ScriptResourceMap } from '../../../src/runtime/spec/resources/index.js';

describe('built-in definition identities', () => {
  it('registers the canonical operation ids with executable build digests', () => {
    const definitions: ScriptDefinition<unknown, unknown, ScriptResourceMap>[] = [];
    builtInScripts().registerInto({
      register(definition) {
        definitions.push(definition);
      },
    });
    const expectedIds = [
      'script:approval/subject',
      'script:git/status',
      'script:git/commit',
      'script:git/push',
      'script:github/pull-request/upsert',
      'script:github/pull-request/mark-ready',
      'script:github/pull-request/readiness',
      'script:github/review-threads/respond',
      'script:github/review-threads/resolve',
      'script:github/pull-request/merge',
    ];

    expect(definitions.map((definition) => definition.manifest.id).sort()).toEqual(
      expectedIds.sort(),
    );

    for (const definition of definitions) {
      expect(definition.implementation.buildDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it('returns the generated digest for an exact built-in id and rejects an unknown id', () => {
    expect(builtInImplementation('script:git/status', '1.0.0')).toEqual({
      id: 'revo.builtin.script-git-status',
      version: '1.0.0',
      buildDigest: builtInBuildDigests['script:git/status'],
    });
    expect(() => builtInImplementation('script:unknown', '1.0.0')).toThrow(
      'Unknown built-in script id: script:unknown',
    );
  });
});
