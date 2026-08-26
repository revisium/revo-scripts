import { expectTypeOf, test } from 'vitest';

import type { DeepReadonly } from '../../../src/runtime/spec/index.js';

test('preserves tuple positions while making nested values readonly', () => {
  type Input = readonly [{ nested: { value: string } }, number];
  type Expected = readonly [{ readonly nested: { readonly value: string } }, number];

  expectTypeOf<DeepReadonly<Input>>().toEqualTypeOf<Expected>();
});
