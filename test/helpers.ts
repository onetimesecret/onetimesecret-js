import { expect } from "vitest";
import { type ClientOptions, OnetimeSecret } from "../src/index.ts";

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Throw this instead of responding (simulates a transport failure). */
  error?: Error;
  /** Delay before responding, in ms (simulates a slow server). */
  delayMs?: number;
}

/**
 * A `fetch` double that replays scripted responses and records what it was
 * asked. Each call consumes the next scripted response; the last one repeats.
 */
export function mockFetch(...responses: MockResponse[]) {
  const requests: RecordedRequest[] = [];
  let index = 0;
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const script = responses[Math.min(index, responses.length - 1)] ?? {};
    index++;
    const headers = new Headers(init?.headers);
    const rawBody = init?.body;
    requests.push({
      url: input instanceof Request ? input.url : String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof rawBody === "string" ? JSON.parse(rawBody) : undefined,
    });
    if (script.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, script.delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError"));
        });
      });
    }
    if (script.error) throw script.error;
    const status = script.status ?? 200;
    const body = script.body === undefined ? "" : JSON.stringify(script.body);
    return new Response(status === 204 ? null : body, {
      status,
      headers: { "content-type": "application/json", ...(script.headers ?? {}) },
    });
  };
  return { fetch: impl, requests };
}

export const BASE_URL = "https://eu.onetimesecret.com";
export const CUSTOMER = "ur1abc23def";
export const TOKEN = "tok_test_123";

export function makeClient(fetch: ClientOptions["fetch"], overrides: ClientOptions = {}) {
  return new OnetimeSecret({
    baseUrl: BASE_URL,
    customer: CUSTOMER,
    apiToken: TOKEN,
    fetch,
    ...overrides,
  });
}

export function expectBasicAuth(headers: Headers, customer = CUSTOMER, token = TOKEN) {
  const expected = `Basic ${Buffer.from(`${customer}:${token}`).toString("base64")}`;
  expect(headers.get("authorization")).toBe(expected);
}
