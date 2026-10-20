# Security

## Reporting a vulnerability

Please do not open a public issue for security problems. Email
**security@onetimesecret.com** with a description, steps to reproduce and the
affected version. You should hear back within two business days.

Problems in the API itself (as opposed to this client) are covered by the
[Onetime Secret security policy](https://onetimesecret.com/security).

## Scope

This library is an HTTP client. It never stores secrets, tokens or responses;
it holds only the configuration you give it for the lifetime of the client
object. Things that would be in scope:

- Credentials leaking into logs, errors or URLs.
- Requests going to a host other than the configured `baseUrl`.
- Unsafe handling of server responses (prototype pollution, etc.).
- Supply-chain issues in the published package.

## Supply chain

- The package has **no runtime dependencies**.
- Releases are published from GitHub Actions through npm trusted publishing
  with [provenance attestations](https://docs.npmjs.com/generating-provenance-statements);
  no publish token exists. Verify a download with `npm audit signatures`.
- Dev dependencies are updated by Dependabot and reviewed like any other change.

## Supported versions

Only the latest minor release receives fixes. Below 1.0, upgrade to the latest
version to get them.
