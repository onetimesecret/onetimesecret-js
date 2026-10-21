/**
 * Error hierarchy.
 *
 * Every error thrown by this library extends {@link OnetimeError}, so a single
 * `instanceof` check distinguishes SDK errors from everything else. API errors
 * follow the server's ADR-013 wire contract:
 *
 * ```json
 * { "error": "<user-facing message>", "error_type": "<class name>", ... }
 * ```
 *
 * `error_type` is what callers should branch on; this module maps it (falling
 * back to the HTTP status) onto a subclass so `instanceof` works too.
 */

/** Base class for every error raised by this library. */
export class OnetimeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * Thrown at construction time when the client is misconfigured: a missing or
 * invalid `baseUrl`, a malformed customer extid, or half a set of credentials.
 */
export class ConfigurationError extends OnetimeError {}

/**
 * A network-level failure: DNS, refused connection, TLS, reset. The underlying
 * error is available as `cause`.
 */
export class TransportError extends OnetimeError {}

/** The request exceeded the configured timeout. */
export class TimeoutError extends TransportError {}

/** The request was aborted through the caller's `AbortSignal`. */
export class AbortError extends TransportError {}

/**
 * The server answered with a JSON content type but the body did not parse.
 * Carries the status only: no body, no parser message, no `cause`, since a
 * malformed body can still contain sensitive values.
 */
export class ResponseParseError extends TransportError {
  readonly status: number;

  constructor(status: number) {
    super(`Response body is not valid JSON (status ${status})`);
    this.status = status;
  }
}

/** Structured fields the server may include in an error body (ADR-013). */
export interface APIErrorBody {
  /** User-facing message. */
  error?: string;
  /** Machine-readable error class, e.g. `"RecordNotFound"`. */
  error_type?: string;
  /** Legacy message slot; v1 and a few fallbacks still use it. */
  message?: string;
  /** Per-operation discriminator, e.g. `"GUEST_CONCEAL_DISABLED"`. */
  code?: string;
  /** The offending field on a `FormError`. */
  field?: string;
  /** i18n key for the message. */
  error_key?: string;
  /** Seconds until a rate-limited request may be retried. */
  retry_after?: number | string;
  attempts?: number;
  max_attempts?: number;
  /** The entitlement a plan is missing (`EntitlementRequired`). */
  entitlement?: string;
  current_plan?: string;
  upgrade_to?: string;
  /** Correlation id; mirrors the `x-request-id` header. Quote it in bug reports. */
  request_id?: string;
  [key: string]: unknown;
}

export interface APIErrorInit {
  status: number;
  body: APIErrorBody | unknown;
  response?: Response | undefined;
  requestId?: string | undefined;
}

/** Base class for errors returned by the API (HTTP status >= 400). */
export class APIError extends OnetimeError {
  /** HTTP status code. */
  readonly status: number;
  /** Machine-readable error class from the server, when present. */
  readonly errorType: string | undefined;
  readonly code: string | undefined;
  readonly field: string | undefined;
  readonly errorKey: string | undefined;
  /** Seconds to wait before retrying, when the server says. */
  readonly retryAfter: number | undefined;
  readonly entitlement: string | undefined;
  /** Correlation id from the body or the `x-request-id` header. */
  readonly requestId: string | undefined;
  /** The parsed response body, whatever shape it had. */
  readonly body: unknown;
  /** The raw `Response`, for callers that need headers. */
  readonly response: Response | undefined;

  constructor(message: string, init: APIErrorInit) {
    super(message);
    const body = isRecord(init.body) ? (init.body as APIErrorBody) : {};
    this.status = init.status;
    this.errorType = optionalString(body.error_type);
    this.code = optionalString(body.code);
    this.field = optionalString(body.field);
    this.errorKey = optionalString(body.error_key);
    this.retryAfter = optionalNumber(body.retry_after);
    this.entitlement = optionalString(body.entitlement);
    this.requestId = init.requestId ?? optionalString(body.request_id);
    this.body = init.body;
    this.response = init.response;
  }

