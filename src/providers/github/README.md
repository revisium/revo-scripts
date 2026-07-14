# GitHub provider family

This family owns the handler-safe `revo.provider.github/v1` contracts, closed `{ owner, repository }` coordinates, and
trusted provider implementations used by GitHub scripts. It does not own manifests, result schemas, credentials,
pipeline routing, or human gates.

`fetchGitHubProviders()` installs the production Fetch adapter. The host resolves the manifest-declared `token`
credential; only the adapter sees its secret. Each execution receives one operation-specific client selected from the
manifest permission, never from a concrete script id.

Verification: `test/contract/github/`, `test/integration/providers/fetch-github-*.test.ts`, and `pnpm verify`.
