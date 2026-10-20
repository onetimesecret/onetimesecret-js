# Releasing

This document covers the one-time setup for publishing `@onetimesecret/sdk`
and the procedure for each release. It mirrors
[onetime-ruby's releasing guide](https://github.com/onetimesecret/onetime-ruby/blob/main/docs/releasing.md)
so the SDK family shares one mental model: **the version lives in the repo,
a `v*` tag publishes it, and the registry trusts the workflow rather than a
stored token.**

## Package and repository names

- **`@onetimesecret/sdk`** is the npm package.
- **`onetime-js`** is the repository, following `onetime-ruby`. Repository
  names and package names do not need to match.
- The bare name `onetimesecret` on npm belongs to an unrelated 2022 package.
  The scoped name avoids the conflict and signals that the publisher is the
  organisation. (npm has a
  [dispute process](https://docs.npmjs.com/policies/disputes) for abandoned
  names if we ever want the bare one.)

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

### 3. Trusted publishing

On npmjs.com, open the package → Settings → Trusted Publisher → GitHub Actions:

| Field | Value |
|---|---|
| Organization or user | `onetimesecret` |
| Repository | `onetime-js` |
| Workflow filename | `release.yml` |
| Environment name | `npmjs.com` |

Then under Publishing access choose **Require two-factor authentication and
disallow tokens**. Trusted publishing keeps working because it uses OIDC
rather than tokens, and nobody can publish with a leaked token.

Requirements the workflow already satisfies: npm ≥ 11.5.1, Node ≥ 22.14,
GitHub-hosted runner, `id-token: write`. Provenance attestations are generated
automatically because both the repository and the package are public.

### 4. GitHub environment

Referencing an environment from a workflow creates it without protection, so
configure it in GitHub → Settings → Environments → `npmjs.com`:

- **Deployment branches and tags:** restrict to tags matching `v*`.
- **Required reviewers:** add one when a human release gate is wanted.

The environment name is compared as a plain string against the OIDC token
claim, so `release.yml`, the npm publisher record and the GitHub environment
must all say `npmjs.com`.

### 5. Repository settings

- Protect `main`: require the CI workflow to pass and require pull requests.
- Enable Dependabot (`.github/dependabot.yml` is already present).
- Give the `api-contract` label a colour; the spec-drift workflow applies it.

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

The tag runs `release.yml`, which checks the tag against `package.json`, runs
lint/typecheck/tests/build and the package checks, publishes to npm with
provenance, and creates a GitHub release whose notes are the changelog section
for that version.

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

## If a release goes wrong

- **Workflow failed before publishing:** fix on `main`, delete the tag locally
  and remotely (`git push origin :refs/tags/v0.2.0`), re-tag.
- **Published a broken version:** publish a fix as the next patch. Only use
  `npm unpublish` within the first 72 hours and only for something harmful
  (leaked credential, malicious dependency); `npm deprecate` is the right tool
  for everything else.

## Versioning

The SDK stays below 1.0 until the API surface has settled. Until then a minor
bump may contain breaking changes, which the changelog calls out explicitly. A
spec change that adds optional fields is a patch; one that removes or renames a
field the SDK exposes is breaking.
