/**
 * One-off reconciliation: mark schedule items as posted that are ALREADY live
 * on Instagram but still carry posted:false (nothing ever called /api/finalize).
 *
 * Safety: operates ONLY on explicit ids passed in ALLOW, never on a query.
 * Dry-run by default; pass --apply to write.
 */
import { MongoClient, ObjectId } from "mongodb";

// Verified live on instagram (HTTP 200) before writing this list.
const ALLOW = [
  { id: "6a95b556e1fdeef10928cc65", url: "https://www.instagram.com/p/DcsiTdXB0Xb/" },
  { id: "6a95b539457975cc358e7100", url: "https://www.instagram.com/p/DctjVTyB2Rz/" },
  { id: "6a95f93078babc781b334b3b", url: "https://www.instagram.com/p/DcuGFzFhu2A/" },
];

const apply = process.argv.includes("--apply");

function dbNameFromEnv() {
  const raw = (
    process.env.DOPPLER_ENVIRONMENT ||
    process.env.DOPPLER_CONFIG ||
    process.env.VERCEL_ENV ||
    "dev"
  ).toLowerCase();
  if (raw === "prd" || raw === "prod" || raw === "production") return "prod";
  if (raw === "stg" || raw === "staging" || raw === "preview") return "staging";
  return "dev";
}

function uriFromEnv() {
  const raw = process.env.MONGODB_CONFIG;
  if (!raw) throw new Error("MONGODB_CONFIG is not set");
  const t = raw.trim();
  if (t.startsWith("mongodb")) return t;
  const parsed = JSON.parse(t);
  const uri = parsed.uri ?? parsed.connectionString;
  if (typeof uri !== "string") throw new Error("no uri in MONGODB_CONFIG");
  return uri;
}

const client = new MongoClient(uriFromEnv());
await client.connect();
const db = client.db(dbNameFromEnv());
console.log(`db: ${dbNameFromEnv()}  mode: ${apply ? "APPLY" : "DRY-RUN"}`);

const col = db.collection("schedule");
for (const { id, url } of ALLOW) {
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) {
    console.log(`  ${id}  MISSING — skipped`);
    continue;
  }
  if (doc.posted === true) {
    console.log(`  ${id}  already posted:true — skipped`);
    continue;
  }
  console.log(
    `  ${id}  posted:false -> true  (${doc.scheduledDate?.toISOString?.() ?? "?"}) url=${doc.instagramPostUrl || url}`,
  );
  if (apply) {
    await col.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          posted: true,
          instagramPostUrl: doc.instagramPostUrl || url,
          postedAt: doc.scheduledDate ?? new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }
}

await client.close();
console.log(apply ? "done — written" : "done — dry run, nothing written");
