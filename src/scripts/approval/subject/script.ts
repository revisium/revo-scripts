import { defineScript } from '../../../runtime/definition/define-script.js';
import { ApprovalSubjectHandler } from './approval-subject.handler.js';
import { approvalSubjectManifest } from './manifest.js';
import { approvalSubjectInputSchema, approvalSubjectResultSchema } from './schemas.js';
import type {
  ApprovalSubjectInput,
  ApprovalSubjectResources,
  ApprovalSubjectResult,
} from './types.js';

export const approvalSubjectScript = defineScript<
  ApprovalSubjectInput,
  ApprovalSubjectResult,
  ApprovalSubjectResources
>({
  manifest: approvalSubjectManifest,
  inputSchema: approvalSubjectInputSchema,
  resultSchema: approvalSubjectResultSchema,
  implementation: { id: '@revisium/revo-scripts/approval/subject', version: '1.0.0' },
  handler: new ApprovalSubjectHandler(),
});
