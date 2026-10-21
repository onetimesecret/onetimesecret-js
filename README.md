# Onetime Secret — TypeScript / JavaScript SDK

[![npm](https://img.shields.io/npm/v/%40onetimesecret%2Fsdk)](https://www.npmjs.com/package/@onetimesecret/sdk)
[![CI](https://github.com/onetimesecret/onetimesecret-js/actions/workflows/ci.yml/badge.svg)](https://github.com/onetimesecret/onetimesecret-js/actions/workflows/ci.yml)

The official client for the [Onetime Secret](https://onetimesecret.com) API.
Share sensitive information through a link that can only be viewed once.

The package is **`@onetimesecret/sdk`**. This repository, **`onetimesecret-js`**,
is the JavaScript member of the Onetime Secret SDK family — each language has
its own repository, and the repository name is not the package name.

- **Zero runtime dependencies.** Built on the platform's `fetch`, so it runs on
  Node.js 22+, Deno, Bun, Cloudflare Workers and browsers without polyfills.
- **TypeScript first.** Response types are generated from the
  [published OpenAPI definition](https://api.onetimesecret.com) and shipped with
  the package; JavaScript users get the same types through their editor.
- **ESM and CommonJS.** One package, both module systems, verified by
  [publint](https://publint.dev) and
  [Are the types wrong?](https://arethetypeswrong.github.io).
- **API v2.** The current stable API. v1 is frozen and not supported by this
  SDK; v3 is a preview and will be added when it stabilises.

## Installation

```sh
npm install @onetimesecret/sdk
# or: pnpm add @onetimesecret/sdk · yarn add @onetimesecret/sdk · bun add @onetimesecret/sdk
```

## Quick start

```ts
import { OnetimeSecret } from "@onetimesecret/sdk";

const client = new OnetimeSecret({
  baseUrl: "https://eu.onetimesecret.com", // your region's API host (required)
  customer: "ur1abc23defghijklmnop",       // customer extid, see Authentication
  apiToken: process.env.ONETIME_API_TOKEN,  // API token from your account
});

// Conceal a secret you already have
const { record } = await client.secrets.conceal({
  secret: "hunter2",
  ttl: 3600,
  passphrase: "pw12",
});
record.secret.identifier;   // the secret key — goes in the link for the recipient
record.receipt.identifier;  // the receipt key — keep this one
client.shareUrl(record.secret.identifier); // "https://eu.onetimesecret.com/secret/..."

// Have the server generate a random value instead. The server discloses the
// value only once, on the first read of the receipt, so the SDK claims it for you.
const generated = await client.secrets.generate({ ttl: 86_400, length: 32 });
generated.value;       // the generated password
generated.claimError;  // set, instead of throwing, if the claim request failed

// Reveal (consume) a secret — one time only
const revealed = await client.secrets.reveal(record.secret.identifier, { passphrase: "pw12" });
revealed.record.secret_value;

// Check on, or destroy, a secret you created
await client.receipts.get(record.receipt.identifier);
await client.receipts.burn(record.receipt.identifier);

// Service status
await client.status();
```

`reveal`, `get` and the receipt methods accept either a bare identifier or the
full link a user was given, so values can be passed straight through.

### Authentication

Authentication is HTTP Basic: the **customer extid** is the username and your
**API token** is the password.

The customer extid is a short, opaque identifier that begins with `ur`, for
example `ur1abc23def`. It is shown on the API settings page of your account.
The format is checked at construction so a value of the wrong kind fails
immediately rather than at the first request:

```ts
new OnetimeSecret({ baseUrl, customer: "acct-123", apiToken });
// ConfigurationError: customer "acct-123" is not a customer extid: extids begin with "ur" ...
```

Both values may also come from the environment: `ONETIME_CUSTOMER_EXTID` and
`ONETIME_API_TOKEN`. A client with neither is anonymous and can use the public
and guest endpoints.

### Base URL (required)

`baseUrl` must be the API host for your region, your self-hosted deployment,
or your custom domain. There is no default: deployments are region-isolated for
data sovereignty, so the client cannot guess one for you. It also reads
`ONETIME_BASE_URL`.

| Region | Host |
|---|---|
| United States | `https://us.onetimesecret.com` |
| Europe | `https://eu.onetimesecret.com` |
| United Kingdom | `https://uk.onetimesecret.com` |
| Canada | `https://ca.onetimesecret.com` |
| Aotearoa New Zealand | `https://nz.onetimesecret.com` |

The hosts are exported as `REGIONAL_HOSTS`. The apex `onetimesecret.com` is
the company website, not an API host, and is rejected with a pointer to the
regional hosts.

### Options

| Option | Default | Notes |
|---|---|---|
| `baseUrl` | `ONETIME_BASE_URL` | **Required.** Regional, self-hosted or custom domain |
| `customer` | `ONETIME_CUSTOMER_EXTID` | Customer extid (`ur…`) |
| `apiToken` | `ONETIME_API_TOKEN` | API token |
| `timeoutMs` | `30_000` | Per-request timeout |
| `maxRetries` | `2` | Retries for idempotent (GET) requests on 429, 5xx and network errors |
| `fetch` | `globalThis.fetch` | Inject a `fetch` for proxies, instrumentation or tests |
| `defaultHeaders` | `{}` | Sent with every request |
| `userAgentSuffix` | — | Appended to `onetimesecret-js/<version>` |

Every method also takes a final options argument with `signal` (an
`AbortSignal`), `timeoutMs` and `headers` for that request only. Secret and
receipt methods additionally accept `guest: true` to use the `/guest/`
endpoints, which never require an account.

Clients hold only configuration and a stateless transport; one instance can be
shared across an application.

### Runtimes

The SDK runs wherever `fetch` is available. On Deno, the environment-variable
fallbacks need env access: the constructor reads `ONETIME_BASE_URL`,
`ONETIME_CUSTOMER_EXTID` and `ONETIME_API_TOKEN` for every option you do not
pass explicitly, and Deno throws `NotCapable` on a denied read instead of
treating the variable as unset. Run with
`--allow-env=ONETIME_BASE_URL,ONETIME_CUSTOMER_EXTID,ONETIME_API_TOKEN` (or a
blanket `--allow-env`). An anonymous client still reads the two credential
variables, so it needs the permission too.

## Resources

### `client.secrets`

| Method | Endpoint |
|---|---|
| `conceal(params, options?)` | `POST /secret/conceal` |
| `generate(params?, options?)` | `POST /secret/generate`, then `GET /receipt/{id}` to claim the value |
| `get(identifier, options?)` | `GET /secret/{id}` |
| `reveal(identifier, params?, options?)` | `POST /secret/{id}/reveal` |
| `status(identifier, options?)` | `GET /secret/{id}/status` |
| `statuses(identifiers, options?)` | `POST /secret/status` |

`generate` returns a `GenerateResult`: the create response plus `value`. The
value is never in the create response; the server discloses it exactly once,
on the first read of the receipt and only shortly after creation, so the
method reads the receipt immediately with the same auth and guest routing. If
that read fails the secret still exists, so nothing is thrown: `value` is
`undefined` and the error is in `claimError`. Pass `claimValue: false` to skip
the read and claim the value yourself with `receipts.get` (first read only).

### `client.receipts`

| Method | Endpoint |
|---|---|
| `get(identifier, options?)` | `GET /receipt/{id}` |
| `list(options?)` | `GET /receipt/recent` |
| `burn(identifier, params?, options?)` | `POST /receipt/{id}/burn` |
| `update(identifier, params, options?)` | `PATCH /receipt/{id}` |

### Meta

`client.status()`, `client.version()`, `client.supportedLocales()`.

`client.shareUrl(secretIdentifier, { shareDomain? })` and
`client.receiptUrl(receiptIdentifier)` build the web links for identifiers,
since create responses return identifiers rather than URLs.

### Anything else

`client.request({ method, path, body })` sends an arbitrary request with the
client's configuration — auth, timeout, retries and error mapping — and
returns `{ data, response, requestId }`. Use it for endpoints this version of
the SDK does not wrap yet.

## Responses

Methods return the API's JSON body, typed from the OpenAPI definition. The
shape is the server's, unchanged: the SDK does not rename or reconcile fields,
so the [API reference](https://api.onetimesecret.com/doc/api-v2.md) is the
documentation for what comes back.

```ts
import type { ConcealResponse, Receipt, Secret } from "@onetimesecret/sdk";
```

## Errors

Every error thrown by the SDK extends `OnetimeError`. API errors follow the
server's ADR-013 contract — `{ error, error_type, ... }` — and are mapped onto
a class hierarchy so both `instanceof` and `errorType` work:

```ts
import { NotFoundError, RateLimitError, APIError } from "@onetimesecret/sdk";

try {
  await client.secrets.reveal("missing");
} catch (err) {
  if (err instanceof NotFoundError) {
    err.message;    // user-facing message ("error" field)
    err.errorType;  // machine-readable type ("RecordNotFound")
    err.status;     // 404
    err.requestId;  // quote this when reporting a problem
  } else if (err instanceof RateLimitError) {
    err.retryAfter; // seconds
  } else if (err instanceof APIError) {
    // any other API error
  } else {
    throw err;
  }
}
```

| Class | When |
|---|---|
| `BadRequestError` | 400 / 422, or `FormError` (see `field`) |
| `AuthenticationError` | 401 |
| `AccountRequiredError` | the operation needs an account (`requires_account`); extends `AuthenticationError` |
| `ForbiddenError` | 403, `Forbidden`, `GuestRoutesDisabled` (see `code`) |
| `EntitlementError` | `EntitlementRequired` (see `entitlement`); extends `ForbiddenError` |
| `NotFoundError` | 404 / `RecordNotFound` |
| `ConflictError` | 409 |
| `RateLimitError` | 429 / `LimitExceeded` (see `retryAfter`) |
| `ServerError` | 5xx |
| `TransportError`, `TimeoutError`, `AbortError` | network failure, timeout, caller abort |
| `ConfigurationError` | bad `baseUrl`, malformed `customer`, incomplete credentials (thrown by the constructor) |

`AccountRequiredError` exists because the server reports "this needs an
account" inside a 400 form-error body. Mapping that to `BadRequestError` sent
people auditing a request payload that was never the problem.

## Development

```sh
pnpm install
pnpm check          # lint, typecheck, test, build, package checks
pnpm sync-spec      # refresh spec/openapi.v2.json from api.onetimesecret.com
pnpm generate       # regenerate src/generated/v2.ts from the spec
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [docs/releasing.md](docs/releasing.md)
and [docs/api-contract.md](docs/api-contract.md) for how the SDK tracks the API.

### Example

[`examples/basic.ts`](examples/basic.ts) runs the whole flow against a real
server: conceal a secret, read its receipt, reveal it, and confirm the receipt
state changed. It reads the same environment variables as the client.

```sh
ONETIME_BASE_URL=https://eu.onetimesecret.com node examples/basic.ts
```

Add `ONETIME_CUSTOMER_EXTID` and `ONETIME_API_TOKEN` to run as your account;
without them the script is anonymous and uses the guest endpoints. Node 22.18+
runs the TypeScript directly (earlier 22.x: `node --experimental-strip-types`).

## License

[MIT](LICENSE).