  /**
   * Builds the most specific error subclass for a response. Maps the ADR-013
   * `error_type` first and falls back to the HTTP status.
   */
  static fromResponse(init: APIErrorInit): APIError {
    const body = isRecord(init.body) ? (init.body as APIErrorBody) : {};
    const accountRequired = isAccountRequired(body);
    const Klass = accountRequired
      ? AccountRequiredError
      : (classForErrorType(body.error_type) ?? classForStatus(init.status));
    const message =
      optionalString(body.error) ??
      optionalString(body.message) ??
      (accountRequired ? ACCOUNT_REQUIRED_MESSAGE : defaultMessage(init.status));
    return new Klass(message, init);
  }
}

/** 400 / 422, or `FormError`. Check `field` for the offending parameter. */
export class BadRequestError extends APIError {}
/** 401. */
export class AuthenticationError extends APIError {}
/**
 * The operation needs an authenticated account. The server reports this inside
 * a 400 form-error body (`field: "requires_account"`), which would otherwise
 * look like a malformed request; it is an authentication problem, so it lives
 * under {@link AuthenticationError}.
 */
export class AccountRequiredError extends AuthenticationError {}
/** 403, `Forbidden`, or `GuestRoutesDisabled` (see `code`). */
export class ForbiddenError extends APIError {}
/** `EntitlementRequired`: the account's plan lacks a feature (see `entitlement`). */
export class EntitlementError extends ForbiddenError {}
/** 404 or `RecordNotFound`. */
export class NotFoundError extends APIError {}
/** 409. */
export class ConflictError extends APIError {}
/** 429 or `LimitExceeded` (see `retryAfter`). */
export class RateLimitError extends APIError {}
/** 5xx. */
export class ServerError extends APIError {}

type APIErrorClass = new (message: string, init: APIErrorInit) => APIError;

const ERROR_TYPE_MAP: Readonly<Record<string, APIErrorClass>> = {
  FormError: BadRequestError,
  RequiresAccount: AccountRequiredError,
  AccountRequired: AccountRequiredError,
  RecordNotFound: NotFoundError,
  NotFound: NotFoundError,
  Forbidden: ForbiddenError,
  GuestRoutesDisabled: ForbiddenError,
  EntitlementRequired: EntitlementError,
  LimitExceeded: RateLimitError,
  ServerError: ServerError,
};

const STATUS_MAP: Readonly<Record<number, APIErrorClass>> = {
  400: BadRequestError,
  401: AuthenticationError,
  403: ForbiddenError,
  404: NotFoundError,
  409: ConflictError,
  422: BadRequestError,
  429: RateLimitError,
};

const ACCOUNT_REQUIRED_MESSAGE =
  "This operation requires an authenticated account: pass `customer` and `apiToken` " +
  "to the client, or use the guest endpoint.";

// The account requirement can arrive in several slots depending on the
// endpoint and server version: as the FormError `field`, the i18n `error_key`,
// or a `code` such as "GUEST_CONCEAL_REQUIRES_ACCOUNT".
const ACCOUNT_REQUIRED_PATTERN =
  /(?:^|[^a-z0-9])(requires[_-]?account|account[_-]?required)(?:$|[^a-z0-9])/i;

function isAccountRequired(body: APIErrorBody): boolean {
  return (["error_type", "field", "error_key", "code"] as const).some((key) => {
    const value = body[key];
    return typeof value === "string" && ACCOUNT_REQUIRED_PATTERN.test(value);
  });
}

function classForErrorType(errorType: unknown): APIErrorClass | undefined {
  return typeof errorType === "string" ? ERROR_TYPE_MAP[errorType] : undefined;
}

function classForStatus(status: number): APIErrorClass {
  return STATUS_MAP[status] ?? (status >= 500 ? ServerError : APIError);
}

function defaultMessage(status: number): string {
  switch (status) {
    case 400:
      return "Bad request";
    case 401:
      return "Authentication failed";
    case 403:
      return "Forbidden";
    case 404:
      return "Not found";
    case 429:
      return "Rate limit exceeded";
    default:
      return status >= 500 ? `Server error (${status})` : `Request failed (${status})`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
