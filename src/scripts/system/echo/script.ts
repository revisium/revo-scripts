import { defineScript } from '../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../runtime/generated/built-in-implementation.js';
import { echoManifest } from './manifest.js';
import {
  echoInputSchema,
  echoResultSchema,
  type EchoInput,
  type EchoResources,
  type EchoResult,
} from './schemas.js';
import { SystemEchoHandler } from './system-echo.handler.js';

export const systemEchoScript = defineScript<EchoInput, EchoResult, EchoResources>({
  manifest: echoManifest,
  inputSchema: echoInputSchema,
  resultSchema: echoResultSchema,
  implementation: builtInImplementation(echoManifest.id, '1.0.0'),
  handler: new SystemEchoHandler(),
});
