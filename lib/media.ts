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
