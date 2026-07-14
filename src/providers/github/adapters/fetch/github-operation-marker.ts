import { createHash } from 'node:crypto';

export const githubOperationMarker = (operationKey: string): string =>
  `<!-- revo-operation-key:sha256:${createHash('sha256').update(operationKey).digest('hex')} -->`;
