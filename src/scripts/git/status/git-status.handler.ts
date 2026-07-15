import type { ScriptContext, ScriptHandler } from '../../../runtime/spec/definition/index.js';
import type { GitStatusInput, GitStatusResources, GitStatusResult } from './types.js';

export class GitStatusHandler implements ScriptHandler<
  GitStatusInput,
  GitStatusResult,
  GitStatusResources
> {
  async execute(
    _input: Readonly<GitStatusInput>,
    context: Readonly<ScriptContext<GitStatusResources>>,
  ): Promise<{ readonly value: GitStatusResult }> {
    const status = await context.resources.repository.clients.git.readStatus(context.signal);

    return {
      value: {
        schemaVersion: 'workspace-change/v1',
        ...status,
      },
    };
  }
}
