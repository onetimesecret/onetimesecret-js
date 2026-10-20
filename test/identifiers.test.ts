import { describe, expect, it } from "vitest";
import { extractIdentifier, OnetimeError } from "../src/index.ts";

describe("extractIdentifier", () => {
  it("passes bare identifiers through", () => {
    expect(extractIdentifier("abc123XYZ", "secret")).toBe("abc123XYZ");
    expect(extractIdentifier("  abc123 ", "receipt")).toBe("abc123");
  });

  it("extracts the key from secret links", () => {
    expect(extractIdentifier("https://eu.onetimesecret.com/secret/k3y", "secret")).toBe("k3y");
    expect(extractIdentifier("https://x.example/secret/k3y/", "secret")).toBe("k3y");
    expect(extractIdentifier("https://x.example/secret/k3y?utm=1#x", "secret")).toBe("k3y");
    expect(extractIdentifier("/secret/k3y", "secret")).toBe("k3y");
  });

  it("extracts the key from receipt and legacy private links", () => {
    expect(extractIdentifier("https://x.example/receipt/r3c", "receipt")).toBe("r3c");
    expect(extractIdentifier("https://x.example/private/r3c", "receipt")).toBe("r3c");
  });

  it("does not confuse secret links with receipt links", () => {
    expect(() => extractIdentifier("https://x.example/receipt/r3c", "secret")).toThrow(
      OnetimeError,
    );
    expect(() => extractIdentifier("https://x.example/secret/k3y", "receipt")).toThrow(
      /not a receipt identifier/,
    );
  });

  it("rejects empty and malformed input", () => {
    expect(() => extractIdentifier("", "secret")).toThrow(/identifier is required/);
    expect(() => extractIdentifier("not a key!", "secret")).toThrow(OnetimeError);
  });
});
