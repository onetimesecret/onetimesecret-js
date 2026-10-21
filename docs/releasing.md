# Releasing

How this SDK is set up for publishing and how a release is cut. The workflow
is the same shape across the Onetime Secret SDKs (`onetimesecret-py`,
`onetimesecret-rust`, `onetimesecret-ruby`): push a `vX.Y.Z` tag, CI verifies the
tag matches the package version, builds, publishes through the registry's
trusted-publishing (OIDC) flow, and creates the GitHub Release. No registry
token is stored anywhere.

## Names

| What | Value |
|---|---|
| Repository | `onetimesecret/onetimesecret-js` |
| Package (npm) | `@onetimesecret/sdk` |
| Import | `import { OnetimeSecret } from "@onetimesecret/sdk"` |
| Version source | `package.json` (mirrored into `src/version.ts`) |
| Workflow | `.github/workflows/release.yml` |
| GitHub environment | `npm` |

Repository and package names do not need to match; the other SDKs follow the
same pattern. The bare name `onetimesecret` on npm belongs to an unrelated
2022 package, so the package is scoped to the organisation. If that name is
ever transferred under npm's [dispute process](https://docs.npmjs.com/policies/disputes),
renaming is a one-line change to `package.json`'s `name`, the `url:` in
`release.yml`, and a release note; the scoped name can then stay as a
deprecated alias.

## Where the version lives

Three places must agree, and CI refuses to publish when they don't:

1. `package.json` → `version`
2. `src/version.ts` → `VERSION` (sent in the `User-Agent` header)
3. `CHANGELOG.md` → the latest `## [x.y.z] - YYYY-MM-DD` heading

`pnpm bump <version>` updates all three; `pnpm release:check` verifies them.

## One-time setup

### 1. npm organisation and scope

1. Create the `onetimesecret` organisation on npmjs.com (Settings → Organizations).
   This owns the `@onetimesecret` scope. Add the maintainers who should be
   able to administer the package; publishing itself happens from CI.
2. Enable two-factor authentication on every account in the organisation.

### 2. First publish (manual, once)

npm's trusted-publisher settings live on the package's settings page, so the
package has to exist before CI can publish it. Do the first release by hand
from a clean checkout of the release tag:

```sh
git checkout v0.1.0
pnpm install --frozen-lockfile
pnpm check                      # lint, typecheck, test, build, publint, attw
npm publish --access public     # prompts for 2FA; prepublishOnly rebuilds and re-checks
```

Verify with `npm view @onetimesecret/sdk` and `npm install @onetimesecret/sdk`
in a scratch directory (both `import` and `require` should work).

Pushing the `v0.1.0` tag also triggers `release.yml`; its `publish` job fails
until step 3 is done. That is expected: finish step 3, then re-run the failed
job (or leave it, since the version is already on npm) and the
`github-release` job creates the release.

### 3. Trusted publishing

On npmjs.com, open the package → Settings → Trusted Publisher → GitHub Actions:

| Field | Value |
|---|---|
| Organization or user | `onetimesecret` |
| Repository | `onetimesecret-js` |
| Workflow filename | `release.yml` |
| Environment name | `npm` |

Then under Publishing access choose **Require two-factor authentication and
disallow tokens**. Trusted publishing keeps working because it uses OIDC
rather than tokens, and nobody can publish with a leaked token.

Requirements the workflow already satisfies: npm ≥ 11.5.1, Node ≥ 22.14,
GitHub-hosted runner, `id-token: write`. Provenance attestations are generated
automatically because both the repository and the package are public.

### 4. GitHub environment

Referencing an environment from a workflow creates it without protection, so
configure it in GitHub → Settings → Environments → `npm`:

- **Deployment branches and tags:** restrict to tags matching `v*`.
- **Required reviewers:** add one when a human release gate is wanted. The
  `publish` job then pauses after `build` succeeds, which gives a last look
  at the packed tarball before anything is uploaded.

