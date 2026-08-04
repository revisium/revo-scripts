import { expectTypeOf, test } from 'vitest';

import { defineScript } from '../../../src/runtime/definition/define-script.js';
import type {
  RequiredIdempotencyScriptHandler,
  ScriptDefinition,
  ScriptDefinitionInput,
  ScriptHandler,
  UnrefinedIdempotencyScriptDefinitionInput,
} from '../../../src/runtime/spec/definition/index.js';
import type { ScriptManifestAuthoringV1 } from '../../../src/runtime/spec/manifest/index.js';
import type { ScriptResourceMap } from '../../../src/runtime/spec/resources/index.js';
import {
  echoManifest,
  manualEchoInputSchema,
  manualEchoResultSchema,
} from '../../support/runtime/echo-definition-input.js';

type Input = Readonly<{ message: string }>;
type Result = Readonly<{ echoed: string }>;

const implementation = {
  id: '@revisium/revo-scripts/test/definition-types',
  version: '1.0.0',
  buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000050',
} as const;

const requiredManifest = {
  ...echoManifest,
  id: 'script:test/definition-types',
  summary: 'Proves manifest-discriminated definition input types.',
  effectClass: 'write',
  permissions: ['git.test.write'],
  resources: [{ name: 'repository', kind: 'repository', access: 'write' }],
  effects: ['git.write'],
  idempotency: 'required',
} as const;

const genericHandler: ScriptHandler<Input, Result, ScriptResourceMap> = {
  execute: async (input) => ({ value: { echoed: input.message } }),
};

const requiredHandler: RequiredIdempotencyScriptHandler<Input, Result, ScriptResourceMap> = {
  execute: async (input, context) => ({
    value: { echoed: `${input.message}:${context.idempotencyKey}` },
  }),
};

type WidenedManifest = ScriptManifestAuthoringV1 & {
  readonly summary: 'Widened manifest';
};

test('keeps widened manifests usable without allowing the required-only handler fallback', () => {
  const widenedManifest: WidenedManifest = {
    ...requiredManifest,
    summary: 'Widened manifest',
  };
  const widenedInput: ScriptDefinitionInput<Input, Result, ScriptResourceMap, WidenedManifest> = {
    manifest: widenedManifest,
    inputSchema: manualEchoInputSchema,
    resultSchema: manualEchoResultSchema,
    implementation,
    handler: genericHandler,
  };

  expectTypeOf(defineScript(widenedInput)).toEqualTypeOf<
    ScriptDefinition<Input, Result, ScriptResourceMap>
  >();

  // @ts-expect-error A literal required manifest must not use the optional-key fallback.
  const invalidLiteralFallback: UnrefinedIdempotencyScriptDefinitionInput<
    Input,
    Result,
    ScriptResourceMap,
    typeof requiredManifest
  > = {
    manifest: requiredManifest,
    inputSchema: manualEchoInputSchema,
    resultSchema: manualEchoResultSchema,
    implementation,
    handler: requiredHandler,
  };
  void invalidLiteralFallback;
});
