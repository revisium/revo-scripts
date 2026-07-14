# Script runtime v1 specification

- **Status:** Draft
- **Version:** v1
- **Owners:** package SDK, runtime, registry, and built-in scripts
- **Related ADR:** [ADR-0001](../adr/0001-script-sdk-and-runtime-boundary.md)
- **Testing:** [Testing](../testing.md)

## Scope

This specification defines the proposed stable public SDK and runtime for one bounded Revo script: serializable manifests,
runtime schemas and definitions, explicit registration, execution context and result, errors, events, redaction,
payload bounds, extension trust, public entrypoints, and the first built-in operation.

It does not define pipeline routing, durable workflow state, human gates, workspace allocation, credential storage,
artifact persistence, provider authentication, or automatic plugin discovery.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, REQUIRED, and OPTIONAL are interpreted following RFC 2119 and
BCP 14 when, and only when, they appear in all capitals.

## Current Contract

The repository implements the initial root, `spec`, `runtime`, `git`, and `testing` entrypoints plus the read-only
`script:git/status` vertical proof. The npm package is not published. This Draft remains the target stable contract;
implemented behavior is available for review but has no published compatibility commitment.

## Target Contract

### Package responsibility

The package MUST define, validate, register, test, and execute one bounded script. It MAY ship independently versioned
built-ins that use the same public definition contract as custom scripts.

The package MUST NOT choose the next pipeline operation, mutate a pipeline cursor, create or resolve a human gate,
allocate or release a workspace, read mutable playbook state, or access DBOS, Prisma, or NestJS.

General-purpose Revo helpers MUST NOT be added. A utility belongs in the package only when it directly supports script
definition, validation, execution, a built-in operation, or contract testing.

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
namespaced. Resource names MUST be unique within one manifest. Duplicate permissions, resources, effects, event names,
or redaction paths MUST be rejected.

Script ids, schema ids, permission ids, event names, and implementation ids MUST be no longer than 256 Unicode code
points. Versions and resource names MUST be no longer than 128 Unicode code points. A summary MUST be no longer than
512 Unicode code points. A manifest MUST contain at most 16 resources, 64 permissions, 64 custom event names, and 128
redaction or detail paths; each path MUST be no longer than 512 Unicode code points. No extension point may accept an
unbounded string, collection, or arbitrary nested payload.

Effect-class coherence is fixed by this table:

| Effect class | Maximum resource access | Permitted effects                                                             |
| ------------ | ----------------------- | ----------------------------------------------------------------------------- |
| `pure`       | no resource             | none                                                                          |
| `read`       | `read`                  | `filesystem.read`, `git.read`, `github.read`                                  |
| `write`      | `write`                 | `filesystem.read`, `git.read`, `github.read`, `filesystem.write`, `git.write` |
| `publish`    | `publish`               | every `write` effect, `git.remote-write`, `github.write`                      |
| `admin`      | `admin`                 | every `publish` effect                                                        |

`admin` is distinguished by its resource access and operation permission rather than a generic provider effect. It is
REQUIRED for an irreversible administrative operation such as merging a pull request. The mutation-effect set is
exactly `filesystem.write`, `git.write`, `git.remote-write`, and `github.write`.

A permission id identifies one bounded operation authorization, such as `git.status.read` or
`github.pull-request.merge`. All permission ids declared by a manifest MUST be present in the prepared host grant.
Permissions do not imply an effect or resource access and cannot widen either. `defineScript` validates permission
syntax and uniqueness; a capability contract and its per-script contract tests own the mapping from invoked operations
to permission ids.

A `pure` manifest MUST have empty permissions. All other effect classes MAY declare operation permissions within their
resource and effect maximums. A non-`pure` manifest with any permission or effect MUST declare at least one resource.
The prepared host grant is the union of the immutable permission and effect grants on the resource handles supplied for
that execution.

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
  };
  definitionDigest: `sha256:${string}`;
};

type ScriptHandler<I, O, R extends ScriptResourceMap> = (
  input: Readonly<I>,
  context: Readonly<ScriptContext<R>>,
) => Promise<ScriptHandlerResult<O>>;
```

`ScriptSchema` MUST remain validation-library-neutral. The initial adapter SHOULD accept Standard Schema V1 validators
and Standard JSON Schema V1 converters. Built-ins MAY use Zod through that adapter; Zod types MUST NOT become required
members of the core definition contract.

JSON Schemas MUST target Draft 2020-12, carry the schema id declared by the manifest, describe JSON-compatible values,
and reject unknown object properties unless a schema explicitly models a bounded map. Runtime validation and emitted
JSON Schema MUST describe the same accepted values.

`defineScript` MUST validate the manifest, both schemas, policy coherence, and implementation identity. It MUST compute
the definition digest over RFC 8785 canonical JSON containing the manifest, both JSON Schemas, implementation id, and
implementation version. It MUST return an immutable definition.

Handler source and executable schema objects MUST NOT be serialized into a manifest, event, artifact, or definition
pin. Build-generated executable identity and historical build retention are future release-hardening concerns; the
initial vertical slice owns stable implementation identity and definition digest only.

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

type ScriptResourceHandle<TCapabilities extends object> = {
  name: string;
  kind: 'repository';
  access: 'read' | 'write' | 'publish' | 'admin';
  grant: {
    permissions: readonly string[];
    effects: readonly ScriptEffect[];
  };
  capabilities: TCapabilities;
};

type ScriptResourceMap = Readonly<Record<string, ScriptResourceHandle<object>>>;
```

