interface PullRequestState {
  title: string;
  body: string;
  draft: boolean;
  merged: boolean;
}

interface ReviewThreadState {
  resolved: boolean;
  readonly comments: Array<Readonly<{ id: string; body: string; actor: string }>>;
}

interface GraphQlRequest {
  readonly query: string;
  readonly variables: Readonly<Record<string, unknown>>;
}

export interface ConsumerFlowGitHubTransport {
  readonly fetch: typeof globalThis.fetch;
  readonly mutations: readonly string[];
  setHeadCommit(headCommit: string): void;
}

export const createConsumerFlowGitHubTransport = (): ConsumerFlowGitHubTransport => {
  const pullRequest: PullRequestState = {
    title: '',
    body: '',
    draft: true,
    merged: false,
  };
  const reviewThread: ReviewThreadState = { resolved: false, comments: [] };
  const mutations: string[] = [];
  let sourceBranchExists = true;
  let headCommit: string | undefined;

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = toUrl(input);
    const currentHeadCommit = requiredHeadCommit(headCommit);
    if (url.endsWith('/graphql')) {
      return graphQlResponse(readGraphQlRequest(init), currentHeadCommit);
    }
    if (url.includes('/rules/branches/master')) {
      return jsonResponse([]);
    }
    if (url.includes('/pulls?')) {
      return jsonResponse([]);
    }
    if (url.endsWith('/pulls') && init?.method === 'POST') {
      const body = readJsonBody(init);
      pullRequest.title = requiredString(body.title, 'pull request title');
      pullRequest.body = requiredString(body.body, 'pull request body');
      pullRequest.draft = requiredBoolean(body.draft, 'pull request draft state');
      mutations.push('pull-request-upsert');
      return jsonResponse(restPullRequest(pullRequest, currentHeadCommit));
    }
    if (url.endsWith('/pulls/42/merge') && init?.method === 'PUT') {
      pullRequest.merged = true;
      mutations.push('pull-request-merge');
      return jsonResponse({ merged: true, sha: 'b'.repeat(40) });
    }
    if (url.endsWith('/git/refs/heads/revo/consumer-flow') && init?.method === 'DELETE') {
      sourceBranchExists = false;
      mutations.push('source-branch-delete');
      return new Response(null, { status: 204 });
    }
    if (url.endsWith('/pulls/42')) {
      return jsonResponse(restPullRequest(pullRequest, currentHeadCommit));
    }
    throw new Error(`Unexpected consumer-flow GitHub REST request: ${url}`);
  };

  const graphQlResponse = (request: GraphQlRequest, currentHeadCommit: string): Response => {
    if (request.query.includes('mutation MarkReady')) {
      pullRequest.draft = false;
      mutations.push('pull-request-mark-ready');
      return jsonResponse({
        data: {
          markPullRequestReadyForReview: {
            pullRequest: graphQlPullRequest(pullRequest, currentHeadCommit),
          },
        },
      });
    }
    if (request.query.includes('query Readiness')) {
      return jsonResponse(readinessResponse(pullRequest, reviewThread, currentHeadCommit));
    }
    if (request.query.includes('query ReviewThread')) {
      return jsonResponse(reviewThreadResponse(reviewThread, currentHeadCommit));
    }
    if (request.query.includes('mutation Reply')) {
      const body = requiredString(request.variables.body, 'review reply body');
      const id = `reply-${reviewThread.comments.length + 1}`;
      reviewThread.comments.push({ id, body, actor: 'revo-bot' });
      mutations.push('review-thread-respond');
      return jsonResponse({ data: { addPullRequestReviewThreadReply: { comment: { id } } } });
    }
    if (request.query.includes('mutation Resolve')) {
      reviewThread.resolved = true;
      mutations.push('review-thread-resolve');
      return jsonResponse({
        data: { resolveReviewThread: { thread: { id: 'thread-1', isResolved: true } } },
      });
    }
    if (request.query.includes('query SourceBranch')) {
      return jsonResponse({
        data: {
          repository: {
            ref: sourceBranchExists ? { target: { oid: currentHeadCommit } } : null,
          },
        },
      });
    }
    throw new Error('Unexpected consumer-flow GitHub GraphQL operation.');
  };

  return {
    fetch,
    mutations,
    setHeadCommit: (value) => {
      headCommit = value;
    },
  };
};

