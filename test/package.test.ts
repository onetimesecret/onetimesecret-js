// Smoke-tests the built artefacts the way consumers load them. Skipped until `pnpm build`
// has run; excluded from tsconfig.tools.json because dist/ may not exist at typecheck time.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const built = existsSync(new URL("../dist/index.cjs", import.meta.url));

describe.skipIf(!built)("built package", () => {
  it("loads as CommonJS", () => {
    const mod = require("../dist/index.cjs");
    expect(typeof mod.OnetimeSecret).toBe("function");
    expect(mod.VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("loads as ESM", async () => {
    const mod = await import("../dist/index.js");
    expect(typeof mod.OnetimeSecret).toBe("function");
    const client = new mod.OnetimeSecret({ baseUrl: "https://eu.onetimesecret.com" });
    expect(client.authenticated).toBe(false);
  });
});
