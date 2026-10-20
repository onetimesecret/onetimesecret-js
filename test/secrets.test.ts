import { describe, expect, it } from "vitest";
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
    const { fetch, requests } = mockFetch({ body: concealResponse });
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
