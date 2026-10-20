# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Below 1.0, minor versions may
include breaking changes; they are called out explicitly.

## [Unreleased]

## [0.1.0] - 2026-10-20

### Added

- Initial release of `@onetimesecret/sdk`, the official TypeScript/JavaScript
  client for API v2.
- `OnetimeSecret` client with `secrets` (conceal, generate, get, reveal,
  status, statuses) and `receipts` (get, list, burn, update) resources, plus
  `status()`, `version()` and `supportedLocales()`.
- Typed errors following the ADR-013 wire contract (`error` / `error_type`),
  mapped onto an `instanceof`-friendly hierarchy.
- Retries with backoff for idempotent requests, per-request timeouts and
  `AbortSignal` support.
- Response types generated from the published OpenAPI definition.

[Unreleased]: https://github.com/onetimesecret/onetime-js/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/onetimesecret/onetime-js/releases/tag/v0.1.0
