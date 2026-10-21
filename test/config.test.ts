import { afterEach, describe, expect, it, vi } from "vitest";
import { readEnv } from "../src/config.ts";
import { ConfigurationError, OnetimeSecret, REGIONAL_HOSTS } from "../src/index.ts";
import { BASE_URL, CUSTOMER, mockFetch, TOKEN } from "./helpers.ts";

describe("client configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires a baseUrl", () => {
    vi.stubEnv("ONETIME_BASE_URL", "");
    expect(() => new OnetimeSecret({ fetch: mockFetch().fetch })).toThrow(ConfigurationError);
    expect(() => new OnetimeSecret({ fetch: mockFetch().fetch })).toThrow(/baseUrl is required/);
  });

  it("rejects the apex domain with a pointer to regional hosts", () => {
    expect(() => new OnetimeSecret({ baseUrl: "https://onetimesecret.com" })).toThrow(
      /website, not an API host/,
    );
    expect(() => new OnetimeSecret({ baseUrl: "https://www.onetimesecret.com" })).toThrow(
      ConfigurationError,
    );
  });

  it("rejects non-http URLs and relative values", () => {
    expect(() => new OnetimeSecret({ baseUrl: "eu.onetimesecret.com" })).toThrow(
      /absolute http\(s\) URL/,
    );
    expect(() => new OnetimeSecret({ baseUrl: "ftp://example.com" })).toThrow(ConfigurationError);
  });

  it("accepts every regional host, self-hosted and custom domains", () => {
    for (const host of Object.values(REGIONAL_HOSTS)) {
      expect(new OnetimeSecret({ baseUrl: host }).baseUrl).toBe(`${host}/`);
    }
    expect(new OnetimeSecret({ baseUrl: "http://localhost:3000" }).baseUrl).toBe(
      "http://localhost:3000/",
    );
    expect(new OnetimeSecret({ baseUrl: "https://secrets.example.com/ots" }).baseUrl).toBe(
      "https://secrets.example.com/ots/",
    );
  });

  it("validates the customer extid format", () => {
    expect(
      () => new OnetimeSecret({ baseUrl: BASE_URL, customer: "acct-123", apiToken: TOKEN }),
    ).toThrow(/is not a customer extid/);
    expect(
      () => new OnetimeSecret({ baseUrl: BASE_URL, customer: "UR1ABC23DEF", apiToken: TOKEN }),
    ).not.toThrow();
  });

  it("rejects half a set of credentials", () => {
    expect(() => new OnetimeSecret({ baseUrl: BASE_URL, customer: CUSTOMER })).toThrow(
      /apiToken is missing/,
    );
    expect(() => new OnetimeSecret({ baseUrl: BASE_URL, apiToken: TOKEN })).toThrow(
      /customer is missing/,
    );
  });

  it("is anonymous without credentials", () => {
    const client = new OnetimeSecret({ baseUrl: BASE_URL });
    expect(client.authenticated).toBe(false);
  });

  it("reads baseUrl and credentials from the environment", () => {
    vi.stubEnv("ONETIME_BASE_URL", "https://ca.onetimesecret.com");
    vi.stubEnv("ONETIME_CUSTOMER_EXTID", CUSTOMER);
    vi.stubEnv("ONETIME_API_TOKEN", TOKEN);
    const client = new OnetimeSecret();
    expect(client.baseUrl).toBe("https://ca.onetimesecret.com/");
    expect(client.authenticated).toBe(true);
  });

  it("treats the environment as empty on runtimes without process", () => {
    vi.stubEnv("ONETIME_BASE_URL", "https://ca.onetimesecret.com");
    vi.stubGlobal("process", undefined);
    expect(readEnv("ONETIME_BASE_URL")).toBeUndefined();
    expect(() => new OnetimeSecret({ fetch: mockFetch().fetch })).toThrow(/baseUrl is required/);
    const client = new OnetimeSecret({ baseUrl: BASE_URL, fetch: mockFetch().fetch });
    expect(client.authenticated).toBe(false);
  });

  it("treats a process without env as an empty environment", () => {
    vi.stubGlobal("process", {});
    expect(readEnv("ONETIME_BASE_URL")).toBeUndefined();
    expect(() => new OnetimeSecret({ fetch: mockFetch().fetch })).toThrow(ConfigurationError);
  });

  it("prefers explicit options over the environment", () => {
    vi.stubEnv("ONETIME_BASE_URL", "https://ca.onetimesecret.com");
    expect(new OnetimeSecret({ baseUrl: BASE_URL }).baseUrl).toBe(`${BASE_URL}/`);
  });

  it("validates timeoutMs and maxRetries", () => {
    expect(() => new OnetimeSecret({ baseUrl: BASE_URL, timeoutMs: 0 })).toThrow(/timeoutMs/);
    expect(() => new OnetimeSecret({ baseUrl: BASE_URL, maxRetries: -1 })).toThrow(/maxRetries/);
    expect(() => new OnetimeSecret({ baseUrl: BASE_URL, maxRetries: 1.5 })).toThrow(/maxRetries/);
  });
});
