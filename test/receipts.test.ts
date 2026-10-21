import { describe, expect, it } from "vitest";
import { BASE_URL, makeClient, mockFetch } from "./helpers.ts";

const receipt = { shrimp: "", record: { identifier: "rcpt1", state: "new" }, details: {} };

describe("receipts", () => {
  it("gets a receipt by identifier or link", async () => {
    const { fetch, requests } = mockFetch({ body: receipt });
    const client = makeClient(fetch);
    await client.receipts.get("rcpt1");
    await client.receipts.get(`${BASE_URL}/receipt/rcpt1`, { guest: true });
    await client.receipts.get(`${BASE_URL}/private/rcpt1`);
    await client.receipts.get(`${BASE_URL}/api/v2/private/rcpt1`);
    expect(requests.map((r) => r.url)).toEqual([
      `${BASE_URL}/api/v2/receipt/rcpt1`,
      `${BASE_URL}/api/v2/guest/receipt/rcpt1`,
      `${BASE_URL}/api/v2/receipt/rcpt1`,
      `${BASE_URL}/api/v2/receipt/rcpt1`,
    ]);
  });

  it("lists recent receipts", async () => {
    const { fetch, requests } = mockFetch({ body: { shrimp: "", records: [], count: 0 } });
    const res = await makeClient(fetch).receipts.list();
    expect(res.records).toEqual([]);
    expect(requests[0]?.url).toBe(`${BASE_URL}/api/v2/receipt/recent`);
  });

  it("burns with confirmation and optional passphrase", async () => {
    const { fetch, requests } = mockFetch({ body: receipt });
    const client = makeClient(fetch);
    await client.receipts.burn("rcpt1", { passphrase: "pw" });
    await client.receipts.burn("rcpt1", {}, { guest: true });
    expect(requests[0]?.url).toBe(`${BASE_URL}/api/v2/receipt/rcpt1/burn`);
    expect(requests[0]?.body).toEqual({ passphrase: "pw", continue: "true" });
    expect(requests[1]?.url).toBe(`${BASE_URL}/api/v2/guest/receipt/rcpt1/burn`);
    expect(requests[1]?.body).toEqual({ continue: "true" });
  });

  it("updates the memo with PATCH", async () => {
    const { fetch, requests } = mockFetch({ body: receipt });
    await makeClient(fetch).receipts.update("rcpt1", { memo: "for ops" });
    expect(requests[0]?.method).toBe("PATCH");
    expect(requests[0]?.url).toBe(`${BASE_URL}/api/v2/receipt/rcpt1`);
    expect(requests[0]?.body).toEqual({ memo: "for ops" });
  });
});
