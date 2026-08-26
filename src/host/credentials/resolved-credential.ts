import type { CredentialDescriptor } from './credential-descriptor.js';

export interface CredentialLease extends CredentialDescriptor {
  readonly alias: string;
  readonly provider: string;
  readonly secret: string;
  dispose(): Promise<void>;
}
