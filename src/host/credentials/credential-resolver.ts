import type { HostCallContext } from '../resources/resource-resolver.js';
import type { CredentialDescriptor } from './credential-descriptor.js';
import type { CredentialLease } from './resolved-credential.js';

export type { CredentialDescriptor } from './credential-descriptor.js';

export interface CredentialResolver {
  inspect(alias: string, context: HostCallContext): Promise<CredentialDescriptor | undefined>;
  acquire(alias: string, context: HostCallContext): Promise<CredentialLease>;
}
