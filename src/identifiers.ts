/**
 * Secret and receipt methods accept either a bare identifier or the full link a
 * user was given (`https://eu.onetimesecret.com/secret/abc123`), so values can
 * be passed straight through from wherever they were copied.
 */

import { OnetimeError } from "./errors.ts";

export type IdentifierKind = "secret" | "receipt";

const IDENTIFIER_PATTERN = /^[a-z0-9]+$/i;
const PATH_SEGMENTS: Readonly<Record<IdentifierKind, readonly string[]>> = {
  secret: ["secret"],
  // "private" is the historical name for a receipt and still appears in links.
  receipt: ["receipt", "private"],
};

export function extractIdentifier(input: string, kind: IdentifierKind): string {
  const value = input.trim();
  if (value === "") {
    throw new OnetimeError(`A ${kind} identifier is required`);
  }
  if (IDENTIFIER_PATTERN.test(value)) return value;

  const segments = PATH_SEGMENTS[kind].join("|");
  const match = new RegExp(`/(?:${segments})/([a-z0-9]+)(?:[/?#]|$)`, "i").exec(value);
  if (match?.[1]) return match[1];

  throw new OnetimeError(`${JSON.stringify(input)} is not a ${kind} identifier or ${kind} link`);
}
