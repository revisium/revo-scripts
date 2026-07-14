import { ScriptFault } from '../../spec/errors/index.js';
import { codePointLength } from '../../validation/code-point-length.js';

export const validateExecutionId = (executionId: string): void => {
  if (codePointLength(executionId) === 0 || codePointLength(executionId) > 256) {
    throw new ScriptFault(
      'revo.script.validation.input',
      'Execution id must contain between 1 and 256 Unicode code points.',
    );
  }
};
