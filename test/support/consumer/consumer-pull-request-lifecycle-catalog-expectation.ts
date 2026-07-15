const gitProvider = {
  name: 'git',
  resource: 'repository',
  id: 'provider:git/node',
  contract: 'revo.provider.git/v1',
  implementationDigest: 'sha256:5b85c3d2ae175efaa6b634681e00a18e0d82f4a88e0261674d4dcc0390af39b1',
  workspace: 'required',
};

const githubProvider = {
  name: 'github',
  resource: 'repository',
  id: 'provider:github/fetch',
  contract: 'revo.provider.github/v1',
  implementationDigest: 'sha256:362bbb9bc17f430560321fe99e1cc479040aa74471fb10d88b5206b832f44b45',
  workspace: 'none',
};

const definition = (
  script: string,
  permissions: readonly string[],
  access: 'read' | 'write' | 'publish',
  effects: readonly string[],
  provider: typeof gitProvider,
) => ({ script, permissions, resources: [`repository:${access}`], effects, providers: [provider] });

export const expectedConsumerPullRequestLifecycleCatalog = {
  manifests: [
    'script:approval/subject@1',
    'script:git/commit@1',
    'script:git/push@1',
    'script:git/status@1',
    'script:github/pull-request/mark-ready@1',
    'script:github/pull-request/merge@1',
    'script:github/pull-request/readiness@1',
    'script:github/pull-request/upsert@1',
    'script:github/review-threads/resolve@1',
    'script:github/review-threads/respond@1',
  ],
  definitions: [
    {
      script: 'script:approval/subject@1',
      permissions: [],
      resources: [],
      effects: [],
      providers: [],
    },
    definition(
      'script:git/status@1',
      ['git.status.read'],
      'read',
      ['filesystem.read', 'git.read'],
      gitProvider,
    ),
    definition(
      'script:git/commit@1',
      ['git.commit.write'],
      'write',
      ['git.read', 'git.write'],
      gitProvider,
    ),
    definition(
      'script:git/push@1',
      ['git.push.publish'],
      'publish',
      ['git.read', 'git.remote-write'],
      gitProvider,
    ),
    definition(
      'script:github/pull-request/upsert@1',
      ['github.pull-request.upsert'],
      'publish',
      ['github.read', 'github.write'],
      githubProvider,
    ),
    definition(
      'script:github/pull-request/mark-ready@1',
      ['github.pull-request.mark-ready'],
      'publish',
      ['github.read', 'github.write'],
      githubProvider,
    ),
    definition(
      'script:github/pull-request/readiness@1',
      ['github.pull-request.readiness'],
      'read',
      ['github.read'],
      githubProvider,
    ),
    definition(
      'script:github/review-threads/respond@1',
      ['github.review-thread.respond'],
      'publish',
      ['github.read', 'github.write'],
      githubProvider,
    ),
    definition(
      'script:github/review-threads/resolve@1',
      ['github.review-thread.resolve'],
      'publish',
      ['github.read', 'github.write'],
      githubProvider,
    ),
    definition(
      'script:github/pull-request/merge@1',
      ['github.pull-request.merge'],
      'publish',
      ['github.read', 'github.write'],
      githubProvider,
    ),
  ],
};
