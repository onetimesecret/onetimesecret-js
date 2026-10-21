# Contributing

Thanks for helping with the Onetime Secret JavaScript SDK. This is a small
library with a deliberately narrow job: a correct, well-typed, dependency-free
client for the public API.

## Setup

Node 22+ and pnpm. The repo pins the pnpm version in `package.json`, so
`corepack enable` (or any pnpm ≥ 10) will do.

```sh
pnpm install
pnpm check      # everything CI runs: lint, typecheck, test, build, publint, attw
pnpm test:watch
```

## Project layout

```
spec/openapi.v2.json   vendored copy of the published API definition (pnpm sync-spec)
src/generated/v2.ts    types generated from it (pnpm generate) — never edit by hand
src/types.ts           public types: response aliases + hand-written request params
src/config.ts          options, validation, environment fallbacks
src/http.ts            fetch transport: auth, timeouts, retries, error mapping
src/errors.ts          error hierarchy (ADR-013)
src/resources/         one class per API resource
src/client.ts          the OnetimeSecret class
test/                  vitest, with an injected fetch double (test/helpers.ts)
examples/              runnable scripts against a real server
docs/                  releasing.md, api-contract.md
```

## Principles

- **The response shape is the API's.** Don't rename, flatten or coerce fields
  on the way out. Request parameters are camelCase and mapped to the wire
  format inside the resource; that is the only translation layer.
- **No runtime dependencies.** If something seems to need one, it probably
  belongs in the caller's code or in the platform.
- **Types come from the spec.** If a response type is wrong, the fix is in the
  main repo's schemas (see `docs/api-contract.md`), not a hand edit here.
  Document deliberate deviations in that file.
- **Writes are never retried.** Only idempotent requests retry.
- **Errors are typed.** New server `error_type` values get a mapping in
  `src/errors.ts` and a test.

## Making a change

1. Branch from `main`.
2. Add or update tests. The default suite doesn't hit the network; use
   `mockFetch` from `test/helpers.ts`. `test/live.test.ts` runs against a
   real server with `ONETIME_LIVE=1` (guest endpoints only, EU by default;
   `ONETIME_BASE_URL` overrides) and runs daily in CI.
3. Add a line under `## [Unreleased]` in `CHANGELOG.md` describing the change
   from the user's point of view.
4. `pnpm check` must pass. Biome formats on `pnpm lint:fix`.
5. Open a pull request. CI runs on Node 22/24/26 plus Bun and Deno smoke tests.

## Updating to a new API definition

```sh
pnpm sync-spec   # fetch the published spec
pnpm generate    # regenerate src/generated/v2.ts
pnpm typecheck   # see what moved
```

A scheduled workflow does this automatically and opens a PR. Review the
generated diff for fields worth exposing and update `docs/api-contract.md`
if a known gap was fixed upstream.

## Releasing

Maintainers: see [docs/releasing.md](docs/releasing.md).
