import { expect, test } from 'vitest';

import { GitHubCoordinateSchema } from '../../../src/providers/github/contracts/github-coordinate-schema.js';

test('accepts closed repository coordinates and emits their JSON Schema', async () => {
  const schema = new GitHubCoordinateSchema();

  expect({
    valid: await schema.validate({ owner: 'revisium', repository: 'revo-scripts' }),
    jsonSchema: schema.toJsonSchema(),
  }).toEqual({
    valid: {
      ok: true,
      value: { owner: 'revisium', repository: 'revo-scripts' },
    },
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'revo.provider.github.coordinates/v1',
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          pattern: '^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$',
        },
        repository: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          pattern: '^[A-Za-z0-9._-]+$',
        },
      },
      required: ['owner', 'repository'],
      additionalProperties: false,
    },
  });
});

test('rejects invalid and extra provider coordinates with stable paths', async () => {
  const result = await new GitHubCoordinateSchema().validate({
    owner: '-invalid',
    repository: 'revo-scripts',
    token: 'must-not-be-accepted',
  });

  if (result.ok) {
    throw new Error('Expected invalid GitHub coordinates.');
  }
  expect(result.issues.map((issue) => issue.path)).toEqual([['owner'], []]);
});
