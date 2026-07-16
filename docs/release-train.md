# revo-scripts Release Train

This package is intended for npm publication as `@revisium/revo-scripts`.
Release automation uses the shared workflows from
[`revisium/revisium-actions`](https://github.com/revisium/revisium-actions).
Do not replace them with repository-local version or publish scripts.

## Release principles

- Publish only after explicit approval.
- Run a dry release-train transition before its write-mode equivalent.
- Do not publish from a local machine or directly from `master`.
- Do not create release branches or tags manually.
- Pin reusable workflows to an approved immutable commit.
- Verify the packed artifact and a clean consumer before publication.
- Never reuse or overwrite a published npm version.
- Keep every published `(script id, revision)` immutable. Observable script
  changes require a larger integer revision and a new npm package release.

## Versioning

The npm package uses SemVer independently from script revisions:

- before `1.0.0`, use a minor release for public API or behavior changes and a
  patch release for compatible fixes and internal hardening;
- use `alpha` or `rc` prereleases for consumer validation;
- after `1.0.0`, use normal SemVer compatibility rules.

Script versions remain positive integer revisions. They never accept SemVer
ranges, npm tags, or package versions.

## Required workflows

- `.github/workflows/ci.yml` verifies pull requests, `master`, and
  `release/**` branches.
- `.github/workflows/release-train.yml` delegates version, release-branch, and
  tag transitions to `revisium-actions`.
- `.github/workflows/npm-publish.yml` publishes an exact `vX.Y.Z`,
  `vX.Y.Z-alpha.N`, or `vX.Y.Z-rc.N` tag through `revisium-actions`.

Reusable workflows must use an immutable approved ref rather than a floating
branch. Update the shared-workflow pin intentionally in a separate maintenance
change.

## Release readiness

- [ ] `corepack pnpm verify` passes.
- [ ] `corepack pnpm pack --pack-destination <temporary-directory>` contains
      only the expected files.
- [ ] `npm pack --dry-run --json` reports the expected package metadata.
- [ ] `npm publish --dry-run --tag alpha` succeeds without publishing.
- [ ] Package exports and declarations match the documented public API.
- [ ] README examples and per-script/provider cards match tested behavior.
- [ ] Published integer script revisions remain byte-stable.
- [ ] Release and publish workflows use the approved `revisium-actions` pin.
- [ ] Required repository variables and secrets are configured.

## GitHub configuration

Write-mode release trains require:

- repository variable `RELEASE_BOT_CLIENT_ID`;
- repository secret `RELEASE_BOT_PRIVATE_KEY`.

Token-authenticated npm publication requires repository secret `NPM_TOKEN`.
The publish job also grants `id-token: write` so npm provenance can be emitted.

## Publish flow

1. Run `Release Train` with the required transition and `dry_run: true`.
2. Review the computed branch, version, tag, and npm channel.
3. After explicit approval, rerun the same transition with `dry_run: false`.
4. The shared workflow writes the package version, publishes the release branch,
   and creates the tag.
5. The tag triggers `Publish Package to npmjs`.
6. Wait for the publish workflow, then verify the exact version and dist-tag on
   npm.
7. Install the published package into a clean consumer and execute a minimal
   public-facade smoke test.

The release train requires an existing stable `vX.Y.Z` tag. Initial stable-tag
creation is an explicit repository administration action outside these package
workflows. After that baseline exists, `start-minor-alpha` from `master`
produces the next minor `alpha.0` release.
