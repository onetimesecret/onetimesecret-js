#!/usr/bin/env node
// Downloads the published OpenAPI definition for API v2 into spec/.
//
// The spec is generated in onetimesecret/onetimesecret from its Zod v4 schemas
// and published through Bump.sh at https://api.onetimesecret.com. That
// published file is the contract this SDK is typed against; see
// docs/api-contract.md for why we consume it rather than the Zod source.
//
// Usage:
//   pnpm sync-spec            # fetch, rewrite spec/openapi.v2.json if changed
//   pnpm sync-spec --check    # exit 1 if the published spec differs (CI)

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SPEC_URL = "https://api.onetimesecret.com/doc/api-v2.json";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "spec", "openapi.v2.json");
const check = process.argv.includes("--check");

const res = await fetch(SPEC_URL, { headers: { accept: "application/json" } });
if (!res.ok) {
  console.error(`Failed to fetch ${SPEC_URL}: ${res.status} ${res.statusText}`);
  process.exit(2);
}
const remote = JSON.parse(await res.text());
const formatted = `${JSON.stringify(remote, null, 2)}\n`;

let current = null;
try {
  current = await readFile(target, "utf8");
} catch {
  // first run
}

if (current === formatted) {
  console.log(`spec/openapi.v2.json is up to date (${remote.info?.version ?? "unknown version"})`);
  process.exit(0);
}

if (check) {
  console.error(
    `spec/openapi.v2.json is out of date. Published version: ${remote.info?.version}. ` +
      "Run `pnpm sync-spec && pnpm generate` and review the diff.",
  );
  process.exit(1);
}

await writeFile(target, formatted);
console.log(`Updated spec/openapi.v2.json to ${remote.info?.version ?? "unknown version"}`);
