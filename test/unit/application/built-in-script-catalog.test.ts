import { expect, test } from 'vitest';

import { builtInScriptCatalog } from '../../../src/application/registration/built-in-script-catalog.js';
import type { BuiltInScriptDescriptor } from '../../../src/application/registration/built-in-script-descriptor.js';
import {
  approvalScripts,
  builtInScripts,
  githubScripts,
  gitScripts,
  systemScripts,
} from '../../../src/application/registration/built-ins.js';
import type { ScriptDefinitionModule } from '../../../src/application/registration/script-definition-module.js';
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

const installedDefinitions = (
  module: ScriptDefinitionModule,
): readonly ScriptDefinition<unknown, unknown, ScriptResourceMap>[] => {
  const definitions: ScriptDefinition<unknown, unknown, ScriptResourceMap>[] = [];
  module.registerInto({ register: (definition) => definitions.push(definition) });
  return definitions;
};

const moduleCases = [
  {
    name: 'approval',
    module: approvalScripts(),
    moduleId: '@revisium/revo-scripts/scripts/approval',
    scriptIds: ['script:approval/subject'],
  },
  {
    name: 'system',
    module: systemScripts(),
    moduleId: '@revisium/revo-scripts/scripts/system',
    scriptIds: ['script:system/echo'],
  },
  {
    name: 'Git',
    module: gitScripts(),
    moduleId: '@revisium/revo-scripts/scripts/git',
    scriptIds: ['script:git/commit', 'script:git/push', 'script:git/status'],
  },
  {
    name: 'GitHub',
    module: githubScripts(),
    moduleId: '@revisium/revo-scripts/scripts/github',
    scriptIds: [
      'script:github/pull-request/upsert',
      'script:github/pull-request/mark-ready',
      'script:github/pull-request/readiness',
      'script:github/review-threads/respond',
      'script:github/review-threads/resolve',
      'script:github/pull-request/merge',
    ],
  },
  {
    name: 'all built-in',
    module: builtInScripts(),
    moduleId: '@revisium/revo-scripts/scripts/built-ins',
    scriptIds: [
      'script:approval/subject',
      'script:system/echo',
      'script:git/commit',
      'script:git/push',
      'script:git/status',
      'script:github/pull-request/upsert',
      'script:github/pull-request/mark-ready',
      'script:github/pull-request/readiness',
      'script:github/review-threads/respond',
      'script:github/review-threads/resolve',
      'script:github/pull-request/merge',
    ],
  },
] as const;

test.each(moduleCases)(
  'registers the exact $name family in stable executable order',
  ({ module, moduleId, scriptIds }) => {
    expect(module.id).toBe(moduleId);
    expect(installedDefinitions(module).map(({ manifest }) => manifest.id)).toEqual(scriptIds);
  },
);

test('lists every installed built-in once in stable identity order', () => {
  const catalog = builtInScriptCatalog();
  const installed = installedDefinitions(builtInScripts());

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
  const first: readonly BuiltInScriptDescriptor[] = builtInScriptCatalog();
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
