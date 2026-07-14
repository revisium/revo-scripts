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
    const snapshot = await context.resources.repository.clients.github.upsert({
      head: input.head,
      base: input.base,
      title: input.title,
      body: input.body,
      draft: input.draft,
      operationKey: context.idempotencyKey,
      signal: context.signal,
    });
    return { value: toGitHubPullRequest(input.repositoryId, snapshot) };
  }
}
