export { createScriptRegistry } from './runtime/registry/create-script-registry.js';
export { createScriptSchema } from './runtime/definition/schema/create-script-schema.js';
export { defineScript } from './runtime/definition/define-script.js';
export { createRevoScripts } from './application/create-revo-scripts.js';
export { ScriptFault } from './runtime/spec/errors/index.js';
export type { ScriptErrorCode } from './runtime/spec/errors/index.js';
export {
  AttemptCancellationResultSchema,
  PreparedScriptBindingSchema,
  ScriptAttemptInputSchema,
  ScriptAttemptRefSchema,
  ScriptAttemptResultSchema,
  ScriptBindingInputSchema,
  ScriptEventSchema,
  ScriptEvidenceSchema,
  ScriptFailureSchema,
  ScriptReconciliationResultSchema,
} from './application/contracts/script-attempt-schemas.js';
export { builtInScriptCatalog } from './application/registration/built-in-script-catalog.js';
export type { BuiltInScriptDescriptor } from './application/registration/built-in-script-descriptor.js';
export type { RevoScripts } from './application/contracts/revo-scripts.js';
export type { RevoScriptsOptions } from './application/contracts/revo-scripts-options.js';
export type { ScriptIdentityPin } from './application/contracts/script-identity-pin.js';
export type {
  AttemptCancellationResult,
  AttemptContext,
  EventSink,
  PreparedScriptBinding,
  ScriptAttemptExecutionContext,
  ScriptAttemptInput,
  ScriptAttemptRef,
  ScriptAttemptResult,
  ScriptAttemptUncertainResult,
  ScriptTerminalAttemptResult,
  ScriptCancelledEvent,
  ScriptCancelledTerminalEventEmission,
  ScriptFailedEvent,
  ScriptFailedTerminalEventEmission,
  ScriptTerminalEventEmission,
  ScriptBindingInput,
  ScriptEvent,
  ScriptEventEmission,
  ScriptLiveEvent,
  ScriptLiveEventEmission,
  ScriptReconciliationResult,
  ScriptStartedEvent,
  ScriptSucceededEvent,
  ScriptSucceededTerminalEventEmission,
  ScriptTerminalEvent,
  ScriptTimedOutEvent,
  ScriptTimedOutTerminalEventEmission,
} from './application/contracts/script-attempt.js';
export {
  approvalScripts,
  builtInScripts,
  githubScripts,
  gitScripts,
  systemScripts,
} from './application/registration/built-ins.js';
export type { ScriptDefinitionModule } from './application/registration/script-definition-module.js';
export type { ScriptDefinitionRegistrar } from './application/registration/script-definition-registrar.js';
export type {
  ScriptContext,
  ScriptDefinition,
  ScriptDefinitionInput,
  ScriptHandler,
  ScriptImplementationIdentity,
} from './runtime/spec/definition/index.js';
export type {
  ScriptImpactClass,
  ScriptManifestAuthoringV1,
  ScriptManifestV1,
  ScriptOperation,
} from './runtime/spec/manifest/index.js';
export type {
  ScriptEvidence,
  ScriptFailure,
  ScriptFailureStage,
  ScriptHandlerResult,
} from './runtime/spec/result/index.js';
export type { ScriptCustomEvent } from './runtime/spec/events/script-custom-event.js';
export type { ScriptResourceMap } from './runtime/spec/resources/index.js';
export type {
  CredentialDescriptor,
  CredentialResolver,
  HostCallContext,
  ResourceResolver,
  ScriptProviderDescriptor,
  ScriptProviderRegistration,
  ScriptResourceDescriptor,
  WorkspaceDescriptor,
  WorkspaceResolver,
} from './host/index.js';
export type {
  DeepReadonly,
  ScriptSchema,
  ScriptSchemaOutput,
} from './runtime/spec/schema/index.js';
