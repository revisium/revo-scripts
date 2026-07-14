import { expect, test } from 'vitest';

import { redactValue } from '../../../src/runtime/redact.js';

test('redacts declared JSON Pointer paths without mutating the source value', () => {
  const source = {
    token: 'root-secret',
    nested: {
      items: [{ value: 'visible' }, { value: 'nested-secret' }],
      'escaped/key': { '~token': 'escaped-secret' },
    },
  };

  const redacted = redactValue(source, [
    '/token',
    '/nested/items/1/value',
    '/nested/escaped~1key/~0token',
  ]);

  expect(redacted).toEqual({
    token: '[REDACTED]',
    nested: {
      items: [{ value: 'visible' }, { value: '[REDACTED]' }],
      'escaped/key': { '~token': '[REDACTED]' },
    },
  });
  expect(source).toEqual({
    token: 'root-secret',
    nested: {
      items: [{ value: 'visible' }, { value: 'nested-secret' }],
      'escaped/key': { '~token': 'escaped-secret' },
    },
  });
});

test('supports root redaction and ignores paths absent from a projection', () => {
  expect(redactValue({ visible: true }, ['/missing'])).toEqual({ visible: true });
  expect(redactValue({ visible: true }, [''])).toEqual('[REDACTED]');
});