const restPullRequest = (pullRequest: PullRequestState, headCommit: string) => ({
  number: 42,
  node_id: 'PR_consumer_flow_42',
  html_url: 'https://github.com/revisium/revo-scripts/pull/42',
  head: { ref: 'revo/consumer-flow', sha: headCommit },
  base: { ref: 'master' },
  title: pullRequest.title,
  body: pullRequest.body,
  state: pullRequest.merged ? 'closed' : 'open',
  draft: pullRequest.draft,
  mergeable: 'mergeable',
  mergeable_state: 'CLEAN',
  merged: pullRequest.merged,
  merged_at: pullRequest.merged ? '2026-07-15T00:02:00Z' : null,
  merge_commit_sha: pullRequest.merged ? 'b'.repeat(40) : null,
});

const graphQlPullRequest = (pullRequest: PullRequestState, headCommit: string) => ({
  number: 42,
  id: 'PR_consumer_flow_42',
  url: 'https://github.com/revisium/revo-scripts/pull/42',
  headRefName: 'revo/consumer-flow',
  headRefOid: headCommit,
  baseRefName: 'master',
  state: pullRequest.merged ? 'MERGED' : 'OPEN',
  isDraft: pullRequest.draft,
  merged: pullRequest.merged,
  mergeCommit: pullRequest.merged ? { oid: 'b'.repeat(40) } : null,
});

const readinessResponse = (
  pullRequest: PullRequestState,
  reviewThread: ReviewThreadState,
  headCommit: string,
) => ({
  data: {
    repository: {
      pullRequest: {
        state: pullRequest.merged ? 'MERGED' : 'OPEN',
        isDraft: pullRequest.draft,
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'CLEAN',
        headRefOid: headCommit,
        baseRef: {
          name: 'master',
          branchProtectionRule: { requiresStatusChecks: false, requiredStatusCheckContexts: [] },
        },
        reviewThreads: {
          pageInfo: { hasNextPage: false },
          nodes: [
            {
              id: 'thread-1',
              isResolved: reviewThread.resolved,
              isOutdated: false,
              comments: {
                nodes: [{ url: 'https://github.com/revisium/revo-scripts/pull/42#thread-1' }],
              },
            },
          ],
        },
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: { contexts: { pageInfo: { hasNextPage: false }, nodes: [] } },
              },
            },
          ],
        },
      },
    },
  },
});

const reviewThreadResponse = (reviewThread: ReviewThreadState, headCommit: string) => ({
  data: {
    viewer: { login: 'revo-bot' },
    node: {
      id: 'thread-1',
      isResolved: reviewThread.resolved,
      pullRequest: {
        number: 42,
        headRefOid: headCommit,
        state: 'OPEN',
        repository: { name: 'revo-scripts', owner: { login: 'revisium' } },
      },
      comments: {
        pageInfo: { hasPreviousPage: false },
        nodes: reviewThread.comments.map((comment) => ({
          id: comment.id,
          body: comment.body,
          author: { login: comment.actor },
        })),
      },
    },
  },
});

const toUrl = (input: string | URL | Request): string =>
  input instanceof Request ? input.url : input instanceof URL ? input.href : input;

const readGraphQlRequest = (init: RequestInit | undefined): GraphQlRequest => {
  const body = readJsonBody(init);
  return {
    query: requiredString(body.query, 'GraphQL query'),
    variables: requiredRecord(body.variables, 'GraphQL variables'),
  };
};

const readJsonBody = (init: RequestInit | undefined): Readonly<Record<string, unknown>> => {
  if (typeof init?.body !== 'string') {
    throw new Error('Consumer-flow GitHub request must have a JSON string body.');
  }
  const parsed: unknown = JSON.parse(init.body);
  return requiredRecord(parsed, 'JSON request body');
};

const requiredRecord = (value: unknown, label: string): Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be an object.`);
  }
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${label} to be a string.`);
  }
  return value;
};

const requiredBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected ${label} to be a boolean.`);
  }
  return value;
};

const requiredHeadCommit = (value: string | undefined): string => {
  if (value === undefined) {
    throw new Error(
      'Consumer-flow GitHub transport needs the committed Git head before GitHub use.',
    );
  }
  return value;
};

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
