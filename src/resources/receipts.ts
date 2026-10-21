import type { HttpTransport } from "../http.ts";
import { extractIdentifier } from "../identifiers.ts";
import type {
  BurnParams,
  BurnResponse,
  ReceiptListResponse,
  ReceiptResponse,
  RequestBodyOf,
  RequestOptions,
  ResourceRequestOptions,
  UpdateReceiptParams,
} from "../types.ts";
import { compact, pick, prefix } from "./util.ts";

type BurnBody = RequestBodyOf<"v2_receipt_burnSecret">;

/**
 * Receipts: the creator's side of a secret.
 *
 * A receipt tracks whether its secret has been previewed, revealed, burned or
 * expired, and lets the creator destroy the secret before anyone sees it.
 */
export class Receipts {
  readonly #http: HttpTransport;

  constructor(http: HttpTransport) {
    this.#http = http;
  }

  /** Retrieves a receipt. Accepts a bare identifier or a full receipt link. */
  async get(identifier: string, options: ResourceRequestOptions = {}): Promise<ReceiptResponse> {
    const id = extractIdentifier(identifier, "receipt");
    const { data } = await this.#http.request<ReceiptResponse>({
      method: "GET",
      path: prefix(options.guest, `/receipt/${id}`),
      ...pick(options),
    });
    return data;
  }

  /** Lists the account's receipts from the last 30 days. Requires authentication. */
  async list(options: RequestOptions = {}): Promise<ReceiptListResponse> {
    const { data } = await this.#http.request<ReceiptListResponse>({
      method: "GET",
      path: "/api/v2/receipt/recent",
      ...pick(options),
    });
    return data;
  }

  /** Destroys the secret before it is revealed. */
  async burn(
    identifier: string,
    params: BurnParams = {},
    options: ResourceRequestOptions = {},
  ): Promise<BurnResponse> {
    const id = extractIdentifier(identifier, "receipt");
    const body: BurnBody & { passphrase?: string } = compact({
      passphrase: params.passphrase,
      continue: String(params.continue ?? true),
    });
    const { data } = await this.#http.request<BurnResponse>({
      method: "POST",
      path: prefix(options.guest, `/receipt/${id}/burn`),
      body,
      ...pick(options),
    });
    return data;
  }

  /** Updates the creator's private memo on a receipt. */
  async update(
    identifier: string,
    params: UpdateReceiptParams,
    options: RequestOptions = {},
  ): Promise<ReceiptResponse> {
    const id = extractIdentifier(identifier, "receipt");
    const { data } = await this.#http.request<ReceiptResponse>({
      method: "PATCH",
      path: `/api/v2/receipt/${id}`,
      body: compact({ memo: params.memo }),
      ...pick(options),
    });
    return data;
  }
}
