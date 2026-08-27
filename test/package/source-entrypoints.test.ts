import { expect, test } from 'vitest';

import * as scripts from '../../src/index.js';

test('root package exposes the SC1 facade without the legacy execute entrypoint', () => {
  expect(scripts).toHaveProperty('createRevoScripts');
  expect(scripts).toHaveProperty('ScriptFault');
  expect(scripts).not.toHaveProperty('executeScript');
});
