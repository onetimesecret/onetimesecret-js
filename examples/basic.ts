// End-to-end round trip against a real server: conceal a secret, read the
// receipt, reveal the secret, then confirm the receipt's state changed.
//
//   ONETIME_BASE_URL=https://eu.onetimesecret.com node examples/basic.ts
//
// Node 22.18+ runs the TypeScript directly; on earlier 22.x add
// --experimental-strip-types. Set ONETIME_CUSTOMER_EXTID and ONETIME_API_TOKEN
// to run as your account; without them the script is anonymous and uses the
// guest endpoints. Point ONETIME_BASE_URL at a self-hosted deployment to run
// against that instead.
import { OnetimeError, OnetimeSecret } from "../src/index.ts";

const client = new OnetimeSecret();
// Anonymous callers use the /guest/ endpoints; accounts use the regular ones.
const guest = !client.authenticated;

console.log(`server: ${client.baseUrl} (${guest ? "anonymous" : "authenticated"})`);

try {
  const created = await client.secrets.conceal({ secret: "hunter2", ttl: 300 }, { guest });
  const secretId = created.record.secret.identifier;
  const receiptId = created.record.receipt.identifier;
  console.log("secret:     ", secretId);
  console.log("receipt:    ", receiptId);
  console.log(
    "share link: ",
    client.shareUrl(secretId, { shareDomain: created.record.share_domain ?? undefined }),
  );

  const before = await client.receipts.get(receiptId, { guest });
  console.log("receipt state before reveal:", before.record.state);

  const revealed = await client.secrets.reveal(secretId, {}, { guest });
  console.log("revealed value:             ", revealed.record.secret_value);

  const after = await client.receipts.get(receiptId, { guest });
  console.log("receipt state after reveal: ", after.record.state);

  if (after.record.state === before.record.state) {
    throw new Error(`receipt state did not change (still ${after.record.state})`);
  }
  console.log("ok: receipt moved from", before.record.state, "to", after.record.state);
} catch (err) {
  if (err instanceof OnetimeError) {
    console.error(`${err.name}: ${err.message}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
