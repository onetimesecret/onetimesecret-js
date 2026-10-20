import { describe, expect, it } from "vitest";
import {
  AccountRequiredError,
  APIError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  EntitlementError,
  ForbiddenError,
  NotFoundError,
  OnetimeError,
  RateLimitError,
  ServerError,
} from "../src/index.ts";

function build(status: number, body: unknown, requestId?: string) {
  return APIError.fromResponse({ status, body, requestId });
}

describe("APIError.fromResponse", () => {
  it("maps ADR-013 error_type before the status code", () => {
    const err = build(400, { error: "No such thing", error_type: "RecordNotFound" });
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toBe("No such thing");
    expect(err.errorType).toBe("RecordNotFound");
    expect(err.status).toBe(400);
  });

  it.each([
    ["FormError", BadRequestError],
    ["Forbidden", ForbiddenError],
    ["GuestRoutesDisabled", ForbiddenError],
    ["EntitlementRequired", EntitlementError],
    ["LimitExceeded", RateLimitError],
    ["ServerError", ServerError],
    ["NotFound", NotFoundError],
  ])("maps error_type %s", (errorType, Klass) => {
    expect(build(400, { error: "x", error_type: errorType })).toBeInstanceOf(Klass);
  });

  it.each([
    [400, BadRequestError],
    [401, AuthenticationError],
    [403, ForbiddenError],
    [404, NotFoundError],
    [409, ConflictError],
    [422, BadRequestError],
    [429, RateLimitError],
    [500, ServerError],
    [503, ServerError],
  ])("falls back to the status code %i", (status, Klass) => {
    const err = build(status, { error: "boom" });
    expect(err).toBeInstanceOf(Klass);
    expect(err).toBeInstanceOf(APIError);
    expect(err).toBeInstanceOf(OnetimeError);
  });

  it("uses a generic APIError for unmapped 4xx statuses", () => {
    const err = build(418, { error: "teapot" });
    expect(err.constructor).toBe(APIError);
  });

  it("recognises the account requirement in any slot", () => {
    for (const body of [
      { error: "x", error_type: "FormError", field: "requires_account" },
      { error: "x", error_key: "requires-account" },
      { error: "x", code: "GUEST_CONCEAL_REQUIRES_ACCOUNT" },
      { error: "x", error_type: "AccountRequired" },
    ]) {
      const err = build(400, body);
      expect(err).toBeInstanceOf(AccountRequiredError);
      expect(err).toBeInstanceOf(AuthenticationError);
    }
    expect(build(400, { field: "requires_account" }).message).toMatch(/authenticated account/);
    expect(build(400, { field: "requires_account" }).field).toBe("requires_account");
  });

  it("does not match 'account' substrings loosely", () => {
    expect(build(400, { error: "x", field: "account_name" })).toBeInstanceOf(BadRequestError);
  });

  it("falls back to the legacy message field and then a default", () => {
    expect(build(404, { message: "legacy" }).message).toBe("legacy");
    expect(build(404, {}).message).toBe("Not found");
    expect(build(429, undefined).message).toBe("Rate limit exceeded");
    expect(build(502, "<html>bad gateway</html>").message).toBe("Server error (502)");
    expect(build(418, null).message).toBe("Request failed (418)");
  });

  it("carries structured fields", () => {
    const err = build(429, {
      error: "slow down",
      error_type: "LimitExceeded",
      retry_after: "12",
      request_id: "req_1",
    });
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(12);
    expect(err.requestId).toBe("req_1");

    const ent = build(403, {
      error: "upgrade",
      error_type: "EntitlementRequired",
      entitlement: "custom_domains",
    });
    expect(ent).toBeInstanceOf(EntitlementError);
    expect(ent).toBeInstanceOf(ForbiddenError);
    expect(ent.entitlement).toBe("custom_domains");
  });

  it("prefers the header request id over the body", () => {
    expect(build(500, { request_id: "body" }, "header").requestId).toBe("header");
  });

  it("names errors after their class", () => {
    expect(build(404, {}).name).toBe("NotFoundError");
    expect(new OnetimeError("x").name).toBe("OnetimeError");
  });
});
