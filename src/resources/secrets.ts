import type { HttpTransport } from "../http.ts";
import { extractIdentifier } from "../identifiers.ts";
import type {
  ConcealParams,
  ConcealResponse,
  GenerateParams,
  GenerateResponse,
  RequestBodyOf,
  RequestOptions,
  ResourceRequestOptions,
  RevealParams,
  RevealResponse,
  SecretResponse,
  SecretStatusListResponse,
  SecretStatusResponse,
} from "../types.ts";
import { compact, pick, prefix } from "./util.ts";

// The published schema marks `share_domain` as required because the web UI
// always sends it; the server accepts its absence and uses the default domain.
// See docs/api-contract.md.
type ConcealBody = {
  secret: Omit<RequestBodyOf<"v2_concealSecret">["secret"], "share_domain"> & {
    share_domain?: string;
  };
};
type GenerateBody = {
  secret: Omit<RequestBodyOf<"v2_generateSecret">["secret"], "share_domain"> & {
    share_domain?: string;
  };
};
type RevealBody = RequestBodyOf<"v2_secret_revealSecret">;
type StatusListBody = RequestBodyOf<"v2_listSecretStatus">;

/**
 * Secrets: create them, reveal them, and check their state.
 *
 * Creating a secret returns two identifiers. The **secret** identifier goes in
 * the link you give the recipient and can be used once. The **receipt**
 * identifier stays with you and is used with {@link Receipts} to check state or
 * burn the secret early.
 */
export class Secrets {
  readonly #http: HttpTransport;

  constructor(http: HttpTransport) {
    this.#http = http;
  }

  /** Stores a value you already have and returns the links to share it. */
  async conceal(
    params: ConcealParams,
    options: ResourceRequestOptions = {},
  ): Promise<ConcealResponse> {
    const body: ConcealBody = {
      secret: compact({
        kind: "conceal" as const,
        secret: params.secret,
        ttl: params.ttl,
        passphrase: params.passphrase,
        recipient: params.recipient,
        share_domain: params.shareDomain,
        display_type: params.displayType,
      }),
    };
    const { data } = await this.#http.request<ConcealResponse>({
      method: "POST",
      path: prefix(options.guest, "/secret/conceal"),
      body,
      ...pick(options),
    });
    return data;
  }

  /** Has the server generate a random value (a password, say) and returns the links. */
  async generate(
    params: GenerateParams = {},
    options: ResourceRequestOptions = {},
  ): Promise<GenerateResponse> {
    const sets = params.characterSets;
    const body: GenerateBody = {
      secret: compact({
        kind: "generate" as const,
        ttl: params.ttl,
        passphrase: params.passphrase,
        recipient: params.recipient,
        share_domain: params.shareDomain,
        display_type: params.displayType,
        length: params.length,
        character_sets: sets
          ? compact({
              uppercase: sets.uppercase,
              lowercase: sets.lowercase,
              numbers: sets.numbers,
              symbols: sets.symbols,
              exclude_ambiguous: sets.excludeAmbiguous,
            })
          : undefined,
      }),
    };
    const { data } = await this.#http.request<GenerateResponse>({
      method: "POST",
      path: prefix(options.guest, "/secret/generate"),
      body,
      ...pick(options),
    });
    return data;
  }

  /**
   * Retrieves a secret's metadata without consuming it. Accepts a bare
   * identifier or a full secret link.
   */
  async get(identifier: string, options: ResourceRequestOptions = {}): Promise<SecretResponse> {
    const id = extractIdentifier(identifier, "secret");
    const { data } = await this.#http.request<SecretResponse>({
      method: "GET",
      path: prefix(options.guest, `/secret/${id}`),
      ...pick(options),
    });
    return data;
  }

  /**
   * Reveals (consumes) a secret. This is the one-time operation: after it
   * succeeds the value is gone from the server.
   */
  async reveal(
    identifier: string,
    params: RevealParams = {},
    options: ResourceRequestOptions = {},
  ): Promise<RevealResponse> {
    const id = extractIdentifier(identifier, "secret");
    const body: RevealBody = compact({
      passphrase: params.passphrase,
      continue: String(params.continue ?? true),
    });
    const { data } = await this.#http.request<RevealResponse>({
      method: "POST",
      path: prefix(options.guest, `/secret/${id}/reveal`),
      body,
      ...pick(options),
    });
    return data;
  }

  /** The state of one secret. Unknown identifiers return `{ record: { state: "unknown" } }`. */
  async status(identifier: string, options: RequestOptions = {}): Promise<SecretStatusResponse> {
    const id = extractIdentifier(identifier, "secret");
    const { data } = await this.#http.request<SecretStatusResponse>({
      method: "GET",
      path: `/api/v2/secret/${id}/status`,
      ...pick(options),
    });
    return data;
  }

  /** The state of several secrets in one request. */
  async statuses(
    identifiers: readonly string[],
    options: RequestOptions = {},
  ): Promise<SecretStatusListResponse> {
    const body: StatusListBody = {
      identifiers: identifiers.map((value) => extractIdentifier(value, "secret")),
    };
    const { data } = await this.#http.request<SecretStatusListResponse>({
      method: "POST",
      path: "/api/v2/secret/status",
      body,
      ...pick(options),
    });
    return data;
  }
}