The environment name is compared as a plain string against the OIDC token
claim, so `release.yml`, the npm publisher record and the GitHub environment
must all say `npm`.

### 5. Repository settings

- **Settings → Actions → General → Workflow permissions**: *Read repository
  contents and packages permissions* is sufficient. Each job in
  `release.yml` requests what it needs (`id-token: write` to publish,
  `contents: write` to create the release). The spec-drift workflow needs
  **Allow GitHub Actions to create and approve pull requests** ticked.
- Protect `main` with a ruleset: require a pull request and the CI checks.
- Protect the `v*` tag pattern (Settings → Tags, or a ruleset) so only
  maintainers can push release tags.
- Enable Dependabot alerts and security updates. `.github/dependabot.yml`
  already keeps the pinned action SHAs and dev dependencies current.
- Create the `api-contract` label; the spec-drift workflow applies it.

## Cutting a release

1. Make sure `main` is green.
2. Write the release notes under `## [Unreleased]` in `CHANGELOG.md`. Breaking
   changes get their own `### Breaking` heading, even below 1.0.
3. Bump:

   ```sh
   pnpm bump 0.2.0
   ```

   This sets the version in `package.json` and `src/version.ts`, moves the
   Unreleased notes under a dated `0.2.0` heading, and refreshes the compare
   links at the bottom of the changelog.
4. Review the diff, commit, tag and push:

   ```sh
   git commit -am "Release 0.2.0"
   git tag -a v0.2.0 -m "@onetimesecret/sdk 0.2.0"
   git push origin main v0.2.0
   ```

Watch **Actions → Release**. The run:

- `build`: fails fast if the tag does not equal `package.json`'s version or
  the three version locations disagree; runs lint, typecheck, tests, build,
  publint and attw; packs the tarball and extracts the changelog section.
- `publish`: uploads that exact tarball to npm through trusted publishing,
  pausing for approval if reviewers are configured. Provenance is attached
  automatically.
- `github-release`: creates the GitHub Release `vX.Y.Z` with the changelog
  section as notes and the tarball attached. Idempotent; re-run it alone if
  it fails after publishing.

Prerelease tags (`v1.0.0-rc.1`) publish under the `next` dist-tag and are
marked as prereleases on GitHub, so `npm install @onetimesecret/sdk` keeps
resolving to the latest stable version.

Verify:

```sh
npm view @onetimesecret/sdk version
npm view @onetimesecret/sdk dist-tags
```

The npm package page should show the provenance badge linking back to the
workflow run.

## If the run fails

- **Tag/version mismatch or a failing check in `build`:** nothing was
  uploaded. Delete the tag (`git push --delete origin vX.Y.Z`), fix on
  `main`, re-tag.
- **Publish rejected by npm** (`E404`/`EOTP`/"unable to authenticate"): the
  trusted-publisher record does not match the workflow's claims. Re-check the
  four fields in step 3, especially the environment name, and that npm on the
  runner is ≥ 11.5.1. Nothing was uploaded; re-run the job.
- **Published but `github-release` failed:** npm versions are immutable, so
  the version is taken. Re-run the `github-release` job on its own; it is
  idempotent.
- **Published a broken version:** fix forward with a patch release. Use
  `npm deprecate` to warn installers; reserve `npm unpublish` (72-hour window)
  for something harmful such as a leaked credential.

## Adapting this for another SDK

Copy `release.yml` and this document, then change: the version-extraction
command, the package name and registry URL, and the publish command. Keep the
three-job split (build → publish → github-release), the tag/version check, the
environment gate, the changelog-section release notes and the SHA-pinned
actions.

## Versioning

The SDK stays below 1.0 until the API surface has settled. Until then a minor
bump may contain breaking changes, which the changelog calls out explicitly. A
spec change that adds optional fields is a patch; one that removes or renames a
field the SDK exposes is breaking.
