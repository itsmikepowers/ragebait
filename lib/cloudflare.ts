import { createHash, createHmac } from "crypto";

const R2_REGION = "auto";
const R2_SERVICE = "s3";
const MAX_R2_UPLOAD_ATTEMPTS = 4;
const R2_UPLOAD_RETRY_BACKOFF_MS = 750;

export type CloudflareConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

export function getCloudflareConfig(): CloudflareConfig {
  const raw = process.env.CLOUDFLARE_CONFIG;
  if (!raw) {
    throw new Error("CLOUDFLARE_CONFIG is not set");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("CLOUDFLARE_CONFIG must be JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("CLOUDFLARE_CONFIG must be JSON");
  }

  const config = parsed as Record<string, unknown>;
  const accountId = config.accountId;
  const accessKeyId = config.accessKeyId;
  const secretAccessKey = config.secretAccessKey;
  const bucketName = config.bucketName;
  if (
    typeof accountId !== "string" ||
    !accountId ||
    typeof accessKeyId !== "string" ||
    !accessKeyId ||
    typeof secretAccessKey !== "string" ||
    !secretAccessKey ||
    typeof bucketName !== "string" ||
    !bucketName
  ) {
    throw new Error(
      "CLOUDFLARE_CONFIG must include accountId, accessKeyId, secretAccessKey, and bucketName",
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function getSignatureKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function encodeR2ObjectKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function signedR2Request(
  config: CloudflareConfig,
  method: "PUT" | "DELETE",
  objectKey: string,
  body?: Buffer,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const encodedKey = encodeR2ObjectKey(objectKey);
  const url = `https://${host}/${config.bucketName}/${encodedKey}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body ?? "");

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders,
  };

  const signedHeaderNames = Object.keys(headers).sort();
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");

  const canonicalRequest = [
    method,
    `/${config.bucketName}/${encodedKey}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(
    config.secretAccessKey,
    dateStamp,
    R2_REGION,
    R2_SERVICE,
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(",");

  const fetchHeaders: Record<string, string> = {
    Authorization: authorization,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders,
  };

  return fetch(url, {
    method,
    headers: fetchHeaders,
    body: body ? new Uint8Array(body) : undefined,
    signal: AbortSignal.timeout(600_000),
  });
}

function isRetryableR2Error(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const codes = new Set<string>();
  const collectCode = (value: unknown) => {
    if (value instanceof Error) {
      const code = (value as NodeJS.ErrnoException).code;
      if (code) {
        codes.add(code);
      }
      if (value.cause) {
        collectCode(value.cause);
      }
    }
  };
  collectCode(error);

  const message = error.message.toLowerCase();
  return (
    codes.has("ECONNRESET") ||
    codes.has("ETIMEDOUT") ||
    codes.has("EPIPE") ||
    codes.has("UND_ERR_SOCKET") ||
    codes.has("UND_ERR_CONNECT_TIMEOUT") ||
    message.includes("fetch failed") ||
    message.includes("other side closed") ||
    message.includes("socket")
  );
}

async function signedR2PutWithRetry(
  config: CloudflareConfig,
  path: string,
  file: Buffer,
  extraHeaders: Record<string, string>,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_R2_UPLOAD_ATTEMPTS; attempt++) {
    try {
      const response = await signedR2Request(
        config,
        "PUT",
        path,
        file,
        extraHeaders,
      );
      if (response.ok || response.status < 500) {
        return response;
      }

      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(
        `Cloudflare upload failed (${response.status}): ${errorText}`,
      );
    } catch (error) {
      lastError = error;
      const retryable =
        isRetryableR2Error(error) ||
        (error instanceof Error &&
          error.message.includes("Cloudflare upload failed (5"));
      if (!retryable || attempt >= MAX_R2_UPLOAD_ATTEMPTS) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, R2_UPLOAD_RETRY_BACKOFF_MS * attempt),
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Cloudflare upload failed");
}

export async function uploadFileToCloudflare(
  file: Buffer,
  folder: string,
  fileName: string,
  contentType: string,
): Promise<{ path: string }> {
  const config = getCloudflareConfig();
  const path = `${folder}/${fileName}`;
  const response = await signedR2PutWithRetry(config, path, file, {
    "cache-control": "public, max-age=31536000, immutable",
    "content-disposition": "inline",
    "content-type": contentType,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloudflare upload failed: ${errorText}`);
  }
  return { path };
}

export async function deleteFileFromCloudflare(path: string): Promise<void> {
  const config = getCloudflareConfig();
  const response = await signedR2Request(config, "DELETE", path);
  if (!response.ok && response.status !== 404) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloudflare delete failed: ${errorText}`);
  }
}
