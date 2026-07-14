import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubPullRequestSnapshot } from '../../../contracts/github-pull-request-snapshot.js';
import type {
  GitHubPullRequestUpsertClient,
  GitHubPullRequestUpsertRequest,
} from '../../../contracts/github-pull-request-upsert-client.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';
import { parseGitHubPullRequest } from './github-pull-request-response.js';

export class FetchGitHubPullRequestUpsertClient implements GitHubPullRequestUpsertClient {
  private readonly api: GitHubApiClient;
  private readonly coordinates: GitHubRepositoryCoordinates;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.coordinates = coordinates;
  }

  async upsert(request: GitHubPullRequestUpsertRequest): Promise<GitHubPullRequestSnapshot> {
    const existing = await this.findExisting(request);
    const snapshot =
      existing === undefined ? await this.create(request) : await this.update(existing, request);
    if (snapshot.head.sha !== request.head.sha) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pull request head does not match the pinned revision.',
      );
    }
    return snapshot;
  }

  private async findExisting(
    request: GitHubPullRequestUpsertRequest,
  ): Promise<GitHubPullRequestSnapshot | undefined> {
    const params = new URLSearchParams({
      state: 'open',
      head: `${this.coordinates.owner}:${request.head.branch}`,
      base: request.base.branch,
      per_page: '2',
    });
    const response = await this.api.rest(
      `/repos/${this.coordinates.owner}/${this.coordinates.repository}/pulls?${params.toString()}`,
      { signal: request.signal },
    );
    const parsed = z.array(z.unknown()).max(2).safeParse(response);
    if (!parsed.success) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub returned an invalid pull request collection.',
      );
    }
    if (parsed.data.length > 1) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'Multiple open pull requests match the requested branches.',
      );
    }
    return parsed.data[0] === undefined ? undefined : parseGitHubPullRequest(parsed.data[0]);
  }

  private async create(
    request: GitHubPullRequestUpsertRequest,
  ): Promise<GitHubPullRequestSnapshot> {
    return parseGitHubPullRequest(
      await this.api.rest(`/repos/${this.coordinates.owner}/${this.coordinates.repository}/pulls`, {
        method: 'POST',
        body: {
          head: request.head.branch,
          base: request.base.branch,
          title: request.title,
          body: request.body,
          draft: request.draft,
        },
        signal: request.signal,
      }),
    );
  }

  private async update(
    existing: GitHubPullRequestSnapshot,
    request: GitHubPullRequestUpsertRequest,
  ): Promise<GitHubPullRequestSnapshot> {
    if (existing.head.sha !== request.head.sha || existing.draft !== request.draft) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The existing pull request does not match the requested revision or draft state.',
      );
    }
    return parseGitHubPullRequest(
      await this.api.rest(
        `/repos/${this.coordinates.owner}/${this.coordinates.repository}/pulls/${existing.number}`,
        {
          method: 'PATCH',
          body: { title: request.title, body: request.body, base: request.base.branch },
          signal: request.signal,
        },
      ),
    );
  }
}
