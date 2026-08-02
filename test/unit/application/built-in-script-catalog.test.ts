import { expect, test } from 'vitest';

import { builtInScriptCatalog } from '../../../src/application/registration/built-in-script-catalog.js';
import { builtInScripts } from '../../../src/application/registration/built-ins.js';
import type { ScriptDefinition } from '../../../src/runtime/spec/definition/index.js';
import type { ScriptResourceMap } from '../../../src/runtime/spec/resources/index.js';

const expectedPins = [
  { id: 'script:approval/subject', version: 1 },
  { id: 'script:git/commit', version: 1 },
  { id: 'script:git/push', version: 1 },
  { id: 'script:git/status', version: 1 },
  { id: 'script:github/pull-request/mark-ready', version: 1 },
  { id: 'script:github/pull-request/merge', version: 1 },
  { id: 'script:github/pull-request/readiness', version: 1 },
  { id: 'script:github/pull-request/upsert', version: 1 },
  { id: 'script:github/review-threads/resolve', version: 1 },
  { id: 'script:github/review-threads/respond', version: 1 },
  { id: 'script:system/echo', version: 1 },
] as const;

const installedDefinitions = (): readonly ScriptDefinition<
  unknown,
  unknown,
  ScriptResourceMap
>[] => {
  const definitions: ScriptDefinition<unknown, unknown, ScriptResourceMap>[] = [];
  builtInScripts().registerInto({ register: (definition) => definitions.push(definition) });
  return definitions;
};

test('lists every installed built-in once in stable identity order', () => {
  const catalog = builtInScriptCatalog();
  const installed = installedDefinitions();

  expect(catalog.map(({ script }) => script)).toEqual(expectedPins);
  expect(new Set(catalog.map(({ script }) => `${script.id}@${script.version}`)).size).toBe(
    expectedPins.length,
  );
  expect(catalog.map(({ script, implementation }) => ({ script, implementation }))).toEqual(
    installed
      .map(({ manifest, implementation }) => ({
        script: { id: manifest.id, version: manifest.version },
        implementation,
      }))
      .sort((left, right) => left.script.id.localeCompare(right.script.id)),
  );
});

test('returns fresh frozen catalog arrays containing immutable descriptor snapshots', () => {
  const first = builtInScriptCatalog();
  const second = builtInScriptCatalog();
  const descriptor = first[0];

  expect(first).not.toBe(second);
  expect(first).toEqual(second);
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(descriptor)).toBe(true);
  expect(Object.isFrozen(descriptor?.script)).toBe(true);
  expect(Object.isFrozen(descriptor?.implementation)).toBe(true);

  expect(Reflect.set(first, 'length', 0)).toBe(false);
  expect(Reflect.set(descriptor?.script ?? {}, 'id', 'script:mutated')).toBe(false);
  expect(Reflect.set(descriptor?.implementation ?? {}, 'version', 'mutated')).toBe(false);
  expect(builtInScriptCatalog()).toEqual(second);
});
