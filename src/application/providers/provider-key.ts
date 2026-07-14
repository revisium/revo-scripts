export const providerKey = (provider: {
  readonly id: string;
  readonly contract: string;
  readonly implementationDigest: string;
}): string => `${provider.id}\u0000${provider.contract}\u0000${provider.implementationDigest}`;
