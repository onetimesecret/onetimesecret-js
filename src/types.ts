/**
 * Public types.
 *
 * Response types are derived from the generated OpenAPI types so they track the
 * published contract; request parameter types are hand-written in camelCase
 * and mapped to the wire format inside each resource.
 */
import type { ClaimError } from "./errors.ts";
import type { operations } from "./generated/v2.ts";
import type { RequestOptions } from "./http.ts";

export type { RequestOptions };

type OperationId = keyof operations;

/** The JSON body of an operation's 200 response. */
export type ResponseOf<Op extends OperationId> =
  operations[Op]["responses"][200]["content"]["application/json"];

/** The JSON request body of an operation. */
export type RequestBodyOf<Op extends OperationId> = operations[Op] extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never;

// ---------------------------------------------------------------------------
// Secrets

export type ConcealResponse = ResponseOf<"v2_concealSecret">;
export type GenerateResponse = ResponseOf<"v2_generateSecret">;

/**
 * What {@link Secrets.generate} returns: the create response plus the
 * generated value, claimed from the receipt right after creation.
 *
 * The server discloses a generated value exactly once, on the first read of
 * its receipt, so the SDK performs that read for you. `value` is `undefined`
 * when `claimValue: false` was passed, when the claim request failed (see
 * `claimError`; the secret still exists and the links are valid), or when the
 * server withheld it (the receipt had already been read, or the display
 * window had passed).
 */
export type GenerateResult = GenerateResponse & {
  /** The generated value, if the server disclosed it. */
  value?: string | undefined;
  /**
   * Why the value could not be claimed; the secret itself was created. Carries
   * only the status and error class/type of the failed receipt read.
   */
  claimError?: ClaimError | undefined;
};
export type SecretResponse = ResponseOf<"v2_showSecret">;
export type RevealResponse = ResponseOf<"v2_secret_revealSecret">;
export type SecretStatusResponse = ResponseOf<"v2_secret_showSecretStatus">;
export type SecretStatusListResponse = ResponseOf<"v2_listSecretStatus">;

/** The `record` of a conceal/generate response: the receipt and the secret together. */
export type ConcealRecord = ConcealResponse["record"];
/** A secret as returned by show/reveal. */
export type Secret = SecretResponse["record"];
export type SecretState = Secret["state"];
export type DisplayType = "text" | "markdown";

export interface ConcealParams {
  /** The value to share. */
  secret: string;
  /** Lifetime in seconds. The server applies the account's default and maximum. */
  ttl?: number | undefined;
  /** Required from the recipient before the secret is revealed. */
  passphrase?: string | undefined;
  /** Email address to notify with the secret link. */
  recipient?: string | undefined;
  /** Custom domain the share link should use. */
  shareDomain?: string | undefined;
  /** How the recipient's UI renders the value. Default `"text"`. */
  displayType?: DisplayType | undefined;
}

export interface CharacterSets {
  uppercase?: boolean | undefined;
  lowercase?: boolean | undefined;
  numbers?: boolean | undefined;
  symbols?: boolean | undefined;
  excludeAmbiguous?: boolean | undefined;
}

export interface GenerateParams {
  ttl?: number | undefined;
  passphrase?: string | undefined;
  recipient?: string | undefined;
  shareDomain?: string | undefined;
  displayType?: DisplayType | undefined;
  /** Length of the generated value, 4–128. */
  length?: number | undefined;
  characterSets?: CharacterSets | undefined;
  /**
   * Read the receipt immediately after creation to claim the generated value
   * (see {@link GenerateResult}). Default `true`. Pass `false` to claim it
   * yourself with `receipts.get`; remember that only the first read gets it.
   */
  claimValue?: boolean | undefined;
}

export interface RevealParams {
  /** The passphrase set at creation, if any. */
  passphrase?: string | undefined;
  /**
   * Confirm the reveal. The web UI shows a confirmation step before consuming
   * a secret; the API models it with this flag. Default `true`.
   */
  continue?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Receipts

export type ReceiptResponse = ResponseOf<"v2_showReceipt">;
export type ReceiptListResponse = ResponseOf<"v2_listReceipts">;
export type BurnResponse = ResponseOf<"v2_receipt_burnSecret">;

/** A receipt: the creator's record of a secret. */
export type Receipt = ReceiptResponse["record"];
export type ReceiptState = Receipt["state"];

export interface BurnParams {
  passphrase?: string | undefined;
  /** Confirm the burn. Default `true`. */
  continue?: boolean | undefined;
}

export interface UpdateReceiptParams {
  /** A private note, visible only to the creator. */
  memo?: string | undefined;
}

// ---------------------------------------------------------------------------
// Meta

export type StatusResponse = ResponseOf<"v2_systemStatus">;
export type VersionResponse = ResponseOf<"v2_systemVersion">;
export type SupportedLocalesResponse = ResponseOf<"v2_getSupportedLocales">;

// ---------------------------------------------------------------------------
// Request options

/** Options accepted by secret and receipt methods. */
export interface ResourceRequestOptions extends RequestOptions {
  /**
   * Use the `/guest/` endpoints, which never require an account. The client's
   * credentials, if any, are still sent. Default `false`.
   */
  guest?: boolean | undefined;
}
