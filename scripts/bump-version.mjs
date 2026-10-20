#!/usr/bin/env node
// Release bookkeeping. Keeps the three places a version lives in agreement:
// package.json, src/version.ts, and the CHANGELOG heading.
//
//   pnpm bump 0.2.0      # set the version everywhere and stamp the changelog
//   pnpm release:check   # exit 1 unless all three agree (run by CI and prepublishOnly)
//
// See docs/releasing.md for the full release procedure.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  pkg: join(root, "package.json"),
  version: join(root, "src", "version.ts"),
  changelog: join(root, "CHANGELOG.md"),
};

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const args = process.argv.slice(2);
const check = args.includes("--check");
const requested = args.find((a) => !a.startsWith("--"));

const pkg = JSON.parse(await readFile(files.pkg, "utf8"));
const versionTs = await readFile(files.version, "utf8");
const changelog = await readFile(files.changelog, "utf8");

const inVersionTs = /VERSION = "([^"]+)"/.exec(versionTs)?.[1];
const latestHeading = /^## \[(\d[^\]]*)\] - (\d{4}-\d{2}-\d{2})/m.exec(changelog);
const unreleased = /^## \[Unreleased\]\s*\n([\s\S]*?)(?=^## \[|\s*$)/m.exec(changelog);

/** @param {string} message */
function fail(message) {
  console.error(message);
  process.exit(1);
}

if (check) {
  if (pkg.version !== inVersionTs) {
    fail(`package.json is ${pkg.version} but src/version.ts says ${inVersionTs}`);
  }
  if (latestHeading?.[1] !== pkg.version) {
    fail(
      `CHANGELOG.md's latest release heading is ${latestHeading?.[1] ?? "missing"}, ` +
        `expected ${pkg.version}. Run \`pnpm bump ${pkg.version}\` or add the section.`,
    );
  }
  console.log(
    `version ${pkg.version} is consistent across package.json, src/version.ts, CHANGELOG.md`,
  );
  process.exit(0);
}

if (!requested || !SEMVER.test(requested)) {
  fail("Usage: pnpm bump <semver>   e.g. pnpm bump 0.2.0");
}
if (requested === pkg.version) {
  fail(`Already at ${requested}`);
}
if (!unreleased?.[1] || unreleased[1].trim() === "") {
  fail("CHANGELOG.md has no entries under ## [Unreleased]; write the release notes first.");
}

const today = new Date().toISOString().slice(0, 10);
const repo = "https://github.com/onetimesecret/onetime-js";

pkg.version = requested;
await writeFile(files.pkg, `${JSON.stringify(pkg, null, 2)}\n`);

await writeFile(
  files.version,
  `/** The package version. Kept in sync with package.json by scripts/bump-version.mjs. */\nexport const VERSION = ${JSON.stringify(requested)};\n`,
);

// Move the Unreleased notes under a dated heading and refresh the link table.
let next = changelog.replace(
  /^## \[Unreleased\]\s*\n/m,
  `## [Unreleased]\n\n## [${requested}] - ${today}\n\n`,
);
const previous = latestHeading?.[1];
next = next.replace(/^\[Unreleased\]: .*$/m, `[Unreleased]: ${repo}/compare/v${requested}...HEAD`);
const compare = previous
  ? `[${requested}]: ${repo}/compare/v${previous}...v${requested}`
  : `[${requested}]: ${repo}/releases/tag/v${requested}`;
next = next.replace(/^(\[Unreleased\]: .*)$/m, `$1\n${compare}`);
await writeFile(files.changelog, next);

console.log(`Bumped to ${requested}. Review the diff, then:
  git commit -am "Release ${requested}"
  git tag -a v${requested} -m "@onetimesecret/sdk ${requested}"
  git push origin main v${requested}`);
