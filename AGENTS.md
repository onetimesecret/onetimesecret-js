# AGENTS.md

Guidance for coding agents (and humans) working in this repository.

## What this is

`@onetimesecret/sdk`: the official TypeScript/JavaScript client for the
Onetime Secret API v2. Single package, zero runtime dependencies, ESM + CJS.
It belongs to a family of SDKs (`onetimesecret-py`, `onetimesecret-rust`,
`onetimesecret-ruby`, ...) that follow the same API and the same release
model, but it is written as an idiomatic TypeScript library, not a port of the
Ruby one.

## Commands

```sh
pnpm install
pnpm check        # lint + typecheck + test + build + publint/attw — run before finishing
pnpm test:watch
pnpm sync-spec && pnpm generate   # refresh the API contract and generated types
```

## Rules

- `src/generated/v2.ts` is generated. Never edit it; change `spec/` or the
  generator and run `pnpm generate`.
- The response shape is the API's. Do not rename or coerce response fields.
  Request params are camelCase and mapped to snake_case in `src/resources/`.
- No runtime dependencies. No `Buffer`, `node:` imports or other
  Node-only APIs in `src/` — the package runs in browsers, Deno, Bun and
  Workers. Node-only code is fine in `test/`, `scripts/` and `examples/`.
- Writes (POST/PATCH) are never retried.
- Every thrown error extends `OnetimeError`. New server `error_type` values go
  in `ERROR_TYPE_MAP` in `src/errors.ts` with a test.
- Tests do not touch the network by default. Use `mockFetch` from
  `test/helpers.ts`. `ONETIME_LIVE=1 pnpm exec vitest run test/live.test.ts`
  runs the opt-in live suite against production guest endpoints.
- Add a `CHANGELOG.md` line under `## [Unreleased]` for user-visible changes.
- Formatting and linting are Biome (`pnpm lint:fix`). TypeScript is strict
  with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and
  `isolatedDeclarations`; exported functions need explicit return types.
- Releases are tag-driven; do not bump versions in feature PRs. See
  `docs/releasing.md`.

## Where things are decided

- `docs/api-contract.md`: how the SDK tracks the API and known gaps between
  the published spec and the server.
- `docs/releasing.md`: setup and procedure for publishing.
