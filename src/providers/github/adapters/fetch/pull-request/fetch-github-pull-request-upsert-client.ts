import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubPullRequestSnapshot } from '../../../contracts/github-pull-request-snapshot.js';
import type {
  GitHubPullRequestUpsertClient,
  GitHubPullRequestUpsertRequest,
} from '../../../contracts/github-pull-request-upsert-client.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';
import {
  githubManagedPullRequestBody,
  githubManagedPullRequestOperation,
  githubOperationMarker,
} from '../github-operation-marker.js';
import { GitHubPullRequestReader } from './github-pull-request-reader.js';
import { parseGitHubPullRequest } from './github-pull-request-response.js';
import { GitHubSourceBranchReader } from './github-source-branch-reader.js';

export class FetchGitHubPullRequestUpsertClient implements GitHubPullRequestUpsertClient {
  private readonly api: GitHubApiClient;
  private readonly coordinates: GitHubRepositoryCoordinates;
  private readonly reader: GitHubPullRequestReader;
  private readonly sourceBranch: GitHubSourceBranchReader;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.coordinates = coordinates;
    this.reader = new GitHubPullRequestReader(api, coordinates);
    this.sourceBranch = new GitHubSourceBranchReader(api, coordinates);
  }

  async upsert(request: GitHubPullRequestUpsertRequest): Promise<GitHubPullRequestSnapshot> {
    if ((await this.sourceBranch.read(request.head.branch, request.signal)) !== request.head.sha) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The live source branch does not match the pinned pull request head.',
      );
    }
    const existing = await this.findExisting(request);
    const snapshot =
      existing === undefined
        ? await this.readBack(await this.create(request), request)
        : this.matchesRequestedState(existing, request)
          ? existing
          : await this.readBack(await this.update(existing, request), request);
    if (!this.matchesRequestedState(snapshot, request)) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pull request readback does not match the requested state.',
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
    const candidate =
      parsed.data[0] === undefined ? undefined : parseGitHubPullRequest(parsed.data[0]);
    if (candidate !== undefined && !this.ownsOperation(candidate, request)) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'A foreign pull request already uses the requested head and base.',
      );
    }
    return candidate;
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
          body: githubManagedPullRequestBody(request.body, {
            operationKey: request.operationKey,
            ...request.marker,
          }),
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
    if (
      request.expectedProviderRevision !== undefined &&
      existing.providerRevision !== request.expectedProviderRevision
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pull request metadata revision no longer matches the pinned revision.',
      );
    }
    if (this.matchesRequestedState(existing, request)) {
      return existing;
    }
    return parseGitHubPullRequest(
      await this.api.rest(
        `/repos/${this.coordinates.owner}/${this.coordinates.repository}/pulls/${existing.number}`,
        {
          method: 'PATCH',
          body: {
            title: request.title,
            body: githubManagedPullRequestBody(request.body, {
              operationKey: request.operationKey,
              ...request.marker,
            }),
            base: request.base.branch,
          },
          signal: request.signal,
        },
      ),
    );
  }

  private ownsOperation(
    snapshot: GitHubPullRequestSnapshot,
    request: GitHubPullRequestUpsertRequest,
  ): boolean {
    return (
      githubManagedPullRequestOperation(snapshot.body)?.operationMarker ===
      githubOperationMarker({ operationKey: request.operationKey, ...request.marker }, request.body)
    );
  }

  private matchesRequestedState(
    snapshot: GitHubPullRequestSnapshot,
    request: GitHubPullRequestUpsertRequest,
  ): boolean {
    return (
      snapshot.state === 'open' &&
      snapshot.head.branch === request.head.branch &&
      snapshot.head.sha === request.head.sha &&
      snapshot.base.branch === request.base.branch &&
      snapshot.draft === request.draft &&
      snapshot.title === request.title &&
      githubManagedPullRequestOperation(snapshot.body)?.businessBody ===
        request.body.replace(/\r\n?/gu, '\n').trimEnd() &&
      this.ownsOperation(snapshot, request)
    );
  }

  private async readBack(
    snapshot: GitHubPullRequestSnapshot,
    request: GitHubPullRequestUpsertRequest,
  ): Promise<GitHubPullRequestSnapshot> {
    return await this.reader.read(snapshot.number, request.head.sha, request.signal);
  }
}
