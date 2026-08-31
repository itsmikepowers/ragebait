export type MediaRef = {
  path: string;
  width: number;
  height: number;
};

const DIM_MIN = 1;
const DIM_MAX = 20000;

export function normalizeDimension(value: unknown): number | null {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (
    !Number.isFinite(num) ||
    !Number.isInteger(num) ||
    num < DIM_MIN ||
    num > DIM_MAX
  ) {
    return null;
  }
  return num;
}

/** Parses an optional {path, width, height} media object from raw input. */
export function parseOptionalMediaRef(
  value: unknown,
  pathPattern: RegExp,
): MediaRef | null | undefined {
  if (value == null) {
    return null;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const raw = value as { path?: unknown; width?: unknown; height?: unknown };
  if (typeof raw.path !== "string" || !pathPattern.test(raw.path)) {
    return undefined;
  }
  const width = normalizeDimension(raw.width);
  const height = normalizeDimension(raw.height);
  if (width === null || height === null) {
    return undefined;
  }
  return { path: raw.path, width, height };
}

/** Parses a required {path, width, height} media object from raw input. */
export function parseRequiredMediaRef(
  value: unknown,
  pathPattern: RegExp,
): MediaRef | undefined {
  if (value == null || typeof value !== "object") {
    return undefined;
  }
  const raw = value as { path?: unknown; width?: unknown; height?: unknown };
  if (typeof raw.path !== "string" || !pathPattern.test(raw.path)) {
    return undefined;
  }
  const width = normalizeDimension(raw.width);
  const height = normalizeDimension(raw.height);
  if (width === null || height === null) {
    return undefined;
  }
  return { path: raw.path, width, height };
}

export const IMAGE_CONTENT_TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export class MediaError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type ImageUploadPlan = {
  path: string;
  uploadUrl: string;
};

/**
 * Builds a presigned-PUT upload plan for a browser-uploaded image, under the
 * given R2 folder. Shared by account logo uploads and schedule thumbnails.
 */
export async function createImageUploadPlan(
  folder: string,
  sizeValue: unknown,
  contentTypeValue: unknown,
  maxBytes: number,
  deps: {
    ensureCors: () => Promise<void>;
    presignPut: (path: string) => string;
  },
): Promise<ImageUploadPlan> {
  const size =
    typeof sizeValue === "number"
      ? sizeValue
      : typeof sizeValue === "string"
        ? Number(sizeValue)
        : NaN;
  if (!Number.isFinite(size) || size <= 0) {
    throw new MediaError("Upload an image.", 400);
  }
  if (size > maxBytes) {
    throw new MediaError("That image is too large.", 400);
  }
  const contentType =
    typeof contentTypeValue === "string" ? contentTypeValue : "";
  const ext = IMAGE_CONTENT_TYPE_EXT[contentType];
  if (!ext) {
    throw new MediaError("Upload a PNG, JPEG, WEBP, or GIF image.", 400);
  }

  await deps.ensureCors();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  return { path, uploadUrl: deps.presignPut(path) };
}
