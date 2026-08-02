import type { ScriptHandler } from '../../../runtime/spec/definition/index.js';
import type { EchoInput, EchoResources, EchoResult } from './types.js';

export class SystemEchoHandler implements ScriptHandler<EchoInput, EchoResult, EchoResources> {
  async execute(input: Readonly<EchoInput>) {
    return { value: { message: input.message } };
  }
}
