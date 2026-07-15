# Script runtime v1 specification

- **Status:** Accepted
- **Version:** v1
- **Owners:** package SDK, runtime, registry, and built-in scripts
- **Related ADR:** [ADR-0001](../adr/0001-script-sdk-and-runtime-boundary.md)
- **Testing:** [Testing](../testing.md)
- **Source refinement:** [Orchestrator milestone 11 contract](https://github.com/revisium/orchestrator/blob/master/docs/specs/script-runtime-v1.spec.md)

## Scope

This specification defines the proposed stable public SDK and runtime for one bounded Revo script: serializable
manifests, runtime schemas and definitions, explicit registration, the high-level consumer facade, host bindings,
provider modules, execution context and result, errors, events, redaction, payload bounds, extension trust, public
entrypoints, and the bounded built-in operations shipped by this repository.

It does not define pipeline routing, durable workflow state, human gates, workspace allocation, credential storage,
artifact persistence, provider account selection policy, or automatic plugin discovery. It defines how opaque
workspace and credential bindings cross into trusted provider infrastructure after the host has made those decisions.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, REQUIRED, and OPTIONAL are interpreted following RFC 2119 and
BCP 14 when, and only when, they appear in all capitals.

## Current Contract

The repository implements the root, `spec`, `runtime`, `host`, `approval`, `git`, `github`, `providers/git`,
`providers/github`, and `testing` entrypoints; the `createRevoScripts` facade; package-owned Node Git and Fetch GitHub
providers; and the approval-subject, Git status/commit/push, pull-request upsert/ready/readiness/merge, and review-thread
reply/resolve operations. Coordinate and credential enforcement, exact provider pins, declarations, exports, package
content, architecture boundaries, local Git integration, and mocked GitHub provider contracts are executable gates.
The npm package is not published. Multi-version source retention, a stable external custom-script distribution
contract, and orchestrator cutover remain deferred.

## Target Contract

### Package responsibility

The package MUST define, validate, register, test, and execute one bounded script. It MAY ship independently versioned
built-ins that use the same definition contract. A built-in MUST own its complete observable
operation, including provider calls, normalization, stale-state checks, idempotency and crash reconciliation,
provider-error mapping, and result construction.

The package MUST provide package-owned production provider modules for its built-in Git and GitHub operations. A
consumer MUST NOT implement one capability, handler, or dispatch branch per built-in script. Adding a definition that
uses an already installed provider family MUST require only a package upgrade, an exact pipeline reference, and a valid
execution-plan grant; it MUST NOT require a host executor code change.

The package MUST NOT choose the next pipeline operation, mutate a pipeline cursor, create or resolve a human gate,
allocate or release a workspace, read mutable playbook state, or access DBOS, Prisma, or NestJS.

General-purpose Revo helpers MUST NOT be added. A utility belongs in the package only when it directly supports script
definition, validation, execution, a built-in operation, or contract testing.

### Consumer facade and startup composition

The high-level host integration is composed once:

```ts
type RevoScriptsOptions = {
  definitions: readonly ScriptDefinitionModule[];
  providers: readonly ScriptProviderRegistration[];
  host: RevoScriptsHost;
};

type RevoScriptsHost = {
  workspaces: WorkspaceResolver;
  credentials: CredentialResolver;
  events: EventSink;
  clock?: ScriptClock;
};

type ScriptDefinitionModule = {
  id: string;
  provenance: {
    packageName: string;
    packageVersion: string;
  };
  registerInto(registrar: ScriptDefinitionRegistrar): void;
};

type ScriptDefinitionRegistrar = {
  register<I, O, R extends ScriptResourceMap>(definition: ScriptDefinition<I, O, R>): void;
};

type ScriptProviderContractRef = `revo.provider.${string}/v${number}`;

type ScriptProviderRegistration = {
  module: ScriptProviderModule;
  useForNewPlans: boolean;
};

type ScriptProviderModule = {
  id: `provider:${string}`;
  contract: ScriptProviderContractRef;
  implementationDigest: `sha256:${string}`;
  provenance: {
    packageName: string;
    packageVersion: string;
  };
  effects: readonly ScriptEffect[];
  workspace: 'required' | 'none';
  coordinateSchema?: ScriptSchema<Readonly<Record<string, unknown>>>;
  createResourceClients(request: ProviderClientRequest): Promise<PreparedProviderClients>;
};

type ScriptProviderDescriptor = Pick<
  ScriptProviderModule,
  'id' | 'contract' | 'implementationDigest' | 'provenance' | 'effects' | 'workspace'
> & {
  useForNewPlans: boolean;
};

type PreparedProviderClients = {
  clients: Readonly<Record<string, object>>;
  dispose(): Promise<void>;
};

type RevoScripts = {
  resolveForPlan(script: { id: `script:${string}`; version: string }): ScriptPlanDescriptor;
  execute(request: RevoScriptExecutionRequest): Promise<ScriptExecutionResult<unknown>>;
  listManifests(): readonly ScriptManifestV1[];
  listProviderImplementations(): readonly ScriptProviderDescriptor[];
};

type ScriptPlanDescriptor = {
  script: {
    id: `script:${string}`;
    version: string;
    definitionDigest: `sha256:${string}`;
  };
  providers: readonly ScriptProviderPin[];
  manifest: ScriptManifestV1;
};

declare function createRevoScripts(options: RevoScriptsOptions): RevoScripts;
```

`createRevoScripts` MUST explicitly enumerate every trusted definition and provider module. Package-provided
`approvalScripts()`, `gitScripts()`, and `githubScripts()` modules register one selected family; `builtInScripts()` is a convenience
composition of every built-in family for hosts that install every corresponding provider. A host MUST NOT need a
provider for an unselected definition family. The callback shape preserves each concrete definition's input, output,
and resource generics without `any`, unsafe casts, or an impossible heterogeneous array type. This is explicit module
registration, not directory scanning or import-time side-effect registration.

Startup MUST fail on a duplicate definition identity, duplicate provider `(id, implementationDigest)`, more than one
new-plan default for one provider contract, a missing provider contract required by a selected definition module, or
an invalid definition. One provider module MUST NOT repeat an effect in its own effect list. Retained revisions and
separate resource-scoped provider requirements MAY declare the same effect because exact pins and resource association
disambiguate them. The facade MUST seal its definition and provider registries before returning. Updating the package
MAY make additional definitions available through the same selected family module, but a run can execute one only when
its immutable plan names the exact id, version, definition digest, provider implementation pins, and grants its
declared requirements.

Multiple exact implementations of one provider contract MAY be registered for recovery. Exactly one compatible
implementation MUST be marked `useForNewPlans` when that contract is available for new plan compilation. The flag is
host composition policy, not provider-module metadata. Execution resolves only exact plan pins; it MUST NOT consult the
new-plan default or fall back to another implementation.

A package provider-family factory returns the configured implementation for new plans. The current package contains
one implementation per provider id and does not expose an internal revision selector. Supporting multiple retained
implementations requires a separate accepted source-retention and composition design; revision folder names MUST NOT
be inferred as provider contract versions, pipeline data, or execution pins.

`resolveForPlan` is the generic compilation seam. It resolves an exact script definition, matches every manifest
provider requirement to the one configured new-plan default for that contract, and returns immutable definition and
provider pins plus the manifest maximums that host policy must grant or narrow. It MUST NOT resolve a workspace,
credential, or provider client. It performs the same algorithm for every script id and fails closed on an absent exact
version, unavailable contract, or ambiguous default.

Client keys contributed to one resource handle MUST be unique across selected providers. A duplicate client key fails
preflight, disposes every client and credential lease already constructed for that attempt, and invokes no handler.
It returns `revo.script.provider.client_conflict`.

The low-level `defineScript`, `createScriptRegistry`, and `executeScript` APIs remain the SDK/runtime foundation for
definition authors, provider contract tests, and advanced trusted hosts. The high-level facade is the primary pipeline
consumer API.

### Host bindings and privileged resolvers

Portable pipeline data names logical resources and credential slots. The immutable execution plan binds those names to
host-owned identities:

```ts
type ScriptResourceBinding = {
  resourceId: string;
  kind: 'repository';
  repositoryId: string;
  workspaceId?: string;
  access: 'read' | 'write' | 'publish' | 'admin';
  grant: {
    permissions: readonly string[];
    effects: readonly ScriptEffect[];
  };
  providerCoordinates: Readonly<Record<string, unknown>>;
};

type ScriptCredentialBinding = {
  alias: string;
  provider: string;
};

type ScriptExecutionBindings = {
  resources: Readonly<Record<string, ScriptResourceBinding>>;
  credentials: Readonly<Record<string, ScriptCredentialBinding>>;
};

type ScriptProviderPin = {
  name: string;
  resource: string;
  id: `provider:${string}`;
  contract: ScriptProviderContractRef;
  implementationDigest: `sha256:${string}`;
  workspace: 'required' | 'none';
  provenance: {
    packageName: string;
    packageVersion: string;
  };
};

type RevoScriptExecutionRequest = {
  executionId: string;
  script: {
    id: `script:${string}`;
    version: string;
    definitionDigest: `sha256:${string}`;
  };
  input: unknown;
  providers: readonly ScriptProviderPin[];
  bindings: ScriptExecutionBindings;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
```

The portable pipeline node contains only exact script id and version, input, and logical resource requirements. It does
not contain a provider id, provider implementation, definition digest, path, or credential alias. During execution-plan
compilation, generic host code resolves the exact definition and each required provider contract from the facade's
sealed catalogs, applies host policy, and records the definition digest and exact provider pins shown above.

The plan MUST contain no absolute workspace path, secret value, provider client, executable source, or ambient account
selection. Resource and credential binding names MUST match the selected manifest exactly; extra or missing bindings
fail before a provider is constructed. Provider pin names, resources, and contracts MUST match the manifest's provider
requirements exactly, and each pin MUST resolve by `(id, contract, implementationDigest, workspace, provenance)` before
privileged host state is resolved. One request contains at most 16 resource bindings and eight provider pins. One
binding contains at most 64 unique permissions and 16 unique effects. Binding strings use the corresponding manifest
limits, and the complete binding payload is subject to the 1 MiB input bound. Provider-coordinate bounds are defined
with their schema rules below.

`WorkspaceResolver` and `CredentialResolver` are privileged host integration ports. They resolve only pinned opaque
identities. Their resolved values are visible to the selected trusted provider module and MUST NOT be copied into a
handler context, result, event, artifact, or public error.

```ts
type WorkspaceResolver = {
  resolve(workspaceId: string, signal: AbortSignal): Promise<TrustedWorkspaceAllocation>;
};

type TrustedWorkspaceAllocation = {
  workspaceId: string;
  repositoryId: string;
  absolutePath: string;
};

type CredentialResolver = {
  resolve(binding: ScriptCredentialBinding, signal: AbortSignal): Promise<ResolvedCredential>;
};

type ResolvedCredential = {
  alias: string;
  provider: string;
  secret: string;
  dispose(): Promise<void>;
};

type ProviderClientRequest = {
  manifest: ScriptManifestV1;
  provider: ScriptProviderRequirement;
  requirement: ScriptResourceRequirement;
  binding: ScriptResourceBinding;
  workspace?: TrustedWorkspaceAllocation;
  credentials: Readonly<Record<string, ResolvedCredential>>;
  signal: AbortSignal;
};
```

These privileged types MUST be exported only from a host/provider integration entrypoint, never from `spec`, a script
domain entrypoint, or `ScriptContext`. Implementations SHOULD prefer a short-lived credential lease or callback scope
when the host can support it; a provider MUST discard the resolved credential after the execution attempt.

`ProviderClientRequest` contains the already-authorized provider requirement, the resource requirement named by its
`resource` field and that resource's matching binding, the resolved workspace allocation when required, only the
resolved credentials assigned to that provider requirement, and the abort signal. The central runtime validates the
intersection before invoking a provider; a provider MUST NOT widen access or expose privileged values in its returned
client object.

A provider with `workspace: 'required'` fails before construction when its binding has no `workspaceId`. A provider
with `workspace: 'none'` receives no resolved workspace even if the run has one. The facade MUST NOT resolve an unused
workspace merely because one exists in the execution plan.

Workspace need is provider-module-wide in v1. A provider family with both workspace-bound and workspace-free effects
MUST expose separate explicit provider modules under distinct contract refs, for example
`revo.provider.example.workspace/v1` and `revo.provider.example.api/v1`. A module MUST NOT make workspace resolution
conditional on a concrete script id. One new-plan default is selected independently for each distinct contract ref.

Provider coordinates are immutable plan facts required to address a provider resource without reading mutable local
state. A GitHub coordinate is `{ owner, repository }`; a GitHub operation MUST NOT derive it from a workspace remote at
execution time. A provider that needs a coordinate declares a closed `coordinateSchema`; a provider that needs none
omits it. On each resource binding, coordinate keys MUST exactly match the manifest provider-requirement names attached
to that resource whose selected implementations declare a schema. A missing required coordinate, a coordinate for a
provider without a schema, or an unknown, duplicate, invalid, or unbounded coordinate fails before workspace or
credential resolution. The collection is limited to eight entries and its complete JSON representation to 16 KiB. A
new provider can add its own closed coordinate schema without changing the generic binding type.

A provider implementation digest is generated from the adapter's emitted runtime closure with the same deterministic
path, length, and byte framing used for a definition build digest. It excludes unrelated scripts, other adapters, and
generated metadata. CI MUST reproduce and compare it. A changed adapter closure produces a new digest even when it
still implements the same provider contract major.

Built-in adapter implementations live under paths such as `src/providers/git/adapters/node/`. The current factory
returns one new-plan implementation. Before the package retains two implementations for recovery, an accepted design
MUST define their source ownership, export/composition rules, generated digests, and external pin audit. Provider
contracts and adapters remain owned and published by `@revisium/revo-scripts`; v1 defines no separately released
provider package seam.

A new provider family is installed by adding an explicit provider/definition module plus host credential and resource
configuration. Generic pipeline execution MUST remain unchanged. A host-layer change is justified only when the new
provider requires a resource lifecycle that `ScriptExecutionBindings` and the existing resolvers cannot safely
represent.

### Serializable manifest

```ts
type ScriptManifestV1 = {
  schemaVersion: 'revo.script.manifest/v1';
  id: `script:${string}`;
  version: string;
  summary: string;
  inputSchemaId: string;
  resultSchemaId: string;
  effectClass: 'pure' | 'read' | 'write' | 'publish' | 'admin';
  permissions: readonly string[];
  resources: readonly ScriptResourceRequirement[];
  providers: readonly ScriptProviderRequirement[];
  credentials: readonly ScriptCredentialRequirement[];
  effects: readonly ScriptEffect[];
  timeout: { wallClockMs: number };
  retry: {
    mode: 'never' | 'transient';
    maxAttempts: number;
    backoffMs: readonly number[];
  };
  idempotency: 'read-only' | 'required' | 'not-retryable';
  redaction: {
    inputPaths: readonly string[];
    resultPaths: readonly string[];
    errorPaths: readonly string[];
    eventPaths: readonly string[];
  };
  events: {
    allowed: readonly string[];
    detailPaths: readonly string[];
  };
};

type ScriptResourceRequirement = {
  name: string;
  kind: 'repository';
  access: 'read' | 'write' | 'publish' | 'admin';
};

type ScriptProviderRequirement = {
  name: string;
  contract: ScriptProviderContractRef;
  resource: string;
};

type ScriptCredentialRequirement = {
  name: string;
  provider: string;
  providerRequirement: string;
};

type ScriptEffect =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'git.read'
  | 'git.write'
  | 'git.remote-write'
  | 'github.read'
  | 'github.write';
```

The manifest MUST be JSON-serializable and MUST reject unknown fields. The script id MUST match
`^script:[a-z][a-z0-9-]*(/[a-z][a-z0-9-]*)+$`. A version identifies one immutable observable contract and MUST be an
exact semantic version without a range.

Schema identifiers MUST be stable identifiers rather than filesystem paths. Permission identifiers MUST be
namespaced. Resource, provider-slot, and credential names MUST match `^[a-z][a-z0-9-]*$`. Provider contract refs MUST
match `^revo\.provider\.[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*/v[1-9][0-9]*$`. Credential provider ids MUST be stable
lowercase identifiers and MUST NOT identify an account. Resource, provider-slot, and credential names MUST each be
unique within one manifest. Duplicate permissions, resources, provider requirements, credentials, effects, event
names, or redaction paths MUST be rejected. Every provider requirement MUST reference exactly one resource name
declared by the same manifest. Multiple providers MAY attach bounded clients to one resource; a provider needed on two
resources uses two uniquely named requirements. Every credential requirement MUST reference exactly one declared
provider-requirement name.

The `ScriptProviderContractRef` template literal is a readable TypeScript approximation. Provider-contract creation
and manifest validation MUST apply the stricter runtime pattern above, including rejection of `v0`.

Script ids, schema ids, permission ids, event names, provider contract refs, credential provider ids, and
implementation ids MUST be no longer
than 256 Unicode code points. Versions, resource names, provider-slot names, and credential names MUST be no longer
than 128 Unicode code points. A summary MUST be no longer than 512 Unicode code points. A manifest MUST contain at most 16 resources, eight
provider requirements, 16 credential requirements, 64 permissions, 64 custom event names, and 128 redaction or detail
paths; each path MUST be no longer than 512 Unicode code points. No extension point may accept an unbounded string,
collection, or arbitrary nested payload.

Effect-class coherence is fixed by this table:

| Effect class | Maximum resource access | Permitted effects                                                                             |
| ------------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| `pure`       | no resource             | none                                                                                          |
| `read`       | `read`                  | `filesystem.read`, `git.read`, `github.read`                                                  |
| `write`      | `write`                 | `filesystem.read`, `git.read`, `github.read`, `filesystem.write`, `git.write`, `github.write` |
| `publish`    | `publish`               | every `write` effect and `git.remote-write`                                                   |
| `admin`      | `admin`                 | every `publish` effect                                                                        |

`admin` is distinguished by its resource access and operation permission rather than a generic provider effect.
Pull-request merge is a `publish` operation in v1 because it publishes an exact reviewed revision without repository
administration. The mutation-effect set is
exactly `filesystem.write`, `git.write`, `git.remote-write`, and `github.write`.

Effect ownership describes the bounded surface exposed to a handler, not every implementation detail used inside a
provider. A Git provider's private filesystem reads are covered by `git.read`; `filesystem.read` is required only when
a handler receives a bounded filesystem client. Filesystem effects remain reserved until an explicit filesystem
provider module owns them. Startup rejects a definition whose declared effect has no installed owner.

A permission id identifies one bounded operation authorization, such as `git.status.read` or
`github.pull-request.merge`. All permission ids declared by a manifest MUST be present in the prepared host grant.
Permissions do not imply an effect or resource access and cannot widen either. `defineScript` validates permission
syntax and uniqueness; a capability contract and its per-script contract tests own the mapping from invoked operations
to permission ids.

A `pure` manifest MUST have empty permissions, resources, providers, credentials, and effects. All other effect classes MAY
declare operation permissions and credential requirements within their resource and effect maximums. A non-`pure`
manifest with any permission, credential, or effect MUST declare at least one resource. A credential requirement names
a logical slot such as `github`, its credential-system provider, and the provider requirement allowed to receive it.
The execution plan binds the slot to one alias such as `github-publication-account`. Each provider construction
receives only credentials assigned to its requirement. Manifests and script input MUST NOT contain credential aliases
or secret values. The prepared host grant is the union of the immutable permission and effect grants on the resource
handles supplied for that execution.

A provider requirement names the bounded client slot a handler expects, the resource handle that receives that client,
and the compatible provider protocol major. It MUST NOT name an adapter implementation, npm package version, account,
transport, or implementation digest. Every declared non-empty effect set MUST be covered by the selected exact
implementations of the declared provider contracts.

`timeout.wallClockMs` covers the complete execution including attempts and backoff. It MUST be a positive safe integer
no greater than 300,000. The executor MUST stop starting attempts when the remaining deadline cannot accommodate the
next backoff.

`retry.maxAttempts` includes the first attempt and MUST be between one and five. `never` requires one attempt and no
backoff. `transient` requires `backoffMs.length === maxAttempts - 1`. Each backoff MUST be a non-negative safe integer.

`read-only` MUST NOT declare a mutation effect. `required` MUST declare at least one mutation effect and requires a
host-provided idempotency key. `not-retryable` MUST declare at least one mutation effect and requires one attempt.

### Schemas and definitions

```ts
type ScriptSchema<T> = {
  id: string;
  validate(value: unknown): Promise<ScriptSchemaResult<T>>;
  toJsonSchema(): Readonly<Record<string, unknown>>;
};

type ScriptSchemaResult<T> =
  { ok: true; value: T } | { ok: false; issues: readonly ScriptSchemaIssue[] };

type ScriptSchemaIssue = {
  message: string;
  path: readonly (string | number)[];
};

type ScriptDefinition<I, O, R extends ScriptResourceMap> = {
  manifest: ScriptManifestV1;
  inputSchema: ScriptSchema<I>;
  resultSchema: ScriptSchema<O>;
  handler: ScriptHandler<I, O, R>;
  implementation: {
    id: string;
    version: string;
    buildDigest: `sha256:${string}`;
  };
  definitionDigest: `sha256:${string}`;
};

interface ScriptHandler<I, O, R extends ScriptResourceMap> {
  execute(input: Readonly<I>, context: Readonly<ScriptContext<R>>): Promise<ScriptHandlerResult<O>>;
}
```

`ScriptSchema` MUST remain validation-library-neutral. The initial adapter SHOULD accept Standard Schema V1 validators
and Standard JSON Schema V1 converters. Built-ins MAY use Zod through that adapter; Zod types MUST NOT become required
members of the runtime definition contract.

JSON Schemas MUST target Draft 2020-12, carry the schema id declared by the manifest, describe JSON-compatible values,
and reject unknown object properties unless a schema explicitly models a bounded map. Runtime validation and emitted
JSON Schema MUST describe the same accepted values.

`defineScript` MUST validate the manifest, both schemas, policy coherence, and implementation
identity. It MUST compute the definition digest over RFC 8785 canonical JSON containing the manifest, both JSON
Schemas, implementation id, implementation version, and build digest. It MUST return a TypeScript-readonly definition
snapshot that does not retain caller-owned collections.

A manifest MAY declare `classification` as a bounded RFC 6901 pointer into its closed result value. This is a generic
consumer hint, not a concrete-script dispatch rule: a host reads the declared pointer after normal schema validation.
`script:github/pull-request/readiness` declares `/classification` and returns `clean`, `review_changes`, or `blocked`.

Handler source and executable schema objects MUST NOT be serialized into a manifest, event, artifact, or definition
pin. A build digest is generated by the trusted package build rather than hand-authored or recomputed during execution.
It covers the emitted runtime closure for that exact script definition, including its schemas and transitive owned
helpers, but excludes unrelated definitions and generated build metadata. Adding an unrelated script MUST NOT change
an existing definition digest when that existing definition's contract and executable closure are byte-identical.
Helpers in the runtime closure of a published version are retained with that version or copied into a new version-owned
closure before modification. A mutable shared helper MUST NOT silently change an already-published definition digest.

The target generator performs a fresh temporary TypeScript emission, sorts the owned runtime closure by
POSIX-relative path, and feeds each relative path, NUL, decimal byte length, NUL, exact bytes, and NUL into one SHA-256
stream. CI regenerates into a temporary location and compares the committed/generated metadata byte-for-byte. Stale
metadata, a digest mismatch, or an unavailable exact definition implementation blocks startup/recovery before provider
construction. Historical executable retention is a release/deployment responsibility, but build identity is part of
the v1 definition contract.

### Versioning and exact retention

The npm package version, script version, provider contract version, and provider implementation pin answer different
questions:

| Identity                       | Meaning                                                     | Selected by             |
| ------------------------------ | ----------------------------------------------------------- | ----------------------- |
| npm package SemVer             | Release vehicle containing definitions and providers        | deployment              |
| exact script SemVer            | Immutable observable operation contract and implementation  | portable pipeline node  |
| provider contract major        | Bounded client protocol compatibility, for example Git `v1` | script manifest         |
| provider implementation digest | Exact trusted adapter used for execution and recovery       | compiled execution plan |

A script id is stable across versions. The pipeline MUST name an exact semantic version and MUST NOT use `latest`, a
range, tag, or fallback. A published `(id, version)` is immutable. Any change to its manifest, schemas, observable
result, stable error mapping, effect behavior, or handler implementation requires a new version: breaking contract
changes increment major, backward-compatible additive changes increment minor, and compatible corrections increment
patch. A future package release MAY contain multiple versions of one script simultaneously after a source-retention
and export design is accepted. The current implementation keeps one exact version in a flat operation directory such
as `src/scripts/git/status/`; folder names are not version identities. Removing or replacing a published version
requires an audit proving that no supported pipeline, compiled execution plan, active execution, or recoverable run
pins it.

A provider contract uses a major-only ref such as `revo.provider.git/v1`. A script depends on that protocol, not an
adapter. A breaking bounded-client change creates `v2`; `v1` and `v2` MAY coexist during migration. A provider adapter
has no separate public SemVer in v1. The execution plan records its exact implementation digest and package provenance.
Changing an adapter without changing the observable script contract does not require a script version bump, but new
plans pin the new adapter digest and recoverable old plans require their exact pinned adapter to remain available.

### Handler context

```ts
type ScriptContext<R extends ScriptResourceMap> = {
  executionId: string;
  attempt: number;
  idempotencyKey?: string;
  resources: R;
  signal: AbortSignal;
  emit: (event: ScriptCustomEvent) => Promise<void>;
};

type ScriptResourceHandle<TClients extends object> = {
  name: string;
  kind: 'repository';
  access: 'read' | 'write' | 'publish' | 'admin';
  grant: {
    permissions: readonly string[];
    effects: readonly ScriptEffect[];
  };
  clients: TClients;
};

type ScriptResourceMap = Readonly<Record<string, ScriptResourceHandle<object>>>;
```

The facade runtime MUST construct the context and prepared resource handles after validating the exact definition,
input, host bindings, manifest maximums, and grants. Handler input MUST NOT provide context fields. A handler MUST
receive only the clients permitted by the manifest, plan grant, resource binding, credential requirements, and provider
module intersection.

Handlers MUST NOT receive a raw workspace path, unrestricted shell, process environment, token resolver, generic
network client, database client, global mutable logger, host resolver, or orchestration service. A provider module MUST
expose only bounded domain clients. Resolved paths and credentials are private provider closure state and MUST NOT be
readable properties of a returned client.

The definition's resource-map generic MUST give each handler a statically typed resource name and client set. The
registry MAY erase that generic internally only after definition validation. A built-in handler MUST NOT cast an
unknown client into a stronger port.

The runtime MUST pass TypeScript-readonly input and context views. Runtime `Object.freeze` is not part of the contract;
the trusted handler MUST NOT mutate either view. A handler is a stateless class instance, MUST execute one bounded
operation through `execute`, and MUST return domain data. It MUST NOT keep execution state in instance fields, start
its own retry loop, or invoke another registered script.

### Results and failures

```ts
type ScriptHandlerResult<O> = {
  value: O;
  evidence?: readonly ScriptEvidence[];
};

type ScriptExecutionResult<O> =
  | {
      ok: true;
      value: O;
      evidence: readonly ScriptEvidence[];
      attempts: number;
    }
  | {
      ok: false;
      error: ScriptFailure;
      attempts: number;
    };

type ScriptFailure = {
  code: ScriptErrorCode;
  message: string;
  retryable: boolean;
  details?: Readonly<Record<string, unknown>>;
};

type ScriptEvidence = {
  kind: 'artifact' | 'log' | 'external';
  ref: string;
  summary?: string;
};

type ScriptErrorCode =
  | `revo.script.validation.${string}`
  | `revo.script.permission.${string}`
  | `revo.script.timeout.${string}`
  | `revo.script.execution.${string}`
  | `revo.script.provider.${string}`
  | `revo.script.idempotency.${string}`;

declare class ScriptFault extends Error {
  readonly code: ScriptErrorCode;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}
```

The public executor MUST return the discriminated execution result and MUST NOT leak an unknown thrown value across
the package boundary. A handler MAY throw a package-defined typed fault. The executor owns conversion of typed and
unknown thrown values to the public failure. `ScriptHandlerResult<O>` is success-only; a handler MUST NOT return a
failure-shaped value.

Error codes MUST be stable lowercase namespaced identifiers in these families:

- `revo.script.validation.*`
- `revo.script.permission.*`
- `revo.script.timeout.*`
- `revo.script.execution.*`
- `revo.script.provider.*`
- `revo.script.idempotency.*`

The initial runtime MUST define at least these exact codes:

| Code                                          | Meaning                                                                   | Retryable    |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------------ |
| `revo.script.validation.manifest`             | Manifest or policy coherence is invalid.                                  | No           |
| `revo.script.validation.input`                | Input does not satisfy the declared schema.                               | No           |
| `revo.script.validation.result`               | Handler output does not satisfy the declared schema.                      | No           |
| `revo.script.validation.event`                | A custom event is not JSON-compatible.                                    | No           |
| `revo.script.validation.payload_limit`        | A bounded payload limit was exceeded.                                     | No           |
| `revo.script.permission.resource`             | A prepared resource does not satisfy the manifest grant.                  | No           |
| `revo.script.permission.effect`               | A prepared effect grant does not satisfy the manifest.                    | No           |
| `revo.script.permission.event`                | A custom event name or detail path is undeclared.                         | No           |
| `revo.script.permission.grant`                | A required operation permission is absent from the prepared grant.        | No           |
| `revo.script.timeout.deadline`                | The total wall-clock deadline expired.                                    | No           |
| `revo.script.execution.definition_missing`    | Registry lookup found no exact definition.                                | No           |
| `revo.script.execution.digest_mismatch`       | Exact lookup found a different definition digest.                         | No           |
| `revo.script.execution.event_sink`            | The injected event sink rejected an event.                                | No           |
| `revo.script.execution.registry_not_sealed`   | Execution was requested before registry sealing.                          | No           |
| `revo.script.execution.blocked`               | Safe continuation requires operator or newer external state.              | No           |
| `revo.script.execution.unexpected`            | An untyped handler or runtime failure occurred.                           | No           |
| `revo.script.provider.unavailable`            | A bounded provider capability is unavailable.                             | No           |
| `revo.script.provider.client_conflict`        | Selected providers contributed the same client key to one resource.       | No           |
| `revo.script.provider.credential_unavailable` | A pinned credential alias cannot be resolved.                             | Per manifest |
| `revo.script.provider.transient`              | A provider reported an explicitly retry-safe transient failure.           | Per manifest |
| `revo.script.idempotency.key_required`        | A write requires an absent idempotency key.                               | No           |
| `revo.script.idempotency.conflict`            | Observed external state conflicts with the operation key or precondition. | No           |

Provider text and stack traces are evidence, not codes. They MUST be redacted and bounded before inclusion in a public
failure or event.

A handler-provided `retryable` value is advisory. It MUST NOT make a code retryable when the error table or manifest
forbids retry.

Input and result JSON payloads MUST be no larger than 1 MiB each when UTF-8 encoded. One event MUST be no larger than
64 KiB. Evidence MUST contain no more than 64 items. Each evidence ref MUST be no longer than 2,048 Unicode code
points, and each evidence summary MUST be no longer than 4,096 Unicode code points.

### Events and redaction

```ts
type ScriptCustomEvent = {
  name: string;
  details?: Readonly<Record<string, unknown>>;
};

type ScriptLifecycleEvent = {
  name:
    'revo.script.started' | 'revo.script.retrying' | 'revo.script.succeeded' | 'revo.script.failed';
  details: Readonly<Record<string, unknown>>;
};

type EventSink = {
  emit(event: ScriptLifecycleEvent | ScriptCustomEvent): Promise<void>;
};
```

The runtime MUST emit `revo.script.started`, `revo.script.retrying`, `revo.script.succeeded`, and
`revo.script.failed` through an injected `EventSink` when those lifecycle transitions occur. Lifecycle payloads MUST
contain script identity, execution identity, attempt, timing, and redacted bounded details only.

A preflight failure during registry resolution, input validation, resource validation, or idempotency validation MUST
emit one failed event without a preceding started event. Once preflight succeeds, the runtime MUST emit exactly one
started event, zero or more retrying events, and exactly one succeeded or failed event in that order. These ordering
requirements apply while the sink accepts events.

A handler MAY emit only event names declared by `manifest.events.allowed`. Custom details MUST contain only paths
allowed by `manifest.events.detailPaths`. Empty objects and arrays are leaves at their own JSON Pointer path.
Undeclared names, detail paths, or non-JSON values MUST fail before reaching the sink.
Custom event names MUST be namespaced and MUST NOT use the reserved `revo.script.*` lifecycle namespace.

An undeclared custom event fails the active attempt with `revo.script.permission.event`. A rejected `EventSink.emit`
fails execution with `revo.script.execution.event_sink`; the runtime MUST NOT retry the handler because an external
effect may already have occurred. When the sink itself rejects, the runtime returns the structured failure without
attempting to report that failure through the same rejected sink.

Redaction MUST occur before data reaches an event sink, failure detail, evidence summary, or diagnostic artifact.
Redaction paths and event detail paths use RFC 6901 JSON Pointer. Invalid pointers MUST fail definition validation.

The typed `value: O` returned to the trusted caller MUST remain schema-valid and MUST NOT be mutated into an
incompatible placeholder. Input and result redaction paths apply only when the runtime creates a serialized projection;
the initial runtime creates no such projection and never places input or result values in events. Error and event paths
are enforced now. Script result schemas and handlers MUST NOT treat secrets or provider tokens as domain output. The
runtime contract suite MUST fail when a fixture secret remains visible in any applicable declared public projection.

### Registry

```ts
declare const registeredScriptBrand: unique symbol;

interface RegisteredScript<I, O, R extends ScriptResourceMap> {
  readonly manifest: ScriptManifestV1;
  readonly definitionDigest: `sha256:${string}`;
  readonly implementation: Readonly<{ id: string; version: string }>;
  readonly [registeredScriptBrand]: {
    readonly input: I;
    readonly output: O;
    readonly resources: R;
  };
}

interface ScriptRegistry {
  register<I, O, R extends ScriptResourceMap>(
    definition: ScriptDefinition<I, O, R>,
  ): RegisteredScript<I, O, R>;
  seal(): void;
  resolve(id: string, version: string): RegisteredScript<unknown, unknown, ScriptResourceMap>;
  getExact(
    id: string,
    version: string,
    digest: `sha256:${string}`,
  ): RegisteredScript<unknown, unknown, ScriptResourceMap>;
  listManifests(): readonly ScriptManifestV1[];
}
```

Registration MUST be explicit. Directory scanning, package discovery, import-time side-effect registration, version
ranges, and implicit latest-version selection are forbidden.

Registration MUST reject every duplicate `(id, version)` entry, including a byte-identical re-registration. A sealed
registry MUST reject further registration. Lookup order and listing MUST be deterministic regardless of registration
order. Exact lookup MUST fail closed on an absent or mismatched digest.

A registered-script handle is opaque and belongs to the registry that created it. The registry keeps the executable
definition private and uses the handle only to recover that exact definition. A handle from another registry or a
handle whose identity no longer resolves MUST fail before a handler runs.

Each registry MUST track a private runtime token for every returned handle; matching public identity and digest fields
do not make a foreign handle valid. The unique-symbol brand in the public type is phantom type information and does not
require a public runtime property.

`resolve` and `getExact` MUST throw a typed `ScriptFault` for missing identity or digest mismatch. When the same lookup
fails inside `executeScript`, the executor MUST return the corresponding structured execution failure. Resolution and
execution MUST require a sealed registry.

The package MAY provide a function that registers its built-ins into a caller-owned registry. It MUST NOT create a
process-global mutable registry.

### Execution

The high-level facade MUST perform this provider-neutral sequence for every execution request:

1. validate and bound the execution identity;
2. resolve the exact sealed definition by id, version, and digest;
3. validate and bound input before resolving privileged host state;
4. require exact resource and credential binding names;
5. intersect manifest maximums with resource access, permission grants, effect grants, and credential provider ids;
6. resolve every provider pin exactly and verify that its contract satisfies the manifest requirement;
7. validate bounded provider coordinates through the pinned modules' closed schemas;
8. resolve only the workspace allocations and credential aliases required by that intersection;
9. construct each bounded client from its pinned provider implementation and attach it only to the resource named by
   the provider requirement;
10. call the low-level executor with immutable input, resource handles, and no privileged host service;
11. dispose credential leases and provider clients in `finally` paths;
12. return the validated typed result or structured failure.

No facade, provider registry, or binding resolver may compare a concrete script id. Provider selection uses declared
contract requirements during generic plan compilation and exact provider pins during execution. Definition selection
uses the exact sealed registry. The facade MUST NOT resolve a workspace or credential for invalid input, denied access,
an absent definition, a missing provider pin, or a digest mismatch.

Provider construction, handler execution, custom event emission, result validation, retry backoff, and provider
disposal share the one total wall-clock deadline. Provider construction failures use the stable provider or permission
error families and MUST NOT leak a path, secret, ambient account, raw command, or response body.

The low-level execution contract is:

```ts
type ExecuteScriptRequest<R extends ScriptResourceMap> = {
  executionId: string;
  input: unknown;
  resources: R;
  idempotencyKey?: string;
  eventSink: EventSink;
  clock?: ScriptClock;
  signal?: AbortSignal;
};

type ScriptClock = {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
};

declare function executeScript<I, O, R extends ScriptResourceMap>(
  registry: ScriptRegistry,
  script: RegisteredScript<I, O, R>,
  request: ExecuteScriptRequest<R>,
): Promise<ScriptExecutionResult<O>>;
```

`ScriptClock` is a bounded test seam for timestamps and retry backoff. The runtime provides a real default. A caller MAY
provide a deterministic clock; a handler MUST NOT receive it or control its own retry timing. The hard deadline uses a
platform timer independently of `ScriptClock`, so an injected clock cannot disable the safety bound.

`executionId` MUST be a non-empty string no longer than 256 Unicode code points. A valid raw execution id is its
lifecycle event projection. An invalid id is replaced with `[INVALID_EXECUTION_ID]` in its preflight failure event so
the invalid value cannot bypass event bounds. An idempotency key MUST be a non-empty string no longer than 1,024 Unicode
code points and MUST NOT be copied into an event, failure, or provider marker without applying the operation's
fingerprint contract.

`executeScript` MUST perform the same generic steps for every already-prepared definition:

1. validate and bound the execution identity;
2. require a sealed registry and resolve the registered handle to its exact private definition;
3. validate and bound input;
4. verify the prepared resource grant against the manifest;
5. derive or require idempotency context according to the manifest;
6. emit the started event;
7. execute with one total wall-clock deadline and an abort signal;
8. retry only typed transient failures permitted by the manifest;
9. validate and bound the handler result;
10. preserve the validated typed result and redact declared event/diagnostic projections, failures, evidence, and
    events;
11. emit succeeded or failed;
12. return the typed execution result.

Generic execution MUST NOT branch on a concrete script id, provider, or host identity. A timeout MUST abort the active
attempt and return a timeout-family failure. Exhausted transient retries MUST preserve the last stable failure code and
record the total attempt count.

When the executor stops before a permitted retry because the remaining deadline cannot accommodate the next backoff,
it MUST return `revo.script.timeout.deadline` and record the total attempts already executed.

The total wall-clock timeout includes identity and input validation, registry resolution, all attempts, backoff, result
validation, custom events, and lifecycle event emission. A never-settling `EventSink` MUST NOT outlive the deadline.

The runtime does not persist results or events. A result MUST contain only the schema-declared domain payload. It MUST
NOT contain a run id, node id, ordinal, attempt id, workspace id, execution-plan hash, artifact id, or output
provenance.

A host MAY persist the validated domain output through its own adapter. A durable host MAY wrap it in one generic
`ArtifactEnvelope` whose schema identity and digest come from the compiled plan and whose `OutputProvenance` comes from
durable execution context. That envelope is not a script result and is not defined by this package. The wrapping MUST
NOT compare a concrete script id or duplicate provenance inside the domain payload. Any event or diagnostic projection
persisted by a host MUST use the runtime-redacted projection.

### Trusted modules and deferred custom-script contract

The runtime accepts explicitly imported trusted definition modules for internal composition and contract testing. V1
does not define a stable external custom-script distribution, compatibility, or trust contract.

The host owns installation trust. It MUST explicitly import definition and provider modules during startup composition.
The package MUST NOT download code, evaluate source text, resolve module paths from manifests, hot-load packages, or
read mutable configuration to discover executable definitions.

A future custom-script contract may reuse an installed provider family's bounded contract, but it requires a separate
accepted design. A custom effect family still requires an explicit provider contract and trusted implementation. A
provider module is trusted executable host infrastructure, not pipeline data. Its contract requirement appears in the
manifest; its exact id, implementation digest, and package provenance appear only in the compiled execution plan.

### Public entrypoints

The target entrypoints are:

| Entrypoint                                | Contract                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `@revisium/revo-scripts`                  | Consumer facade, built-in module factories, and small curated stable API. |
| `@revisium/revo-scripts/spec`             | Manifest, schema, definition, result, and error contracts.                |
| `@revisium/revo-scripts/runtime`          | Definition, registry, validation, redaction, events, and execution.       |
| `@revisium/revo-scripts/host`             | Privileged host/provider integration contracts.                           |
| `@revisium/revo-scripts/approval`         | Approval-subject definition and domain result types.                      |
| `@revisium/revo-scripts/git`              | Built-in Git definitions and domain result types.                         |
| `@revisium/revo-scripts/github`           | Built-in GitHub definitions and domain result types.                      |
| `@revisium/revo-scripts/providers/git`    | Bounded Git contract and trusted provider-family factory.                 |
| `@revisium/revo-scripts/providers/github` | Bounded GitHub contract and trusted provider-family factory.              |
| `@revisium/revo-scripts/testing`          | Contract harness, fixtures, recording sinks, clocks, and fake providers.  |

Only implemented entrypoints MAY appear in `package.json`. The GitHub entrypoint MUST NOT be published as an empty
placeholder. Filesystem layout alone MUST NOT make a module public. Deep imports around the export map are unsupported.

The root entrypoint exports `createRevoScripts`, `approvalScripts`, `builtInScripts`, `gitScripts`, `githubScripts`, and the four primary
low-level runtime functions as a curated convenience API. Provider factories remain on explicit `/providers/*` subpaths so script and
provider ownership are not mixed. The root MUST NOT re-export faults, individual domain definitions, testing
mechanics, privileged resolved bindings, or every internal module. Production script entrypoints MUST NOT export
process execution, raw credentials, resolved workspace paths, or unrestricted provider clients. The privileged `/host`
entrypoint is for trusted integration code and MUST NOT be imported by a handler.

Root facade function signatures MAY reference privileged `/host` types so TypeScript can check startup composition,
but the root MUST NOT export those types as named values or convenience aliases. Consumers that implement or annotate
host/provider integrations import the types explicitly from `/host`; package export validation proves script-domain
entrypoints do not expose them.

### Dependency direction

The internal dependency graph MUST remain acyclic and follow this direction:

```text
runtime/spec <- runtime/definition
runtime/spec <- runtime/registry
runtime/spec + runtime/registry + runtime/validation <- runtime/execution
runtime/definition + runtime/registry + runtime/execution <- runtime/index
runtime/spec <- host
runtime/spec <- providers/*/contracts
runtime/spec + host + providers/*/contracts <- providers/*/adapters
runtime/spec + runtime/definition + providers/*/contracts <- scripts/*
runtime + host + providers/*/adapters + scripts/* <- application
runtime + application + providers + scripts <- testing
```

`runtime/spec` and neutral `runtime/validation` primitives MUST NOT import another package area. Runtime definition
construction MUST NOT import registry or execution. Registry MAY import only portable spec contracts. Execution MAY
import registry, spec, and neutral validation primitives; it MUST NOT import definition construction, host, providers,
scripts, or application code. `runtime/index.ts` is a curated public entrypoint and MUST NOT own implementation. Host contracts MUST NOT
import provider implementations. Provider contract directories MAY import only
portable spec types; they are handler-safe and MUST NOT export adapter construction or host-resolution types. Adapters
implement the trusted provider-module SPI from `host`, import their own bounded contract, and MUST NOT import
concrete scripts. Scripts MAY import their category's bounded provider contracts but MUST NOT import adapters, `/host`,
process, credential, or workspace-resolution modules. Git and GitHub scripts MUST NOT import one another. The
application layer behind the consumer facade is the composition root. Production code MUST NOT import testing.
Consumers MUST use public subpaths rather than internal files.

### Built-in operation contracts

Every built-in has one exact `1.0.0` identity, a closed input schema, a closed result schema, one operation-specific
permission, and only the provider client required for that operation. The current inventory is:

| Script                                  | Effect class | Result schema                            | Required fence                                                                      |
| --------------------------------------- | ------------ | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `script:approval/subject`               | `pure`       | `schema:approvalSubject/v1`              | closed provider-neutral input                                                       |
| `script:git/status`                     | `read`       | `schema:workspaceChange/v1`              | immutable commit and tree captures                                                  |
| `script:git/commit`                     | `write`      | `schema:gitChange/v1`                    | exact parent, tree, and operation marker                                            |
| `script:git/push`                       | `publish`    | `schema:gitChange/v1`                    | ancestry proof and exact remote-head CAS lease                                      |
| `script:github/pull-request/upsert`     | `publish`    | `schema:githubPullRequest/v1`            | head/draft fence and metadata reconciliation                                        |
| `script:github/pull-request/mark-ready` | `publish`    | `schema:githubPullRequest/v1`            | exact pull-request head                                                             |
| `script:github/pull-request/readiness`  | `read`       | `schema:githubReadiness/v1`              | exact pull-request head                                                             |
| `script:github/review-threads/respond`  | `publish`    | `schema:githubReviewThreadsRespond/v1`   | selected PR/head and canonical reply marker/readback                                |
| `script:github/review-threads/resolve`  | `publish`    | `schema:githubReviewThreadsResolve/v1`   | response proof and exact resolution readback                                        |
| `script:github/pull-request/merge`      | `publish`    | `schema:githubPullRequestMergeResult/v1` | approval/readiness equality, exact-head squash, and source-branch deletion readback |

The review-thread response operation accepts closed triage and selects only ordered `fix` and `wontfix` items;
`question` items have no GitHub effect. It appends exactly this terminal marker, derived inside the trusted Fetch
adapter rather than supplied by the caller:

```text
<!-- revo-thread-reply:v1 key=sha256:<operation-key> pr=<number> head=<git-commit> thread=sha256:<thread-id> body=sha256:<reply-body> -->
```

Every digest is lowercase SHA-256 over UTF-8 bytes, and reply body normalization is CRLF-to-LF followed by trimming.
Before every write and after it, the adapter verifies the bound repository, open pull request, exact head, selected
thread, one marker, normalized-body digest, and pinned credential actor. Resolution consumes the response result and
requires the exact reply id, marker, and fingerprint to remain visible before reporting `resolved` or
`already-resolved`. Both operations are bounded to 100 unique threads, keep input order in output, and expose no reply
body, actor identity, credential alias, or raw provider payload.

### Orchestrator traceability matrix

This package replaces the bounded effect portions of the orchestrator milestone contract; pipeline decisions,
artifacts, and human gates remain host-owned. The proof column is the primary executable contract.

| Replaced orchestrator behavior | Package operation                       | Contract owner                             | Primary proof                                                                                                             |
| ------------------------------ | --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Workspace status capture       | `script:git/status`                     | Git status script and Node Git adapter     | `test/contract/git/status.test.ts`, `test/integration/providers/node-git-provider.test.ts`                                |
| Exact local commit             | `script:git/commit`                     | Git commit script and Node Git adapter     | `test/contract/git/commit.test.ts`, `test/integration/providers/node-git-mutations.test.ts`                               |
| Exact branch publication       | `script:git/push`                       | Git push script and Node Git adapter       | `test/contract/git/push.test.ts`, `test/integration/providers/node-git-mutations.test.ts`                                 |
| Pull-request create/update     | `script:github/pull-request/upsert`     | GitHub upsert script and Fetch adapter     | `test/contract/github/pull-request-upsert.test.ts`, `test/integration/providers/fetch-github-pull-request-upsert.test.ts` |
| Draft-to-ready transition      | `script:github/pull-request/mark-ready` | GitHub ready script and Fetch adapter      | `test/contract/github/pull-request-mark-ready.test.ts`                                                                    |
| Read-only PR readiness         | `script:github/pull-request/readiness`  | GitHub readiness script and Fetch adapter  | `test/contract/github/pull-request-readiness.test.ts`                                                                     |
| Review reply                   | `script:github/review-threads/respond`  | Review response script and Fetch adapter   | `test/contract/github/review-thread-respond.test.ts`                                                                      |
| Review-thread resolution       | `script:github/review-threads/resolve`  | Review resolution script and Fetch adapter | `test/contract/github/review-thread-resolve.test.ts`                                                                      |
| Exact-head merge               | `script:github/pull-request/merge`      | GitHub merge script and Fetch adapter      | `test/contract/github/pull-request-merge.test.ts`                                                                         |
| Gate subject normalization     | `script:approval/subject`               | Approval subject script                    | `test/contract/approval/subject.test.ts`                                                                                  |

`script:git/status` has closed input, permission `git.status.read`, one read-only repository resource,
`revo.provider.git/v1`, effect `git.read`, a 5,000 ms wall-clock timeout, no retry, and read-only idempotency. Its exact
result is:

```ts
type GitStatusResultV1 = {
  schemaVersion: 'workspace-change/v1';
  baseCapture: `git-commit:${string}`;
  headCapture: `git-tree:${string}`;
  changedPaths: readonly {
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  }[];
  clean: boolean;
};
```

Commit and tree object ids MUST be lowercase hexadecimal with 40 or 64 characters. Each path MUST contain between one
and 4,096 characters; the array MUST contain at most 2,048 items and be sorted by path. `clean` is true exactly when
the array is empty. The provider MUST capture `headCapture` through a temporary Git index and MUST NOT mutate the real
index. The result MUST NOT contain raw Git output, a workspace path, a credential, or execution provenance.

Git commit input includes bounded author name, email, and ISO-8601 timestamp. The provider MUST apply the same explicit
identity to author and committer fields so recreating an unreferenced commit after a crash produces the same object id;
mutable repository identity or wall-clock time MUST NOT affect it. Git mutation results use `git-change/v1` and
preserve repository identity, remote identity, branch, base commit, exact head commit, and a bounded commit list.
GitHub pull-request results preserve repository id, `pullRequestId`, number, URL, exact
head/base, state, draft state, and optional merge commit. The dedicated merge result is
`github-pull-request-merge-result/v1`: it contains PR identity, approved and merged exact source heads, optional merge
commit, fixed `squash` method, `merged` or `already-merged` status, confirmed source-branch deletion, optional issue
reference, and only the redacted bounded override identity and audit fingerprint. Its closed input requires the PR artifact,
approval subject, active gate resolution, and post-gate readiness artifact. Subject URI/revision, PR identity,
repository identity, head, and readiness time ordering MUST agree. Normal approval requires `clean`; an override
requires sorted unique audit thread ids equal to the current unresolved non-outdated set, plus matching actor and head.
Closed/draft/live-unmergeable state, incomplete evidence, required-check blockers, and moved or unverifiable source
heads are non-bypassable. The provider validates current PR metadata, exact GitHub `closingIssuesReferences` for
`issueAction: close`, or the canonical non-closing `Refs` token for `issueAction: refs`, requests one
exact-head REST squash merge, deletes only the exact source ref, and reads back both the merged head and deleted source
branch. An exact already-merged head is adopted without a duplicate merge; source-branch deletion reconciliation
remains inside the bounded provider client. The operation never repairs PR metadata or marks a draft ready. Readiness
returns explicit bounded blockers. Review-thread operations return only the pinned thread receipt. Exact JSON examples
are normative documentation in the root README and are validated by the corresponding contract suites.

Required-check identity is the union of matching branch-protection contexts and GitHub's credential-scoped rules
evaluated for the exact base branch, including repository and organization rulesets. The adapter MUST preserve
`complete`, `unavailable`, and `truncated` identity evidence; only a complete empty union denotes zero configured
checks. Overlapping contexts are deduplicated by exact name before classification.

Provider adapters MUST construct operation-specific clients from declared permissions and access. They MUST NOT select
behavior by concrete script id. Missing access MUST fail before workspace or credential resolution. Mutation retries
are allowed only with a host-derived idempotency key and provider-owned reconciliation that prevents duplicate effects.
The public contract kit derives every required-write scenario from registered manifests. Each scenario MUST model a
successful effect whose first host result is lost, then assert one provider mutation and the typed adopted result of a
same-key execution.

## Validation

The required proof is defined in [Testing](../testing.md). `pnpm verify` MUST include focused runtime tests, script
contract tests, provider contract tests, architecture checks, public type tests, coverage, build, declaration and
export validation, package content validation, and a pack dry-run before the runtime is declared shipped.

Consumer compatibility proof MUST demonstrate that two arbitrary scripts in the same provider family execute through
one facade path without a concrete-id branch or per-operation host capability. Provider proof MUST demonstrate that
invalid input or grants resolve no privileged host binding, handlers cannot observe resolved paths or credentials,
real Git status/commit/push proofs need no consumer-provided Git implementation, and GitHub provider tests exercise
the same facade with a transport double at the package-owned Fetch boundary.

The package MUST remain unpublished until its runtime entrypoints and every exported built-in pass the full local
gates, hosted CI, static analysis, and review. Publishing requires a separate human approval.

## Compatibility

The package is pre-release and currently has no runtime compatibility commitment. Once a definition version is
published, changing its manifest, schemas, observable result, error mapping, effects, or handler behavior requires a
new script version.

Adding a new definition is compatible. Removing a definition version or provider implementation is compatible only
after a pin audit proves that no supported pipeline, execution plan, active execution, or recoverable run requires it.
The registries provide no alias, version range, implicit latest, fallback implementation, or deep-import compatibility
path. New-plan provider defaults never participate in execution or recovery lookup.

## Future Work

- Multi-version source retention and external pin-audit workflow.
- Stable external custom-script distribution and trust contract.
- Live GitHub provider compatibility workflow in a dedicated test repository.
- Direct orchestrator cutover to the package-owned contracts without compatibility fallbacks.
- Consumer compatibility workflow against retained package versions.