The host MUST construct the context and prepared resource handles. Handler input MUST NOT provide context fields. A
handler MUST receive only the capabilities permitted by the manifest and host grant intersection.

Handlers MUST NOT receive a raw workspace path, unrestricted shell, process environment, token resolver, generic
network client, database client, global mutable logger, or orchestration service. A provider capability MUST expose
only bounded domain operations.

The definition's resource-map generic MUST give each handler a statically typed resource name and capability set. The
registry MAY erase that generic internally only after definition validation. A built-in handler MUST NOT cast an
unknown capability into a stronger port.

The runtime MUST pass immutable input and context views. A handler MUST execute one bounded operation and return domain
data. It MUST NOT start its own retry loop or invoke another registered script.

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

| Code                                        | Meaning                                                                   | Retryable    |
| ------------------------------------------- | ------------------------------------------------------------------------- | ------------ |
| `revo.script.validation.manifest`           | Manifest or policy coherence is invalid.                                  | No           |
| `revo.script.validation.input`              | Input does not satisfy the declared schema.                               | No           |
| `revo.script.validation.result`             | Handler output does not satisfy the declared schema.                      | No           |
| `revo.script.validation.event`              | A custom event is not JSON-compatible.                                    | No           |
| `revo.script.validation.payload_limit`      | A bounded payload limit was exceeded.                                     | No           |
| `revo.script.permission.resource`           | A prepared resource does not satisfy the manifest grant.                  | No           |
| `revo.script.permission.effect`             | A prepared effect grant does not satisfy the manifest.                    | No           |
| `revo.script.permission.event`              | A custom event name or detail path is undeclared.                         | No           |
| `revo.script.permission.grant`              | A required operation permission is absent from the prepared grant.        | No           |
| `revo.script.timeout.deadline`              | The total wall-clock deadline expired.                                    | No           |
| `revo.script.execution.definition_missing`  | Registry lookup found no exact definition.                                | No           |
| `revo.script.execution.digest_mismatch`     | Exact lookup found a different definition digest.                         | No           |
| `revo.script.execution.event_sink`          | The injected event sink rejected an event.                                | No           |
| `revo.script.execution.registry_not_sealed` | Execution was requested before registry sealing.                          | No           |
| `revo.script.execution.unexpected`          | An untyped handler or runtime failure occurred.                           | No           |
| `revo.script.provider.unavailable`          | A bounded provider capability is unavailable.                             | No           |
| `revo.script.provider.transient`            | A provider reported an explicitly retry-safe transient failure.           | Per manifest |
| `revo.script.idempotency.key_required`      | A write requires an absent idempotency key.                               | No           |
| `revo.script.idempotency.conflict`          | Observed external state conflicts with the operation key or precondition. | No           |

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

type RegisteredScript<I, O, R extends ScriptResourceMap> = {
  manifest: ScriptManifestV1;
  definitionDigest: `sha256:${string}`;
  implementation: { id: string; version: string };
  readonly [registeredScriptBrand]: {
    input: I;
    output: O;
    resources: R;
  };
};

type ScriptRegistry = {
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
};
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

`executeScript` MUST perform the same generic steps for every definition:

1. validate and bound the execution identity;
2. require a sealed registry and resolve the registered handle to its exact private definition;
3. validate and bound input;
4. verify the prepared resource grant against the manifest;
5. derive or require idempotency context according to the manifest;
6. emit the started event;
7. execute with one total wall-clock deadline and an abort signal;
8. retry only typed transient failures permitted by the manifest;
9. validate and bound the handler result;
10. preserve the validated typed result and redact its declared event/diagnostic projections, failures, evidence, and
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

The runtime does not persist results or events. A host MAY persist the validated domain output through its own adapter.
Any event or diagnostic projection persisted by a host MUST use the runtime-redacted projection.

### Custom scripts and trust

A consumer MAY define a script in its own repository or package. It MUST use the same manifest, schema, definition,
registry, execution, and contract-test APIs as a built-in.

