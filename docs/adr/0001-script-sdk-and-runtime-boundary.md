# ADR-0001 - Script SDK and runtime boundary

- **Status:** Draft
- **Proposed:** 2026-07-14
- **Spec:** [Script runtime v1](../specs/script-runtime-v1.spec.md)

## Context

Revo needs independently versioned operations for Git, GitHub, and future bounded effects. Keeping their definitions
inside a host application couples operation releases to orchestration releases and gives external authors no stable
way to implement compatible scripts. A catalog alone would still leave every host to invent validation, registration,
execution, errors, events, and test conventions.

The package must remain usable without adopting Revo orchestration. It must also prevent extension from becoming
runtime discovery of untrusted code or an unrestricted utility surface.

## Decision

`@revisium/revo-scripts` will be the public SDK and runtime for one bounded script. It will own script contracts,
definition and validation, explicit registry mechanics, single-script execution policy, reusable contract testing,
and independently exported bounded built-in scripts.

Custom scripts will use the same contracts as built-ins. A host will explicitly install trusted definitions and seal
its registry before execution. The package will not discover modules, download code, or choose trusted scripts on the
host's behalf.

Orchestration, durable workflow state, workspace lifecycle, credentials, human gates, and artifact persistence remain
outside the package. The exact API and capability boundaries are defined in the linked specification.

## Alternatives Considered

- **Ship only a built-in script catalog.** Rejected because custom authors and hosts would duplicate the runtime and
  validation contract.
- **Ship only an SDK and keep built-ins in the host.** Rejected because bounded operations need their own release and
  verification cycle, independent from a consuming host.
- **Keep scripts internal to the orchestrator.** Rejected because it preserves release coupling and prevents reuse by
  other trusted hosts.
- **Support automatic plugin discovery.** Rejected because installation and trust policy belong to the host, and
  implicit loading weakens startup auditability.

## Consequences

- Built-ins and custom scripts share one versioned contract and test kit.
- Consumers can adopt the package without DBOS, Prisma, NestJS, or a Revo pipeline.
- The package accepts a public API and semantic-versioning burden earlier than a private runtime would.
- Hosts must provide bounded capabilities and explicitly manage which definitions are trusted.
- Provider adapters and orchestration integration require separate follow-up work.

## Open Questions

- Whether a future package should provide optional host adapter factories in addition to script definitions and ports.
- Whether exact historical executable retention belongs in a release companion package or remains a host concern.
