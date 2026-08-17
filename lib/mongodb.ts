import { MongoClient } from "mongodb";

export type MongoConfig = {
  uri: string;
  database: "dev" | "staging" | "prod";
};

const globalForMongo = globalThis as typeof globalThis & {
  mongoClient?: MongoClient;
};

function parseConfig(raw: string): MongoConfig {
  const trimmed = raw.trim();
  if (trimmed.startsWith("mongodb")) {
    return { uri: trimmed, database: normalizeDatabase() };
  }

  const parsed = JSON.parse(trimmed) as {
    uri?: unknown;
    connectionString?: unknown;
    database?: unknown;
  };
  const uri = parsed.uri ?? parsed.connectionString;
  if (typeof uri !== "string" || !uri.startsWith("mongodb")) {
    throw new Error("MONGODB_CONFIG must include a MongoDB uri");
  }

  return {
    uri,
    database: normalizeDatabase(parsed.database),
  };
}

function normalizeDatabase(value?: unknown): MongoConfig["database"] {
  const fromConfig = typeof value === "string" ? value.toLowerCase() : "";
  const doppler = (
    process.env.DOPPLER_ENVIRONMENT ||
    process.env.DOPPLER_CONFIG ||
    ""
  ).toLowerCase();
  const vercel = (process.env.VERCEL_ENV || "").toLowerCase();
  const raw =
    fromConfig || doppler || vercel || process.env.NODE_ENV || "development";

  if (raw === "prd" || raw === "prod" || raw === "production") {
    return "prod";
  }
  if (raw === "stg" || raw === "staging" || raw === "preview") {
    return "staging";
  }
  return "dev";
}

export function getMongoConfig(): MongoConfig {
  const raw = process.env.MONGODB_CONFIG;
  if (!raw) {
    throw new Error("MONGODB_CONFIG is not set");
  }
  return parseConfig(raw);
}

export async function getDb() {
  const { uri, database } = getMongoConfig();
  if (!globalForMongo.mongoClient) {
    globalForMongo.mongoClient = new MongoClient(uri);
  }
  const client = globalForMongo.mongoClient;
  await client.connect();
  return client.db(database);
}
