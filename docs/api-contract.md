# How the SDK tracks the API

The main application, [onetimesecret/onetimesecret](https://github.com/onetimesecret/onetimesecret),
is the source of truth for the API's shape. Its Zod v4 schemas
(`src/schemas/`) are turned into JSON Schema with `z.toJSONSchema()`, assembled
into an OpenAPI 3.1 document per API version by `scripts/openapi/`, and
published through Bump.sh at <https://api.onetimesecret.com>.

This SDK consumes the end of that pipeline, not the start:

```
Zod v4 schemas ──► JSON Schema ──► OpenAPI 3.1 ──► api.onetimesecret.com/doc/api-v2.json
   (main repo)      (main repo)      (main repo)                 │
                                                                 ▼
                                             spec/openapi.v2.json (vendored copy)
                                                                 │  pnpm generate
                                                                 ▼
                                             src/generated/v2.ts (openapi-typescript)
                                                                 │  hand-written
                                                                 ▼
                                             src/types.ts, src/resources/*  (public API)
```

## Why the published spec and not the Zod source

Three options were considered:

1. **Depend on the Zod schemas directly** — publish them from the main repo as
   a package and import them here for runtime validation.
   Rejected: it makes `zod` a runtime dependency of every SDK consumer, couples
   SDK releases to the main repo's internal schema layout (contracts, shapes,
   transforms built for the Vue frontend), and the schemas carry
   frontend-specific preprocessing that doesn't belong in a client.
2. **Share generated JSON Schema files** via a git submodule or a package.
   Rejected for now: it's a second distribution channel for the same artefact
   that is already published, and submodules are a maintenance tax.
3. **Consume the published OpenAPI definition.** Chosen. The spec is the
   public contract; anyone can regenerate the types from it; the SDK has zero
   runtime dependencies; and the main repo's pipeline is exercised by a real
   consumer, which is the best test of a generator.

The vendored copy is committed (rather than fetched at build time) so a spec
change shows up as a reviewable diff and builds are reproducible offline.

## Keeping in sync

- `pnpm sync-spec` fetches the published definition into `spec/openapi.v2.json`.
  `--check` exits non-zero if it differs, for scripts and local use; CI does
  not run it, so a spec change never breaks an unrelated pull request.
- `pnpm generate` regenerates `src/generated/v2.ts`. CI fails if the committed
  output is stale.
- `.github/workflows/spec-drift.yml` runs on weekdays, and opens a pull request
  with the regenerated types when the published spec has moved. If the
  typecheck fails on that PR, the change is breaking for the SDK.

## Known gaps between spec and server

Things the spec says that the SDK deliberately deviates from, with the reason.
Each is a candidate fix in the main repo's schemas; when one is fixed upstream,
remove the workaround here.

| Spec says | Server does | SDK does | Upstream fix |
|---|---|---|---|
| `secret.share_domain` is **required** on conceal/generate | Accepts omission and uses the default domain; the field is required only because the web UI always sends it | Sends it only when `shareDomain` is given; the request type is widened locally in `src/resources/secrets.ts` | Mark `share_domain` optional in the v2 request schema |
| `continue` is a `string` on reveal/burn | Accepts `true` or `"true"` | Sends `"true"` / `"false"` to match the spec | Consider `boolean` (or `z.coerce.boolean()`) in the request schema |
| Error bodies document `error`, `error_type`, `message`, `field`, `error_id`, `request_id` only | ADR-013 class-specific fields also appear: `code`, `error_key`, `retry_after`, `attempts`, `max_attempts`, `entitlement`, `current_plan`, `upgrade_to` | Exposes them on `APIError` | Describe the ADR-013 body as a shared `components.schemas.Error` with the class-specific fields |
| Response schemas are inlined per operation (no `components.schemas`) | — | Public types are aliases into `operations[...]` | Register named schemas so consumers get stable, documented type names (`Receipt`, `Secret`) and the generated file shrinks |
| `GET /api/v2/version` has `security: []` (public) | Production answers **401** to anonymous callers (observed 2026-10-21 on eu) | `client.version()` throws `AuthenticationError` without credentials; the live test accepts either | Either make the route public or mark it `basicAuth` in the spec |
| Burn responses return the updated receipt | The `record` in the burn response still says `state: "new"` (`details.title` is "Secret burned"); a follow-up `GET /receipt/{id}` shows `burned` | Nothing; callers should re-fetch the receipt if they need the post-burn state. The live test does | Serialize the record after the state change |

## What would make the coordination better

Suggestions for the main repo, in rough order of value to SDK authors:

1. **Named components.** Emitting `components.schemas` for the shared records
   (receipt, secret, error) would give every SDK the same type names and cut
   the generated TypeScript by an order of magnitude.
2. **Request schemas that describe the server, not the UI.** Where the frontend
   schema is stricter than the server (`share_domain`), either loosen the
   schema used for the spec or add a server-facing variant.
3. **A spec version bump policy.** `info.version` is a date; documenting which
   changes bump it (and tagging breaking ones in the Bump.sh changelog) lets
   the drift workflow label PRs as breaking or not.
4. **A contract test in the main repo** that installs the published SDK and
   runs its request shapes against a dev server. This catches regressions on
   the producing side before they reach a spec release. The SDK's `test/`
   suite uses an injected `fetch` and recorded responses, so it can run
   anywhere; `examples/basic.ts` with `ONETIME_BASE_URL` pointed at a dev
   server is the natural seed.
5. **Publish the spec with a stable permalink per version**, so a given SDK
   release can cite exactly which contract it was generated from.
