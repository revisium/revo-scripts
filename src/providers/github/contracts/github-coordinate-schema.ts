import { z } from 'zod';

import type { ScriptSchema, ScriptSchemaResult } from '../../../runtime/spec/schema/index.js';
import type { GitHubRepositoryCoordinates } from './github-repository-coordinates.js';

const coordinates = z.strictObject({
  owner: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/),
  repository: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/),
});

export class GitHubCoordinateSchema implements ScriptSchema<GitHubRepositoryCoordinates> {
  readonly id = 'revo.provider.github.coordinates/v1';

  async validate(value: unknown): Promise<ScriptSchemaResult<GitHubRepositoryCoordinates>> {
    const result = coordinates.safeParse(value);
    if (result.success) {
      return { ok: true, value: result.data };
    }
    return {
      ok: false,
      issues: result.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.map((segment) =>
          typeof segment === 'number' ? segment : String(segment),
        ),
      })),
    };
  }

  toJsonSchema(): Readonly<Record<string, unknown>> {
    return {
      ...z.toJSONSchema(coordinates, { target: 'draft-2020-12' }),
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: this.id,
    };
  }
}
