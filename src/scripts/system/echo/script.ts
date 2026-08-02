import { defineScript } from '../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../runtime/generated/built-in-implementation.js';
import { echoManifest } from './manifest.js';
import { echoInputSchema, echoResultSchema } from './schemas.js';
import { SystemEchoHandler } from './system-echo.handler.js';
import type { EchoInput, EchoResources, EchoResult } from './types.js';

export const systemEchoScript = defineScript<EchoInput, EchoResult, EchoResources>({
  manifest: echoManifest,
  inputSchema: echoInputSchema,
  resultSchema: echoResultSchema,
  implementation: builtInImplementation('script:system/echo', '1.0.0'),
  handler: new SystemEchoHandler(),
});
