import type { ScriptResourceAccess } from './script-resource-access.js';

export interface ScriptResourceRequirement {
  readonly name: string;
  readonly kind: 'repository';
  readonly access: ScriptResourceAccess;
}
