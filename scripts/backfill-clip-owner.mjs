#!/usr/bin/env node
/**
 * Stamp existing clipping rows with the owner's userId.
 *
 * Everything created before user submissions existed has userId "" and would
 * otherwise look orphaned in an owner-scoped view. This assigns them all to
 * SUPER_ADMIN_EMAIL's user row.
 *
 * Dry by default; pass --apply to write. Run under Doppler:
 *   doppler run -c prd -- node scripts/backfill-clip-owner.mjs --apply
 */
import { MongoClient } from "mongodb";

const APPLY = process.argv.includes("--apply");

function database() {
  const raw = (
    process.env.DOPPLER_ENVIRONMENT ||
    process.env.DOPPLER_CONFIG ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  ).toLowerCase();
  if (["prd", "prod", "production"].includes(raw)) return "prod";
  if (["stg", "staging", "preview"].includes(raw)) return "staging";
  return "dev";
}

const raw = process.env.MONGODB_CONFIG;
if (!raw) {
  console.error("MONGODB_CONFIG is not set — run under `doppler run`.");
  process.exit(1);
}
const config = raw.trim().startsWith("{")
  ? JSON.parse(raw)
  : { uri: raw.trim() };
const uri = config.uri || config.connectionString;
const dbName = config.database || database();

const ownerEmail = (process.env.SUPER_ADMIN_EMAIL || "")
  .split(",")[0]
  .trim()
  .toLowerCase();
if (!ownerEmail) {
  console.error("SUPER_ADMIN_EMAIL is not set.");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const owner = await db.collection("users").findOne({ email: ownerEmail });
if (!owner) {
  console.error(
    `No user row for ${ownerEmail} in "${dbName}". Sign in once so the row exists, then re-run.`,
  );
  await client.close();
  process.exit(1);
}
const ownerId = owner._id.toHexString();

const clipping = db.collection("clipping");
const missing = await clipping.countDocuments({
  $or: [{ userId: { $exists: false } }, { userId: "" }],
});
const total = await clipping.countDocuments({});

console.log(`database:     ${dbName}`);
console.log(`owner:        ${ownerEmail} -> ${ownerId}`);
console.log(`clipping rows: ${total} total, ${missing} without a userId`);

if (missing === 0) {
  console.log("nothing to do.");
} else if (!APPLY) {
  console.log(`\nDRY RUN — would stamp ${missing} rows. Re-run with --apply.`);
} else {
  const result = await clipping.updateMany(
    { $or: [{ userId: { $exists: false } }, { userId: "" }] },
    { $set: { userId: ownerId, updatedAt: new Date() } },
  );
  console.log(`\nstamped ${result.modifiedCount} rows.`);
  const left = await clipping.countDocuments({
    $or: [{ userId: { $exists: false } }, { userId: "" }],
  });
  console.log(`remaining without a userId: ${left}`);
}

await client.close();
