import type { ScriptProviderRegistration } from '../../host/providers/script-provider-registration.js';
import { ProviderCatalog } from './provider-catalog.js';

export const createProviderCatalog = (
  registrations: readonly ScriptProviderRegistration[],
): ProviderCatalog => new ProviderCatalog(registrations);
