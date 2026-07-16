import { ScriptFault } from '../../spec/errors/index.js';
import { codePointLength } from '../../validation/code-point-length.js';

export const isValidExecutionId = (executionId: unknown): executionId is string =>
  typeof executionId === 'string' &&
  codePointLength(executionId) >= 1 &&
  codePointLength(executionId) <= 256;

export const validateExecutionId = (executionId: unknown): void => {
  if (!isValidExecutionId(executionId)) {
    throw new ScriptFault(
      'revo.script.validation.input',
      'Execution id must contain between 1 and 256 Unicode code points.',
    );
  }
};
