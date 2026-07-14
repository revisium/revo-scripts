import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitStatusSnapshot } from '../../../contracts/git-status-client.js';

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

const createStatusAccumulator = (): StatusAccumulator => ({
  detached: false,
  stagedCount: 0,
  unstagedCount: 0,
  untrackedCount: 0,
  conflictedCount: 0,
});

export class PorcelainV2Parser {
  private status = createStatusAccumulator();

  parse(output: string): GitStatusSnapshot {
    this.status = createStatusAccumulator();
    this.parseRecords(output.split('\0').filter(Boolean));
    this.validateHead();

    if (this.status.detached) {
      return this.detachedSnapshot();
    }

    return this.attachedSnapshot();
  }

  private parseRecords(records: readonly string[]): void {
    let index = 0;

    while (index < records.length) {
      const record = records[index];

      if (record === undefined) {
        throw new ScriptFault(
          'revo.script.provider.invalid_response',
          'Git returned an incomplete repository status.',
        );
      }

      this.parseRecord(record);
      const isRename = record.startsWith('2 ');

      if (isRename && records[index + 1] === undefined) {
        throw new ScriptFault(
          'revo.script.provider.invalid_response',
          'Git returned an incomplete rename status record.',
        );
      }

      index += isRename ? 2 : 1;
    }
  }

  private parseRecord(record: string): void {
    if (record.startsWith('# branch.oid ')) {
      const value = record.slice('# branch.oid '.length);
      this.status.headSha = value === '(initial)' ? null : value;
      return;
    }

    if (record.startsWith('# branch.head ')) {
      const value = record.slice('# branch.head '.length);
      this.status.detached = value === '(detached)';
      if (this.status.detached) {
        delete this.status.branch;
      } else {
        this.status.branch = value;
      }
      return;
    }

    if (record.startsWith('1 ') || record.startsWith('2 ')) {
      this.countTrackedEntry(record.slice(2, 4));
      return;
    }

    if (record.startsWith('u ')) {
      this.status.conflictedCount += 1;
      return;
    }

    if (record.startsWith('? ')) {
      this.status.untrackedCount += 1;
      return;
    }

    if (record.startsWith('# ') || record.startsWith('! ')) {
      return;
    }

    throw new ScriptFault(
      'revo.script.provider.invalid_response',
      'Git returned an unsupported repository status record.',
    );
  }

  private countTrackedEntry(code: string): void {
    if (!trackedStatusPattern.test(code)) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an invalid tracked status record.',
      );
    }

    if (conflictCodes.has(code)) {
      this.status.conflictedCount += 1;
      return;
    }

    if (!code.startsWith('.')) {
      this.status.stagedCount += 1;
    }

    if (!code.endsWith('.')) {
      this.status.unstagedCount += 1;
    }
  }

  private validateHead(): void {
    if (this.status.headSha !== null && !objectIdPattern.test(this.status.headSha ?? '')) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an invalid repository status.',
      );
    }
  }

  private detachedSnapshot(): GitStatusSnapshot {
    if (this.status.headSha === undefined || this.status.headSha === null) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an invalid detached repository status.',
      );
    }

    return {
      branch: null,
      headSha: this.status.headSha,
      detached: true,
      stagedCount: this.status.stagedCount,
      unstagedCount: this.status.unstagedCount,
      untrackedCount: this.status.untrackedCount,
      conflictedCount: this.status.conflictedCount,
    };
  }

  private attachedSnapshot(): GitStatusSnapshot {
    if (this.status.branch === undefined || this.status.headSha === undefined) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an incomplete repository status.',
      );
    }

    return {
      branch: this.status.branch,
      headSha: this.status.headSha,
      detached: false,
      stagedCount: this.status.stagedCount,
      unstagedCount: this.status.unstagedCount,
      untrackedCount: this.status.untrackedCount,
      conflictedCount: this.status.conflictedCount,
    };
  }
}
