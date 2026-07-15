import type { ScriptHandler } from '../../../runtime/spec/definition/index.js';
import type {
  ApprovalSubjectInput,
  ApprovalSubjectResources,
  ApprovalSubjectResult,
} from './types.js';

export class ApprovalSubjectHandler implements ScriptHandler<
  ApprovalSubjectInput,
  ApprovalSubjectResult,
  ApprovalSubjectResources
> {
  async execute(input: Readonly<ApprovalSubjectInput>) {
    return { value: { schemaVersion: 'approval-subject/v1' as const, ...input } };
  }
}
