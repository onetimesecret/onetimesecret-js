import { ConfigurationError } from "./errors.ts";

/** A `fetch`-compatible function. Defaults to the runtime's global `fetch`. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Options accepted by the client constructor. */
export interface ClientOptions {
  /**
   * The API host for your region (`https://eu.onetimesecret.com`), your
   * self-hosted deployment, or your custom domain. Required: deployments are
   * region-isolated, so there is no sensible default. Falls back to the
   * `ONETIME_BASE_URL` environment variable where one exists.
   */
  baseUrl?: string | undefined;
  /**
   * Your customer extid — the short identifier beginning with `ur` shown on
   * the API settings page. Used as the HTTP Basic username. Falls back to
   * `ONETIME_CUSTOMER_EXTID`.
   */
  customer?: string | undefined;
  /** Your API token. Used as the HTTP Basic password. Falls back to `ONETIME_API_TOKEN`. */
  apiToken?: string | undefined;
  /** Per-request timeout in milliseconds. Default `30_000`. */
  timeoutMs?: number | undefined;
  /**
   * How many times an idempotent request (GET) is retried after a 429, a 5xx,
   * or a transport failure. Default `2`. Writes are never retried.
   */
  maxRetries?: number | undefined;
  /** A `fetch` implementation to use instead of the global one. */
  fetch?: FetchLike | undefined;
  /** Extra headers sent with every request. */
  defaultHeaders?: Record<string, string> | undefined;
  /** Appended to the default `User-Agent` so server logs can attribute traffic. */
  userAgentSuffix?: string | undefined;
}

/** Validated, defaulted configuration. */
export interface ResolvedConfig {
  readonly baseUrl: URL;
  readonly customer: string | undefined;
  readonly apiToken: string | undefined;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly fetch: FetchLike;
  readonly defaultHeaders: Readonly<Record<string, string>>;
  readonly userAgentSuffix: string | undefined;
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 2;

/** Regional API hosts. The apex domain is the website, not an API host. */
export const REGIONAL_HOSTS = {
  us: "https://us.onetimesecret.com",
  eu: "https://eu.onetimesecret.com",
  uk: "https://uk.onetimesecret.com",
  ca: "https://ca.onetimesecret.com",
  nz: "https://nz.onetimesecret.com",
} as const;

export type Region = keyof typeof REGIONAL_HOSTS;

const APEX_HOSTS: ReadonlySet<string> = new Set(["onetimesecret.com", "www.onetimesecret.com"]);

/** A customer extid is a short, opaque, case-insensitive identifier beginning with `ur`. */
const CUSTOMER_EXTID_PATTERN = /^ur[a-z0-9]+$/i;

export function resolveConfig(options: ClientOptions = {}): ResolvedConfig {
  const baseUrl = resolveBaseUrl(options.baseUrl ?? readEnv("ONETIME_BASE_URL"));
  const customer = blankToUndefined(options.customer ?? readEnv("ONETIME_CUSTOMER_EXTID"));
  const apiToken = blankToUndefined(options.apiToken ?? readEnv("ONETIME_API_TOKEN"));
  validateCredentials(customer, apiToken);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ConfigurationError(`timeoutMs must be a positive number, got ${String(timeoutMs)}`);
  }
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new ConfigurationError(
      `maxRetries must be a non-negative integer, got ${String(maxRetries)}`,
    );
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ConfigurationError(
      "No fetch implementation available. Pass one with the `fetch` option or run on a " +
        "runtime that provides a global fetch (Node 18+, Deno, Bun, browsers).",
    );
  }

  return {
    baseUrl,
    customer,
    apiToken,
    timeoutMs,
    maxRetries,
    fetch: fetchImpl,
    defaultHeaders: { ...(options.defaultHeaders ?? {}) },
    userAgentSuffix: blankToUndefined(options.userAgentSuffix),
  };
}

function resolveBaseUrl(value: string | undefined): URL {
  const examples = Object.values(REGIONAL_HOSTS).slice(0, 3).join(", ");
  if (value === undefined || value.trim() === "") {
    throw new ConfigurationError(
      `baseUrl is required. Use your region's API host (e.g. ${examples}), your self-hosted ` +
        "domain, or your custom domain. Pass it as `baseUrl` or set ONETIME_BASE_URL.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError(`baseUrl must be an absolute http(s) URL, got ${quote(value)}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConfigurationError(`baseUrl must be an absolute http(s) URL, got ${quote(value)}`);
  }
  if (APEX_HOSTS.has(url.hostname.toLowerCase())) {
    throw new ConfigurationError(
      `${url.hostname} is the Onetime Secret website, not an API host. Use a regional host ` +
        `(e.g. ${REGIONAL_HOSTS.eu}), your self-hosted domain, or your custom domain.`,
    );
  }
  // Normalise so path joining is predictable: drop query/hash, keep any path prefix.
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return url;
}

function validateCredentials(customer: string | undefined, apiToken: string | undefined): void {
  if (customer !== undefined && !CUSTOMER_EXTID_PATTERN.test(customer)) {
    throw new ConfigurationError(
      `customer ${quote(customer)} is not a customer extid: extids begin with "ur" ` +
        '(e.g. "ur1abc23def"). Find yours on the API settings page of your account. ' +
        "Pass it as `customer` or set ONETIME_CUSTOMER_EXTID.",
    );
  }
  // Partial credentials are almost always a mistake; fail loudly.
  if ((customer === undefined) !== (apiToken === undefined)) {
    const missing = customer === undefined ? "customer" : "apiToken";
    throw new ConfigurationError(
      `Incomplete credentials: ${missing} is missing. Pass both \`customer\` and \`apiToken\`, ` +
        "or neither for anonymous access.",
    );
  }
}

/** Reads an environment variable on runtimes that expose one; `undefined` elsewhere. */
export function readEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return blankToUndefined(env?.[name]);
}

function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function quote(value: string): string {
  return JSON.stringify(value);
}
