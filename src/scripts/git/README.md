# Git scripts

This category contains bounded Git operations. Each operation owns its manifest, schemas, result types, handler, composition root, tests, and README card.

Git scripts may depend on runtime spec/definition and handler-safe Git contracts. They must not import the Node adapter, raw process execution, workspace paths, host resolvers, or application composition.

Current operations:

- [`status`](./status/README.md) — one read-only immutable workspace capture.
- `commit` — one exact-parent, exact-tree local commit with replay reconciliation.
- `push` — one exact-head publication with ancestry proof and an atomic remote-base lease.

New operations use [the script card](../../../docs/authoring/script-readme.template.md). A script identity is its id plus
one exact positive integer revision. That pair is immutable, every observable change increments the revision, and no
range, `latest`, SemVer parser, or fallback is supported. The repository does not create physical revision directories
until a proven multi-revision retention design is accepted.
