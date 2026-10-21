// Live, real-API integration tests. Opt-in: skipped unless ONETIME_LIVE=1, so the
// default `pnpm test` never touches the network.
//
//   ONETIME_LIVE=1 pnpm test test/live.test.ts
//
// Configuration:
//   ONETIME_LIVE      -> set to 1 to enable
//   ONETIME_BASE_URL  -> target host (default: EU production)
//
// Only anonymous guest/public endpoints are exercised (no credentials). Created
// secrets use a short TTL and clearly-marked test content, and assertions check
// structure and round-trip behaviour rather than exact server-supplied values.
import { describe, expect, it } from "vitest";
import {
  APIError,
  AuthenticationError,
  NotFoundError,
  OnetimeSecret,
  type VersionResponse,
} from "../src/index.ts";

const live = process.env["ONETIME_LIVE"] === "1";
const baseUrl = process.env["ONETIME_BASE_URL"] ?? "https://eu.onetimesecret.com";
const TTL = 60;

const unique = (label: string) =>
  `onetimesecret-js live test ${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!live)("live API (guest endpoints)", () => {
  const client = new OnetimeSecret({ baseUrl, customer: undefined, apiToken: undefined });

  it("reports nominal status", async () => {
    const res = await client.status();
    expect(res.success).toBe(true);
    expect(res.status).toBe("nominal");
  });

  it("reports supported locales", async () => {
    const locales = await client.supportedLocales();
    expect(locales.success).toBe(true);
    expect(locales.locales.length).toBeGreaterThan(0);
  });

  it("reports a version (or requires authentication for it)", async () => {
    // The spec marks /version as public; production currently answers 401 to
    // anonymous callers. Accept either until that is reconciled upstream.
    const res = await client.version().catch((e: unknown) => e);
    if (res instanceof AuthenticationError) return;
    expect((res as VersionResponse).success).toBe(true);
    expect((res as VersionResponse).version).toBeDefined();
  });

  it("conceals and reveals a secret", async () => {
    const value = unique("conceal-reveal");
    const concealed = await client.secrets.conceal({ secret: value, ttl: TTL }, { guest: true });
    const key = concealed.record.secret.identifier;
    expect(key).toBeTruthy();
    expect(concealed.record.receipt.identifier).toBeTruthy();

    const revealed = await client.secrets.reveal(key, {}, { guest: true });
    expect(revealed.record.secret_value).toBe(value);
  });

  it("generates a secret with a receipt", async () => {
    const res = await client.secrets.generate({ ttl: TTL }, { guest: true });
    expect(res.record.receipt).toBeDefined();
    expect(res.record.secret).toBeDefined();
  });

  it("shows and burns a receipt", async () => {
    const concealed = await client.secrets.conceal(
      { secret: unique("receipt"), ttl: TTL },
      { guest: true },
    );
    const receiptKey = concealed.record.receipt.identifier;

    const shown = await client.receipts.get(receiptKey, { guest: true });
    expect(shown.record.identifier).toBe(receiptKey);

    const burned = await client.receipts.burn(receiptKey, {}, { guest: true });
    expect((burned.details as { title?: string } | undefined)?.title).toBe("Secret burned");
    // The burn response echoes the pre-burn record (state "new"); the stored
    // receipt is what matters. See docs/api-contract.md.
    const after = await client.receipts.get(receiptKey, { guest: true });
    expect(after.record.state).toBe("burned");
    expect(after.record.is_burned).toBe(true);
  });

  it("maps an unknown key onto the error hierarchy", async () => {
    const err = await client.secrets
      .reveal("doesnotexist000000000000000000000", {}, { guest: true })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(APIError);
    expect((err as APIError).status).toBeGreaterThanOrEqual(400);
    // Prefer the precise class when the service maps it that way.
    if ((err as APIError).status === 404) expect(err).toBeInstanceOf(NotFoundError);
  });
});
