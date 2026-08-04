import { defineScript } from '../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../runtime/generated/built-in-implementation.js';
import { ApprovalSubjectHandler } from './approval-subject.handler.js';
import { approvalSubjectManifest } from './manifest.js';
import type {
  ApprovalSubjectInput,
  ApprovalSubjectResources,
  ApprovalSubjectResult,
} from './schemas.js';
import { approvalSubjectInputSchema, approvalSubjectResultSchema } from './schemas.js';

export const approvalSubjectScript = defineScript<
  ApprovalSubjectInput,
  ApprovalSubjectResult,
  ApprovalSubjectResources
>({
  manifest: approvalSubjectManifest,
  inputSchema: approvalSubjectInputSchema,
  resultSchema: approvalSubjectResultSchema,
  implementation: builtInImplementation(approvalSubjectManifest.id, '1.0.0'),
  handler: new ApprovalSubjectHandler(),
});