The host owns installation trust. It MUST explicitly import and register definitions before sealing. The package MUST
NOT download code, evaluate source text, resolve module paths from manifests, hot-load packages, or read mutable
configuration to discover executable definitions.

### Public entrypoints

The target entrypoints are:

| Entrypoint                       | Contract                                                                    |
| -------------------------------- | --------------------------------------------------------------------------- |
| `@revisium/revo-scripts`         | Small curated stable API.                                                   |
| `@revisium/revo-scripts/spec`    | Manifest, schema, definition, result, and error contracts.                  |
| `@revisium/revo-scripts/runtime` | Definition, registry, validation, redaction, events, and execution.         |
| `@revisium/revo-scripts/git`     | Bounded Git capabilities and built-in Git definitions.                      |
| `@revisium/revo-scripts/github`  | Bounded GitHub capabilities and built-in GitHub definitions.                |
| `@revisium/revo-scripts/testing` | Contract harness, fixtures, recording sinks, clocks, and fake capabilities. |

Only implemented entrypoints MAY appear in `package.json`. The GitHub entrypoint MUST NOT be published as an empty
placeholder. Filesystem layout alone MUST NOT make a module public. Deep imports around the export map are unsupported.

The root entrypoint intentionally repeats the four primary runtime functions as a curated convenience API. It MUST NOT
re-export faults, domain built-ins, testing mechanics, or every internal module. Production entrypoints MUST NOT export
process execution, raw credentials, or unrestricted provider clients.

### Dependency direction

The internal dependency graph MUST remain acyclic and follow this direction:

```text
spec <- runtime
spec <- git
runtime <- git
spec <- github
runtime <- github
spec + runtime + git + github <- testing
```

`spec` MUST NOT import another package area. Runtime MUST NOT import Git or GitHub definitions. Git and GitHub MUST NOT
import each other. Production code MUST NOT import testing. Consumers MUST use public subpaths rather than internal
files.

### First built-in: Git status

The first built-in id is `script:git/status` at version `1.0.0`. It is a read-only operation over one prepared
repository resource and one bounded Git status capability.

Its manifest declares:

- effect class `read`;
- permission `git.status.read`;
- resource `repository` with read access;
- effect `git.read`;
- a 5,000 ms total wall-clock timeout;
- transient retry with at most three attempts and backoffs of 100 ms and 500 ms;
- read-only idempotency;
- no custom events and no redaction paths.

The input is a closed empty object. The prepared resource map contains exactly one repository resource named
`repository`. The exact result is:

```ts
type GitStatusResultV1 = {
  branch: string | null;
  headSha: string | null;
  detached: boolean;
  clean: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictedCount: number;
};
```

Each count MUST be a non-negative safe integer. The result MUST NOT contain file paths, raw command output, credentials,
or an unbounded collection.

The branch value MUST be no longer than 255 Unicode code points. A head SHA MUST be lowercase hexadecimal with exactly
40 or 64 characters. `clean` is true exactly when all four change counts are zero. `detached` is true exactly when
`branch` is null and `headSha` is non-null. An unborn repository has a null head, a non-null branch, and `detached`
false. A result with both branch and head null is invalid.

One renamed entry contributes one count in the side where Git reports the rename. An unmerged entry contributes one
`conflictedCount` and does not also increment staged or unstaged counts. The bounded Git capability owns this
normalization so fake and process-backed implementations expose the same result.

The operation MUST call the read-only status capability at most once per attempt. It MUST NOT receive a Git write or
remote-write capability. Missing access MUST fail before a provider call. Provider failures MUST map to the provider
error family. The operation MAY be retried only when the provider marks a failure transient and the manifest permits
it.

A process-backed Git adapter is outside the first vertical slice. The package contract is proven through a recording
bounded capability; a host MAY supply a conforming real adapter later.

## Validation

The required proof is defined in [Testing](../testing.md). `pnpm verify` MUST include focused runtime tests, script
contract tests, architecture checks, public type tests, coverage, build, declaration and export validation, package
content validation, and a pack dry-run before the runtime is declared shipped.

The first implementation MUST remain unpublished until the runtime entrypoints and Git status contract pass the full
local gates, hosted CI, static analysis, and review.

## Compatibility

The package is pre-release and currently has no runtime compatibility commitment. Once a definition version is
published, changing its manifest, schemas, observable result, error mapping, effects, or handler behavior requires a
new script version.

Adding a new definition is compatible. Removing a definition version is compatible only when no supported consumer
requires it. The registry provides no alias, version range, implicit latest, fallback implementation, or deep-import
compatibility path.

## Future Work

- Build-generated implementation identity and reproducible package digest.
- Mutation reconciliation harness and the first Git write operation.
- GitHub capabilities and bounded GitHub operations.
- Optional host adapter factories.
- Consumer compatibility workflow against retained package versions.
