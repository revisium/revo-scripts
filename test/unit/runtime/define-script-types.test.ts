import { expectTypeOf, test } from 'vitest';

import type { ScriptContext, ScriptHandler } from '../../../src/runtime/spec/definition/index.js';

test('script handlers receive one stable execution context', () => {
  type Resources = Readonly<Record<string, never>>;
  expectTypeOf<ScriptContext<Resources>>().toMatchTypeOf<{
    readonly executionId: string;
    readonly attemptOrdinal: number;
    readonly signal: AbortSignal;
  }>();
  expectTypeOf<ScriptHandler<{ message: string }, { echoed: string }, Resources>>().toHaveProperty(
    'execute',
  );
});
