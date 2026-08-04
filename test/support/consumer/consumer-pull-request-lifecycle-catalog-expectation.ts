const gitProvider = {
  name: 'git',
  resource: 'repository',
  id: 'provider:git/node',
  contract: 'revo.provider.git/v1',
  implementationDigest: 'sha256:5d0d76068e094c593f16600cd6d6345353f92d0d73f7fcf98fe5fb7e5cb2c649',
  workspace: 'required',
};

const githubProvider = {
  name: 'github',
  resource: 'repository',
  id: 'provider:github/fetch',
  contract: 'revo.provider.github/v1',
  implementationDigest: 'sha256:faa7cad4a7dd68759deabed35e3ff93c7aad011c2ea27978d730e13e6428f373',
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
    'script:system/echo@1',
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
