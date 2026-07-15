import type { ScriptContext, ScriptHandler } from '../../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../../runtime/spec/errors/index.js';
import type { GitCommitInput, GitCommitResources, GitCommitResult } from './types.js';

export class GitCommitHandler implements ScriptHandler<
  GitCommitInput,
  GitCommitResult,
  GitCommitResources
> {
  async execute(
    input: Readonly<GitCommitInput>,
    context: Readonly<ScriptContext<GitCommitResources>>,
  ): Promise<{ readonly value: GitCommitResult }> {
    if (context.idempotencyKey === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.key_required',
        'Script execution requires an idempotency key.',
      );
    }

    if (input.resource !== context.resources.repository.name) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The Git resource does not match the pinned resource.',
      );
    }
    const snapshot = await context.resources.repository.clients.git.commit({
      branch: input.branch,
      remoteIdentity: input.remoteIdentity,
      expectedParent: input.expectedParent,
      expectedTree: input.expectedTree,
      message: this.message(input),
      operationKey: context.idempotencyKey,
      author: input.author,
      signal: context.signal,
    });

    return {
      value: {
        schemaVersion: 'git-change/v1',
        repositoryId: input.resource,
        ...snapshot,
      },
    };
  }

  private message(input: Readonly<GitCommitInput>): string {
    const title = input.title.replace(/\r\n?/gu, '\n').trim();
    if (input.issueAction === 'none') {
      if (input.issueRef !== undefined) {
        throw new ScriptFault(
          'revo.script.validation.input',
          'Issue reference is not permitted for issue action none.',
        );
      }
      return `feat: ${title}`;
    }
    if (input.issueRef === undefined) {
      throw new ScriptFault(
        'revo.script.validation.input',
        'Issue reference is required by the selected issue action.',
      );
    }
    const remote = this.repository(input.remoteIdentity);
    const issue =
      input.issueRef.owner === remote.owner && input.issueRef.repository === remote.repository
        ? `#${input.issueRef.number}`
        : `${input.issueRef.owner}/${input.issueRef.repository}#${input.issueRef.number}`;
    return `feat: ${issue} ${title}`;
  }

  private repository(remoteIdentity: string): Readonly<{ owner: string; repository: string }> {
    const parts = remoteIdentity
      .replace(/^[a-z][a-z0-9+.-]*:\/\//iu, '')
      .replace(/^[^@]+@/u, '')
      .replace(/:/u, '/')
      .split('/')
      .filter((part) => part.length > 0);
    const owner = parts.at(-2);
    const repository = parts.at(-1)?.replace(/\.git$/u, '');
    if (owner === undefined || repository === undefined || repository.length === 0) {
      throw new ScriptFault(
        'revo.script.validation.input',
        'The pinned remote identity does not identify a repository.',
      );
    }
    return { owner, repository };
  }
}
