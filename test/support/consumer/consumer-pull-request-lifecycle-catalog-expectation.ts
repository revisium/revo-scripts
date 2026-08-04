const gitProvider = {
  name: 'git',
  resource: 'repository',
  id: 'provider:git/node',
  contract: 'revo.provider.git/v1',
  implementationDigest: 'sha256:9d6b294c77575e54772a6678c687f9b3848dea587cc9c8729451f7e15041fa66',
  workspace: 'required',
};

const githubProvider = {
  name: 'github',
  resource: 'repository',
  id: 'provider:github/fetch',
  contract: 'revo.provider.github/v1',
  implementationDigest: 'sha256:9c8081e0fca0809354e0bde46fa8db6a6740b23e38b070a3123ced4438d9826a',
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
