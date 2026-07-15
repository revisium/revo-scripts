import type { ScriptContext, ScriptHandler } from '../../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../../runtime/spec/errors/index.js';
import type { GitStatusInput, GitStatusResources, GitStatusResult } from './types.js';

export class GitStatusHandler implements ScriptHandler<
  GitStatusInput,
  GitStatusResult,
  GitStatusResources
> {
  async execute(
    input: Readonly<GitStatusInput>,
    context: Readonly<ScriptContext<GitStatusResources>>,
  ): Promise<{ readonly value: GitStatusResult }> {
    const status = await context.resources.repository.clients.git.readStatus(context.signal);
    if (
      input.resource !== context.resources.repository.name ||
      status.baseCapture !== input.baseCapture ||
      status.headCapture !== input.headCapture
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The workspace observation no longer matches the pinned captures.',
      );
    }

    return {
      value: {
        schemaVersion: 'workspace-change/v1',
        ...status,
        changedPaths: [...status.changedPaths].sort((left, right) =>
          left.path === right.path
            ? left.status.localeCompare(right.status)
            : left.path.localeCompare(right.path),
        ),
      },
    };
  }
}
