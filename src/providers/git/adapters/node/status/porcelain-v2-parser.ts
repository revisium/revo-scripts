import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitChangedPath, GitChangedPathStatus } from '../../../contracts/git-status-client.js';

const trackedRecordPattern = /^1 ([.MTADRCU]{2}) \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/;
const renamedRecordPattern = /^2 ([.MTADRCU]{2}) \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/;

const statusFor = (code: string, renamed: boolean): GitChangedPathStatus => {
  if (renamed || code.includes('R')) {
    return 'renamed';
  }

  if (code.includes('D')) {
    return 'deleted';
  }

  if (code.includes('A')) {
    return 'added';
  }

  return 'modified';
};

const compareChangedPaths = (left: GitChangedPath, right: GitChangedPath): number =>
  left.path.localeCompare(right.path) || left.status.localeCompare(right.status);

interface ParsedStatusRecord {
  readonly changedPath?: GitChangedPath;
  readonly consumedRecords: 1 | 2;
}

export class PorcelainV2Parser {
  parseChangedPaths(output: string): readonly GitChangedPath[] {
    const records = output.split('\0').filter(Boolean);
    const changedPaths: GitChangedPath[] = [];
    let index = 0;

    while (index < records.length) {
      const parsed = this.parseRecord(records, index);
      if (parsed.changedPath !== undefined) {
        changedPaths.push(parsed.changedPath);
      }
      index += parsed.consumedRecords;
    }

    return changedPaths.sort(compareChangedPaths);
  }

  private parseRecord(records: readonly string[], index: number): ParsedStatusRecord {
    const record = records[index];
    if (record === undefined) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an incomplete repository status.',
      );
    }
    if (record.startsWith('# ') || record.startsWith('! ')) {
      return { consumedRecords: 1 };
    }
    if (record.startsWith('? ')) {
      const path = record.slice(2);
      this.assertPath(path);
      return {
        changedPath: { path, status: 'untracked' },
        consumedRecords: 1,
      };
    }
    if (record.startsWith('u ')) {
      const path = record.split(' ').slice(10).join(' ');
      this.assertPath(path);
      return { changedPath: { path, status: 'modified' }, consumedRecords: 1 };
    }

    return this.parseTrackedRecord(record, records[index + 1]);
  }

  private parseTrackedRecord(record: string, nextRecord: string | undefined): ParsedStatusRecord {
    const renamed = record.startsWith('2 ');
    const match = renamed ? renamedRecordPattern.exec(record) : trackedRecordPattern.exec(record);
    if (match === null) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an unsupported repository status record.',
      );
    }

    const path = match[2];
    this.assertPath(path);
    if (renamed) {
      this.assertPath(nextRecord);
    }
    return {
      changedPath: { path, status: statusFor(match[1] ?? '', renamed) },
      consumedRecords: renamed ? 2 : 1,
    };
  }

  private assertPath(path: string | undefined): asserts path is string {
    if (path === undefined || path.length === 0 || path.length > 4_096 || path.includes('\0')) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an invalid changed path.',
      );
    }
  }
}
