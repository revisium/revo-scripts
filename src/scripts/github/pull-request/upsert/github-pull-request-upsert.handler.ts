import type { ScriptContext, ScriptHandler } from '../../../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import { toGitHubPullRequest } from '../../shared/to-github-pull-request.js';
import type {
  GitHubPullRequestUpsertInput,
  GitHubPullRequestUpsertResources,
  GitHubPullRequestUpsertResult,
} from './types.js';

export class GitHubPullRequestUpsertHandler implements ScriptHandler<
  GitHubPullRequestUpsertInput,
  GitHubPullRequestUpsertResult,
  GitHubPullRequestUpsertResources
> {
  async execute(
    input: Readonly<GitHubPullRequestUpsertInput>,
    context: Readonly<ScriptContext<GitHubPullRequestUpsertResources>>,
  ): Promise<{ readonly value: GitHubPullRequestUpsertResult }> {
    if (context.idempotencyKey === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.key_required',
        'Script execution requires an idempotency key.',
      );
    }
    const body = this.body(input);
    const request = {
      head: input.head,
      base: input.base,
      title: input.title,
      body,
      draft: input.draft,
      operationKey: context.idempotencyKey,
      marker: {
        headSha: input.head.sha,
        title: input.title,
        baseBranch: input.base.branch,
        draft: input.draft,
      },
      signal: context.signal,
    };
    const snapshot = await context.resources.repository.clients.github.upsert(
      input.expectedPullRequestRevision === undefined
        ? request
        : { ...request, expectedProviderRevision: input.expectedPullRequestRevision },
    );
    const pullRequest = toGitHubPullRequest(
      input.repositoryId,
      input.owner,
      input.repository,
      snapshot,
    );
    return {
      value: {
        ...pullRequest,
        ...(input.issueRef === undefined
          ? {}
          : {
              issueRef: {
                owner: input.issueRef.owner,
                repository: input.issueRef.repository,
                number: input.issueRef.number,
                action: input.issueAction,
              },
            }),
      },
    };
  }

  private body(input: Readonly<GitHubPullRequestUpsertInput>): string {
    if (input.issueAction === 'none') {
      if (input.issueRef !== undefined) {
        throw new ScriptFault(
          'revo.script.validation.input',
          'Issue reference is not permitted for issue action none.',
        );
      }
      return input.body.replace(/\r\n?/gu, '\n').trimEnd();
    }
    if (input.issueRef === undefined) {
      throw new ScriptFault(
        'revo.script.validation.input',
        'Issue reference is required by the selected issue action.',
      );
    }
    const issue =
      input.issueRef.owner === input.owner && input.issueRef.repository === input.repository
        ? `#${input.issueRef.number}`
        : `${input.issueRef.owner}/${input.issueRef.repository}#${input.issueRef.number}`;
    const label = input.issueAction === 'close' ? 'Closes' : 'Refs';
    return `${input.body.replace(/\r\n?/gu, '\n').trimEnd()}\n\n${label} ${issue}`;
  }
}
