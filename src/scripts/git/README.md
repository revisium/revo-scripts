# Git scripts

This category contains bounded Git operations. Each operation owns its manifest, schemas, result types, handler, composition root, tests, and README card.

Git scripts may depend on runtime spec/definition and handler-safe Git contracts. They must not import the Node adapter, raw process execution, workspace paths, host resolvers, or application composition.

Current operations:

- [`status`](./status/README.md) — one read-only repository status snapshot.

New operations use [the script card](../../../docs/authoring/script-readme.template.md). A new script version remains a manifest identity (`id` + exact SemVer + digest); the repository does not create physical version directories until a proven multi-version retention design is accepted.
