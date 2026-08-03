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
    expect(definitions.map((definition) => definition.manifest.id).sort()).toEqual(
      Object.keys(builtInBuildDigests).sort(),
    );
    expect(
      Object.fromEntries(
        definitions.map((definition) => [
          definition.manifest.id,
          definition.implementation.buildDigest,
        ]),
      ),
    ).toEqual(builtInBuildDigests);
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
