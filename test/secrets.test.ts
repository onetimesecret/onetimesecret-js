import { describe, expect, it } from "vitest";
import { ClaimError } from "../src/index.ts";
import { BASE_URL, expectBasicAuth, makeClient, mockFetch } from "./helpers.ts";

const concealResponse = {
  shrimp: "",
  record: {
    receipt: { identifier: "rcpt1", state: "new" },
    secret: { identifier: "sec1", key: "sec1", state: "new" },
    share_domain: null,
  },
  details: {},
};

// The first read of a generate receipt carries the value in `details`.
const claimedReceipt = {
  shrimp: "",
  record: { identifier: "rcpt1", state: "new" },
  details: { secret_value: "UEy}8cWR]FmJ", show_secret: true, can_decrypt: true },
};

describe("secrets", () => {
  it("conceals a secret with the nested wire shape", async () => {
    const { fetch, requests } = mockFetch({ body: concealResponse });
    const client = makeClient(fetch);

    const res = await client.secrets.conceal({
      secret: "hunter2",
      ttl: 3600,
      passphrase: "pw",
      recipient: "a@example.com",
      displayType: "markdown",
    });

    expect(res.record.receipt.identifier).toBe("rcpt1");
    const [req] = requests;
    expect(req?.method).toBe("POST");
    expect(req?.url).toBe(`${BASE_URL}/api/v2/secret/conceal`);
    expect(req?.headers.get("content-type")).toBe("application/json");
    expect(req?.headers.get("accept")).toBe("application/json");
    expect(req?.headers.get("user-agent")).toMatch(/^onetimesecret-js\/\d+\.\d+\.\d+/);
    expectBasicAuth(req?.headers ?? new Headers());
    expect(req?.body).toEqual({
      secret: {
        kind: "conceal",
        secret: "hunter2",
        ttl: 3600,
        passphrase: "pw",
        recipient: "a@example.com",
        display_type: "markdown",
      },
    });
  });

  it("omits undefined fields instead of sending null", async () => {
    const { fetch, requests } = mockFetch({ body: concealResponse });
    await makeClient(fetch).secrets.conceal({ secret: "x", shareDomain: undefined });
    expect(requests[0]?.body).toEqual({ secret: { kind: "conceal", secret: "x" } });
  });

  it("uses guest endpoints when asked", async () => {
    const { fetch, requests } = mockFetch({ body: concealResponse });
    const anon = makeClient(fetch, { customer: undefined, apiToken: undefined });
    await anon.secrets.conceal({ secret: "x" }, { guest: true });
    expect(requests[0]?.url).toBe(`${BASE_URL}/api/v2/guest/secret/conceal`);
    expect(requests[0]?.headers.has("authorization")).toBe(false);
  });

  it("generates a secret with character set options", async () => {
    const { fetch, requests } = mockFetch({ body: concealResponse }, { body: claimedReceipt });
    await makeClient(fetch).secrets.generate({
      length: 24,
      characterSets: { symbols: false, excludeAmbiguous: true },
      shareDomain: "secrets.example.com",
    });
    expect(requests[0]?.url).toBe(`${BASE_URL}/api/v2/secret/generate`);
    expect(requests[0]?.body).toEqual({
      secret: {
        kind: "generate",
        length: 24,
        share_domain: "secrets.example.com",
        character_sets: { symbols: false, exclude_ambiguous: true },
      },
    });
    expect(requests[0]?.body).not.toHaveProperty("secret.claim_value");
  });

  it("claims the generated value from the receipt right after creation", async () => {
    const { fetch, requests } = mockFetch({ body: concealResponse }, { body: claimedReceipt });
    const res = await makeClient(fetch).secrets.generate(
      { length: 12 },
      { headers: { "x-trace": "t1" } },
    );
    expect(res.value).toBe("UEy}8cWR]FmJ");
    expect(res.claimError).toBeUndefined();
    expect(res.record.receipt.identifier).toBe("rcpt1");
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `POST ${BASE_URL}/api/v2/secret/generate`,
      `GET ${BASE_URL}/api/v2/receipt/rcpt1`,
    ]);
    // The claim reuses the create call's options.
    expect(requests[1]?.headers.get("x-trace")).toBe("t1");
    expectBasicAuth(requests[1]?.headers ?? new Headers());
  });

  it("claims through the guest receipt route when the create call was guest", async () => {
    const { fetch, requests } = mockFetch({ body: concealResponse }, { body: claimedReceipt });
    const anon = makeClient(fetch, { customer: undefined, apiToken: undefined });
    const res = await anon.secrets.generate({}, { guest: true });
    expect(res.value).toBe("UEy}8cWR]FmJ");
    expect(requests[1]?.url).toBe(`${BASE_URL}/api/v2/guest/receipt/rcpt1`);
    expect(requests[1]?.headers.has("authorization")).toBe(false);
  });

  it("returns the create response with claimError when the receipt read fails", async () => {
    const { fetch, requests } = mockFetch(
      { body: concealResponse },
      { status: 500, body: { error: "boom", error_type: "InternalError" } },
    );
    const res = await makeClient(fetch, { maxRetries: 0 }).secrets.generate();
    expect(res.value).toBeUndefined();
    expect(res.claimError).toBeInstanceOf(ClaimError);
    expect(res.claimError).toMatchObject({
      errorClass: "ServerError",
      status: 500,
      errorType: "InternalError",
    });
    expect(res.claimError?.message).toBe(
      "Could not claim the generated value: ServerError 500 InternalError",
    );
    expect(res.record.secret.identifier).toBe("sec1");
    expect(requests).toHaveLength(2);
  });

  it("keeps a malformed receipt body out of claimError", async () => {
    const leaked = "UEy}8cWR]FmJ";
    const { fetch } = mockFetch(
      { body: concealResponse },
      // A 200 whose JSON is truncated: the parser's own message would quote it.
      { rawBody: `{"record":{"identifier":"rcpt1"},"details":{"secret_value":"${leaked}"` },
    );
    const res = await makeClient(fetch).secrets.generate();
    expect(res.value).toBeUndefined();
    expect(res.record.secret.identifier).toBe("sec1");
    const err = res.claimError;
    expect(err).toBeInstanceOf(ClaimError);
    expect(err).toMatchObject({ errorClass: "ResponseParseError", status: 200 });
    expect(err?.cause).toBeUndefined();
    const forms = [
      String(err),
      err?.stack ?? "",
      JSON.stringify(err),
      JSON.stringify(err, Object.getOwnPropertyNames(err ?? {})),
    ];
    for (const form of forms) {
      expect(form).not.toContain(leaked);
      expect(form).not.toContain("secret_value");
    }
  });

  it("leaves value undefined when the server withholds it", async () => {
    const withheld = {
      ...claimedReceipt,
      details: { ...claimedReceipt.details, secret_value: null },
    };
    const { fetch } = mockFetch({ body: concealResponse }, { body: withheld });
    const res = await makeClient(fetch).secrets.generate();
    expect(res.value).toBeUndefined();
    expect(res.claimError).toBeUndefined();
  });

  it("skips the claim when claimValue is false", async () => {
    const { fetch, requests } = mockFetch({ body: concealResponse });
    const res = await makeClient(fetch).secrets.generate({ claimValue: false });
    expect(requests).toHaveLength(1);
    expect(res.value).toBeUndefined();
    expect(res.claimError).toBeUndefined();
  });

  it("reveals by identifier or by link, confirming by default", async () => {
    const secret = { shrimp: "", record: { identifier: "sec1", secret_value: "hunter2" } };
    const { fetch, requests } = mockFetch({ body: secret });
    const client = makeClient(fetch);

    const res = await client.secrets.reveal(`${BASE_URL}/secret/sec1`, { passphrase: "pw" });
    expect(res.record.secret_value).toBe("hunter2");
    expect(requests[0]?.url).toBe(`${BASE_URL}/api/v2/secret/sec1/reveal`);
    expect(requests[0]?.body).toEqual({ passphrase: "pw", continue: "true" });

    await client.secrets.reveal("sec1", { continue: false }, { guest: true });
    expect(requests[1]?.url).toBe(`${BASE_URL}/api/v2/guest/secret/sec1/reveal`);
    expect(requests[1]?.body).toEqual({ continue: "false" });
  });

  it("gets, checks status, and lists statuses", async () => {
    const { fetch, requests } = mockFetch({ body: { shrimp: "", record: { state: "new" } } });
    const client = makeClient(fetch);

    await client.secrets.get("sec1");
    await client.secrets.status(`${BASE_URL}/secret/sec1`);
    await client.secrets.statuses(["sec1", `${BASE_URL}/secret/sec2`]);

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `GET ${BASE_URL}/api/v2/secret/sec1`,
      `GET ${BASE_URL}/api/v2/secret/sec1/status`,
      `POST ${BASE_URL}/api/v2/secret/status`,
    ]);
    expect(requests[2]?.body).toEqual({ identifiers: ["sec1", "sec2"] });
    expect(requests[0]?.body).toBeUndefined();
  });

  it("forwards per-request headers", async () => {
    const { fetch, requests } = mockFetch({ body: concealResponse });
    await makeClient(fetch).secrets.conceal({ secret: "x" }, { headers: { "x-trace": "t1" } });
    expect(requests[0]?.headers.get("x-trace")).toBe("t1");
  });
});
