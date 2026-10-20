// Round-trips a secret against a real server. Needs credentials:
//
//   ONETIME_BASE_URL=https://eu.onetimesecret.com \
//   ONETIME_CUSTOMER_EXTID=ur... ONETIME_API_TOKEN=... \
//   node examples/basic.ts            # Node 22.18+ runs TypeScript directly
//
// Against a local dev server, ONETIME_BASE_URL=http://localhost:3000 works too.
import { OnetimeError, OnetimeSecret } from "../src/index.ts";

const client = new OnetimeSecret();

try {
  const created = await client.secrets.conceal({ secret: "hunter2", ttl: 300 });
  console.log(
    "share link:",
    client.shareUrl(created.record.secret.identifier, {
      shareDomain: created.record.share_domain ?? undefined,
    }),
  );

  const receipt = await client.receipts.get(created.record.receipt.identifier);
  console.log("state before reveal:", receipt.record.state);

  const revealed = await client.secrets.reveal(created.record.secret.identifier);
  console.log("value:", revealed.record.secret_value);

  const after = await client.secrets.status(created.record.secret.identifier);
  console.log("state after reveal:", after.record.state);
} catch (err) {
  if (err instanceof OnetimeError) {
    console.error(`${err.name}: ${err.message}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
