import type { ScriptExecutionResult } from '../../spec/result/index.js';

export type ScriptInputValidation<I, O> =
  | { readonly ok: true; readonly value: Readonly<I> }
  | { readonly ok: false; readonly result: ScriptExecutionResult<O> };
