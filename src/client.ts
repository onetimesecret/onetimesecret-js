import { type ClientOptions, type ResolvedConfig, resolveConfig } from "./config.ts";
import {
  type APIResponse,
  HttpTransport,
  type RequestOptions,
  type RequestParams,
} from "./http.ts";
import { extractIdentifier } from "./identifiers.ts";
import { Receipts } from "./resources/receipts.ts";
import { Secrets } from "./resources/secrets.ts";
import type { StatusResponse, SupportedLocalesResponse, VersionResponse } from "./types.ts";

/**
 * The Onetime Secret API client.
 *
 * ```ts
 * import { OnetimeSecret } from "@onetimesecret/sdk";
 *
 * const client = new OnetimeSecret({
 *   baseUrl: "https://eu.onetimesecret.com",
 *   customer: "ur1abc23def",
 *   apiToken: process.env.ONETIME_API_TOKEN,
 * });
 *
 * const { record } = await client.secrets.conceal({ secret: "hunter2", ttl: 3600 });
 * console.log(client.shareUrl(record.secret.identifier));
 * ```
 *
 * Clients hold only configuration and a stateless transport, so one instance
 * can be shared across an application.
 */
export class OnetimeSecret {
  readonly secrets: Secrets;
  readonly receipts: Receipts;

  readonly #config: ResolvedConfig;
  readonly #http: HttpTransport;

  constructor(options: ClientOptions = {}) {
    this.#config = resolveConfig(options);
    this.#http = new HttpTransport(this.#config);
    this.secrets = new Secrets(this.#http);
    this.receipts = new Receipts(this.#http);
  }

  /** The resolved base URL, normalised with a trailing slash. */
  get baseUrl(): string {
    return this.#config.baseUrl.href;
  }

  /** Whether requests carry credentials. */
  get authenticated(): boolean {
    return this.#http.authenticated;
  }

  /**
   * The link to give a recipient for a secret. Conceal and generate responses
   * carry identifiers rather than links; this builds the link the web UI
   * would show, on the custom share domain when one was used.
   */
  shareUrl(secretIdentifier: string, options: { shareDomain?: string | undefined } = {}): string {
    const id = extractIdentifier(secretIdentifier, "secret");
    if (options.shareDomain) {
      return `https://${options.shareDomain}/secret/${id}`;
    }
    return new URL(`secret/${id}`, this.#config.baseUrl).href;
  }

  /** The creator's link for a receipt, on the configured base URL. */
  receiptUrl(receiptIdentifier: string): string {
    const id = extractIdentifier(receiptIdentifier, "receipt");
    return new URL(`receipt/${id}`, this.#config.baseUrl).href;
  }

  /** Service health. */
  async status(options: RequestOptions = {}): Promise<StatusResponse> {
    const { data } = await this.#http.request<StatusResponse>({
      method: "GET",
      path: "/api/v2/status",
      ...options,
    });
    return data;
  }

  /** The server's version. */
  async version(options: RequestOptions = {}): Promise<VersionResponse> {
    const { data } = await this.#http.request<VersionResponse>({
      method: "GET",
      path: "/api/v2/version",
      ...options,
    });
    return data;
  }

  /** Locales the server can render in. */
  async supportedLocales(options: RequestOptions = {}): Promise<SupportedLocalesResponse> {
    const { data } = await this.#http.request<SupportedLocalesResponse>({
      method: "GET",
      path: "/api/v2/supported-locales",
      ...options,
    });
    return data;
  }

  /**
   * Low-level escape hatch: send any request with the client's configuration
   * (auth, timeout, retries, error mapping) and get the parsed body plus the
   * raw `Response`. Useful for endpoints this version of the SDK does not wrap.
   */
  request<T = unknown>(params: RequestParams): Promise<APIResponse<T>> {
    return this.#http.request<T>(params);
  }
}
