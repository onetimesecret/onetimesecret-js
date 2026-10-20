import { describe, expect, it } from "vitest";
import { BASE_URL, makeClient, mockFetch } from "./helpers.ts";

describe("client meta endpoints", () => {
  it("calls status, version and supportedLocales", async () => {
    const { fetch, requests } = mockFetch({ body: { success: true, status: "nominal" } });
    const client = makeClient(fetch);
    const status = await client.status();
    expect(status.success).toBe(true);
    await client.version();
    await client.supportedLocales();
    expect(requests.map((r) => r.url)).toEqual([
      `${BASE_URL}/api/v2/status`,
      `${BASE_URL}/api/v2/version`,
      `${BASE_URL}/api/v2/supported-locales`,
    ]);
  });

  it("builds share and receipt links", () => {
    const client = makeClient(mockFetch().fetch);
    expect(client.shareUrl("abc123")).toBe(`${BASE_URL}/secret/abc123`);
    expect(client.shareUrl(`${BASE_URL}/secret/abc123`)).toBe(`${BASE_URL}/secret/abc123`);
    expect(client.shareUrl("abc123", { shareDomain: "secrets.example.com" })).toBe(
      "https://secrets.example.com/secret/abc123",
    );
    expect(client.receiptUrl("rcpt1")).toBe(`${BASE_URL}/receipt/rcpt1`);
    expect(
      makeClient(mockFetch().fetch, { baseUrl: "https://host.example/ots" }).shareUrl("k"),
    ).toBe("https://host.example/ots/secret/k");
  });

  it("exposes a low-level request() with the raw response", async () => {
    const { fetch, requests } = mockFetch({
      body: { ok: true },
      headers: { "x-request-id": "req_42" },
    });
    const res = await makeClient(fetch).request<{ ok: boolean }>({
      method: "POST",
      path: "/api/v2/anything",
      body: { a: 1 },
    });
    expect(res.data).toEqual({ ok: true });
    expect(res.requestId).toBe("req_42");
    expect(res.response.status).toBe(200);
    expect(requests[0]?.body).toEqual({ a: 1 });
  });

  it("joins paths under a base URL with a prefix", async () => {
    const { fetch, requests } = mockFetch({ body: { success: true } });
    await makeClient(fetch, { baseUrl: "https://secrets.example.com/ots" }).status();
    expect(requests[0]?.url).toBe("https://secrets.example.com/ots/api/v2/status");
  });

  it("merges default headers and lets per-request headers win", async () => {
    const { fetch, requests } = mockFetch({ body: { success: true } });
    const client = makeClient(fetch, { defaultHeaders: { "x-a": "1", "x-b": "1" } });
    await client.status({ headers: { "x-b": "2" } });
    expect(requests[0]?.headers.get("x-a")).toBe("1");
    expect(requests[0]?.headers.get("x-b")).toBe("2");
  });

  it("appends a user agent suffix", async () => {
    const { fetch, requests } = mockFetch({ body: { success: true } });
    await makeClient(fetch, { userAgentSuffix: "my-app/2.0" }).status();
    expect(requests[0]?.headers.get("user-agent")).toMatch(/ my-app\/2\.0$/);
  });
});
