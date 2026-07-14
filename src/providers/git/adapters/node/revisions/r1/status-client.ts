import { ScriptFault } from '../../../../../../core/spec/script-errors.js';
import type { GitStatusClient, GitStatusSnapshot } from '../../../../contracts/v1/status.js';
import type { ProcessExecutor } from '../../process-executor.js';

const maximumOutputBytes = 1_048_576;
const objectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const trackedStatusPattern = /^[.MTADRCU]{2}$/;
const conflictCodes = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

interface StatusAccumulator {
  branch?: string;
  headSha?: string | null;
  detached: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictedCount: number;
}

const countTrackedEntry = (status: StatusAccumulator, code: string): void => {
  if (!trackedStatusPattern.test(code)) {
    throw new ScriptFault(
      'revo.script.provider.invalid_response',
      'Git returned an invalid tracked status record.',
    );
  }

  if (conflictCodes.has(code)) {
    status.conflictedCount += 1;
    return;
  }

  if (!code.startsWith('.')) {
    status.stagedCount += 1;
  }

  if (!code.endsWith('.')) {
    status.unstagedCount += 1;
  }
};

const parseRecord = (status: StatusAccumulator, record: string): void => {
  if (record.startsWith('# branch.oid ')) {
    const value = record.slice('# branch.oid '.length);
    status.headSha = value === '(initial)' ? null : value;
    return;
  }

  if (record.startsWith('# branch.head ')) {
    const value = record.slice('# branch.head '.length);
    status.detached = value === '(detached)';
    if (status.detached) {
      delete status.branch;
    } else {
      status.branch = value;
    }
    return;
  }

  if (record.startsWith('1 ') || record.startsWith('2 ')) {
    countTrackedEntry(status, record.slice(2, 4));
    return;
  }

  if (record.startsWith('u ')) {
    status.conflictedCount += 1;
    return;
  }

  if (record.startsWith('? ')) {
    status.untrackedCount += 1;
    return;
  }

  if (record.startsWith('# ') || record.startsWith('! ')) {
    return;
  }

  throw new ScriptFault(
    'revo.script.provider.invalid_response',
    'Git returned an unsupported repository status record.',
  );
};

const parseRecords = (status: StatusAccumulator, records: readonly string[]): void => {
  let index = 0;

  while (index < records.length) {
    const record = records[index];

    if (record === undefined) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an incomplete repository status.',
      );
    }

    parseRecord(status, record);
    const isRename = record.startsWith('2 ');

    if (isRename && records[index + 1] === undefined) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an incomplete rename status record.',
      );
    }

    index += isRename ? 2 : 1;
  }
};

const parseStatus = (output: string): GitStatusSnapshot => {
  const status: StatusAccumulator = {
    detached: false,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    conflictedCount: 0,
  };

  parseRecords(status, output.split('\0').filter(Boolean));

  if (status.headSha !== null && !objectIdPattern.test(status.headSha ?? '')) {
    throw new ScriptFault(
      'revo.script.provider.invalid_response',
      'Git returned an invalid repository status.',
    );
  }

  if (status.detached) {
    if (status.headSha === undefined || status.headSha === null) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an invalid detached repository status.',
      );
    }

    return Object.freeze({
      branch: null,
      headSha: status.headSha,
      detached: true,
      stagedCount: status.stagedCount,
      unstagedCount: status.unstagedCount,
      untrackedCount: status.untrackedCount,
      conflictedCount: status.conflictedCount,
    });
  }

  if (status.branch === undefined || status.headSha === undefined) {
    throw new ScriptFault(
      'revo.script.provider.invalid_response',
      'Git returned an incomplete repository status.',
    );
  }

  return Object.freeze({
    branch: status.branch,
    headSha: status.headSha,
    detached: false,
    stagedCount: status.stagedCount,
    unstagedCount: status.unstagedCount,
    untrackedCount: status.untrackedCount,
    conflictedCount: status.conflictedCount,
  });
};

export const createGitStatusClient = (
  processExecutor: ProcessExecutor,
  absolutePath: string,
): GitStatusClient => {
  const client: GitStatusClient = {
    readStatus: async (signal: AbortSignal) => {
      let result;
      try {
        result = await processExecutor({
          command: 'git',
          args: ['status', '--porcelain=v2', '--branch', '-z'],
          cwd: absolutePath,
          maxOutputBytes: maximumOutputBytes,
          signal,
        });
      } catch (error: unknown) {
        throw new ScriptFault('revo.script.provider.unavailable', 'Git status execution failed.', {
          cause: error,
        });
      }

      if (result.exitCode !== 0) {
        throw new ScriptFault('revo.script.provider.unavailable', 'Git status execution failed.');
      }

      const encoder = new TextEncoder();
      const outputBytes =
        encoder.encode(result.stdout).byteLength + encoder.encode(result.stderr).byteLength;

      if (outputBytes > maximumOutputBytes) {
        throw new ScriptFault(
          'revo.script.provider.invalid_response',
          'Git status output exceeded the configured limit.',
        );
      }

      return parseStatus(result.stdout);
    },
  };

  return Object.freeze(client);
};
