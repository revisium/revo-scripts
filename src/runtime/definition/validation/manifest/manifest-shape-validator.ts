import type { z } from 'zod';

import { ScriptFault } from '../../../spec/errors/index.js';
import type { ScriptManifestV1 } from '../../../spec/manifest/index.js';
import type { ManifestValidationIssue } from './manifest-validation-issue.js';
import { scriptManifestSchema } from './script-manifest-schema.js';

const escapePointerSegment = (segment: PropertyKey): string =>
  String(segment).replaceAll('~', '~0').replaceAll('/', '~1');

const issuePath = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? '' : `/${path.map(escapePointerSegment).join('/')}`;

const mapShapeIssues = (error: z.ZodError): readonly ManifestValidationIssue[] =>
  error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: `${issuePath(issue.path)}/${escapePointerSegment(key)}`,
        message: 'Unknown manifest field.',
      }));
    }

    return [{ path: issuePath(issue.path), message: issue.message }];
  });

export const validateManifestShape = (value: unknown): ScriptManifestV1 => {
  const result = scriptManifestSchema.safeParse(value);

  if (!result.success) {
    throw new ScriptFault('revo.script.validation.manifest', 'Script manifest is invalid.', {
      details: { issues: mapShapeIssues(result.error) },
    });
  }

  return result.data;
};
