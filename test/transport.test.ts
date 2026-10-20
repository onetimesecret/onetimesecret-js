import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AbortError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
  TransportError,
} from "../src/index.ts";
import { makeClient, mockFetch } from "./helpers.ts";

describe("transport", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0); // deterministic backoff: 0ms
  });
  afterEach(() => vi.restoreAllMocks());

  it("turns non-2xx responses into typed errors", async () => {
    const { fetch } = mockFetch({
      status: 404,
      body: { error: "Unknown secret", error_type: "RecordNotFound" },
      headers: { "x-request-id": "req_9" },
    });
    const err = await makeClient(fetch)
      .secrets.get("nope")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).requestId).toBe("req_9");
    expect((err as NotFoundError).response?.status).toBe(404);
  });

  it("keeps non-JSON error bodies as text", async () => {
    const { fetch } = mockFetch({
      status: 502,
      body: undefined,
      headers: { "content-type": "text/html" },
    });
    const err = (await makeClient(fetch, { maxRetries: 0 })
      .status()
      .catch((e: unknown) => e)) as ServerError;
    expect(err).toBeInstanceOf(ServerError);
    expect(err.message).toBe("Server error (502)");
  });

  it("retries GET requests on 429 and 5xx, honouring Retry-After", async () => {
    const { fetch, requests } = mockFetch(
      { status: 503, body: { error: "down" } },
      { status: 429, body: { error: "slow" }, headers: { "retry-after": "0" } },
      { body: { success: true } },
    );
    const res = await makeClient(fetch).status();
    expect(res.success).toBe(true);
    expect(requests).toHaveLength(3);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const { fetch, requests } = mockFetch({ status: 429, body: { error: "slow" } });
    await expect(makeClient(fetch, { maxRetries: 1 }).status()).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(requests).toHaveLength(2);
  });

  it("never retries writes", async () => {
    const { fetch, requests } = mockFetch({ status: 503, body: { error: "down" } });
    await expect(makeClient(fetch).secrets.conceal({ secret: "x" })).rejects.toBeInstanceOf(
      ServerError,
    );
    expect(requests).toHaveLength(1);
  });

  it("retries transport failures on GET and wraps the cause", async () => {
    const cause = new TypeError("fetch failed");
    const { fetch, requests } = mockFetch({ error: cause }, { body: { success: true } });
    await makeClient(fetch).status();
    expect(requests).toHaveLength(2);

    const { fetch: failing } = mockFetch({ error: cause });
    const err = (await makeClient(failing, { maxRetries: 0 })
      .status()
      .catch((e: unknown) => e)) as TransportError;
    expect(err).toBeInstanceOf(TransportError);
    expect(err.cause).toBe(cause);
    expect(err.message).toMatch(/fetch failed/);
  });

  it("times out slow requests", async () => {
    const { fetch } = mockFetch({ delayMs: 200, body: { success: true } });
    const err = await makeClient(fetch, { timeoutMs: 20, maxRetries: 0 })
      .status()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as TimeoutError).message).toMatch(/20ms/);
  });

  it("honours a per-request timeout override", async () => {
    const { fetch } = mockFetch({ delayMs: 200, body: { success: true } });
    await expect(
      makeClient(fetch, { maxRetries: 0 }).status({ timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it("surfaces caller aborts as AbortError without retrying", async () => {
    const { fetch, requests } = mockFetch({ delayMs: 200, body: { success: true } });
    const controller = new AbortController();
    const pending = makeClient(fetch).status({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(AbortError);
    expect(requests).toHaveLength(1);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const { fetch, requests } = mockFetch({ body: { success: true } });
    await expect(makeClient(fetch).status({ signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
      Error,
    );
    expect(requests).toHaveLength(0);
  });

  it("returns undefined data for empty bodies", async () => {
    const { fetch } = mockFetch({ status: 204 });
    const res = await makeClient(fetch).request({ method: "GET", path: "/api/v2/nothing" });
    expect(res.data).toBeUndefined();
  });
});
