import type { ResolvedConfig } from "./config.ts";
import {
  AbortError,
  APIError,
  ResponseParseError,
  TimeoutError,
  TransportError,
} from "./errors.ts";
import { VERSION } from "./version.ts";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Per-request options accepted by every resource method. */
export interface RequestOptions {
  /** Abort the request early. Combined with the configured timeout. */
  signal?: AbortSignal | undefined;
  /** Override the client's timeout for this request only (milliseconds). */
  timeoutMs?: number | undefined;
  /** Extra headers for this request. */
  headers?: Record<string, string> | undefined;
}

export interface RequestParams extends RequestOptions {
  method: HttpMethod;
  /** Path relative to the API root, e.g. `/api/v2/secret/conceal`. */
  path: string;
  body?: unknown;
}

/** A successful response: the parsed JSON body plus the raw `Response`. */
export interface APIResponse<T> {
  data: T;
  response: Response;
  /** The server's `x-request-id`, useful when reporting problems. */
  requestId: string | undefined;
}

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS: ReadonlySet<HttpMethod> = new Set(["GET"]);

/**
 * A thin, stateless transport over `fetch`.
 *
 * Builds the URL and headers, applies the timeout, retries idempotent requests
 * with exponential backoff, and turns non-2xx responses into typed errors.
 */
export class HttpTransport {
  readonly #config: ResolvedConfig;
  readonly #authorization: string | undefined;
  readonly #userAgent: string;

  constructor(config: ResolvedConfig) {
    this.#config = config;
    this.#authorization =
      config.customer !== undefined && config.apiToken !== undefined
        ? `Basic ${base64(`${config.customer}:${config.apiToken}`)}`
        : undefined;
    this.#userAgent = buildUserAgent(config.userAgentSuffix);
  }

  /** Whether this transport sends credentials. */
  get authenticated(): boolean {
    return this.#authorization !== undefined;
  }

  async request<T>(params: RequestParams): Promise<APIResponse<T>> {
    const url = this.resolveUrl(params.path);
    const headers = this.buildHeaders(params);
    const body = params.body === undefined ? undefined : JSON.stringify(params.body);
    const timeoutMs = params.timeoutMs ?? this.#config.timeoutMs;
    const retriesAllowed = IDEMPOTENT_METHODS.has(params.method) ? this.#config.maxRetries : 0;

    for (let attempt = 0; ; attempt++) {
      if (params.signal?.aborted) {
        throw new AbortError("Request aborted", { cause: params.signal.reason });
      }
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = params.signal ? AbortSignal.any([params.signal, timeout]) : timeout;

      let response: Response;
      try {
        response = await this.#config.fetch(url, {
          method: params.method,
          headers,
          ...(body === undefined ? {} : { body }),
          signal,
        });
      } catch (cause) {
        if (params.signal?.aborted) {
          throw new AbortError("Request aborted", { cause });
        }
        if (timeout.aborted) {
          if (attempt < retriesAllowed) {
            await sleep(backoffMs(attempt));
            continue;
          }
          throw new TimeoutError(`Request timed out after ${timeoutMs}ms`, { cause });
        }
        if (attempt < retriesAllowed) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new TransportError(describeTransportFailure(cause), { cause });
      }

      if (response.ok) {
        return {
          data: (await parseBody(response)) as T,
          response,
          requestId: response.headers.get("x-request-id") ?? undefined,
        };
      }

      if (attempt < retriesAllowed && RETRYABLE_STATUSES.has(response.status)) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }

      throw APIError.fromResponse({
        status: response.status,
        body: await parseBody(response),
        response,
        requestId: response.headers.get("x-request-id") ?? undefined,
      });
    }
  }

  resolveUrl(path: string): URL {
    // `baseUrl` always ends with "/" (see config), so strip a leading slash to
    // keep any path prefix the deployment is mounted under.
    return new URL(path.replace(/^\/+/, ""), this.#config.baseUrl);
  }

  private buildHeaders(params: RequestParams): Headers {
    const headers = new Headers({
      accept: "application/json",
      "user-agent": this.#userAgent,
      ...this.#config.defaultHeaders,
      ...(params.headers ?? {}),
    });
    if (params.body !== undefined) headers.set("content-type", "application/json");
    if (this.#authorization !== undefined && !headers.has("authorization")) {
      headers.set("authorization", this.#authorization);
    }
    return headers;
  }
}

/**
 * Parses a JSON body; returns the raw text for non-JSON bodies and `undefined`
 * for empty ones. A JSON content type with an unparseable body throws
 * {@link ResponseParseError} rather than the parser's own error, whose message
 * quotes the body.
 */
async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (/\bjson\b/i.test(contentType)) {
    try {
      return JSON.parse(text);
    } catch {
      throw new ResponseParseError(response.status);
    }
  }
  // Some proxies answer with HTML; keep the text so error messages aren't lost.
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Exponential backoff with full jitter: ~0.5s, ~1s, ~2s, ... capped at 8s. */
function backoffMs(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 8_000);
  return Math.floor(Math.random() * base);
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 30_000);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, Math.min(date - Date.now(), 30_000));
  }
  return backoffMs(attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeTransportFailure(cause: unknown): string {
  const inner = cause instanceof Error ? cause.cause : undefined;
  const detail =
    inner instanceof Error ? inner.message : cause instanceof Error ? cause.message : String(cause);
  return `Request failed: ${detail}`;
}

function buildUserAgent(suffix: string | undefined): string {
  const runtime = detectRuntime();
  const base = `onetimesecret-js/${VERSION}${runtime ? ` (${runtime})` : ""}`;
  return suffix ? `${base} ${suffix}` : base;
}

function detectRuntime(): string | undefined {
  const g = globalThis as {
    Deno?: { version?: { deno?: string } };
    Bun?: { version?: string };
    process?: { versions?: { node?: string } };
    navigator?: { userAgent?: string };
  };
  if (g.Deno?.version?.deno) return `deno/${g.Deno.version.deno}`;
  if (g.Bun?.version) return `bun/${g.Bun.version}`;
  if (g.process?.versions?.node) return `node/${g.process.versions.node}`;
  if (g.navigator?.userAgent) return "browser";
  return undefined;
}

/** Base64-encodes a UTF-8 string without depending on `Buffer`. */
function base64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
