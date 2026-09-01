/**
 * Clip edit styles — how a clip was cut and rendered.
 *
 * Client-safe: constants and label maps only, NO database imports, so both
 * `lib/clipping.ts` (server) and client components can read the same list.
 * `lib/clipping.ts` re-exports these so existing importers keep working.
 */

export const CLIP_STYLES = [
  "tracked-karaoke",
  "letterbox-simple",
  "blurred-fill",
] as const;

export type ClipStyle = (typeof CLIP_STYLES)[number];

export const CLIP_STYLE_LABELS: Record<ClipStyle, string> = {
  "tracked-karaoke": "Tracked + karaoke",
  "letterbox-simple": "Letterbox + simple title",
  "blurred-fill": "Blurred fill",
};

/**
 * What each style actually does, so the dashboard can explain an edit without
 * anyone having to open the file and look.
 */
export type ClipStyleSpec = {
  /** How the 9:16 frame is filled. */
  framing: string;
  /** Typeface used for burned-in text. */
  font: string;
  /** How captions behave on screen. */
  captions: string;
  /** Motion, transitions, and cutting. */
  animation: string;
};

export const CLIP_STYLE_SPECS: Record<ClipStyle, ClipStyleSpec> = {
  "tracked-karaoke": {
    framing: "Subject-tracked 9:16 crop, no background fill",
    font: "TikTok Sans 900",
    captions: "Word-by-word karaoke, active word in accent colour with a scale pop",
    animation: "Adaptive dead-space removal, hard jump cuts, punch-in and flash on cuts",
  },
  "letterbox-simple": {
    framing: "Full 16:9 frame zoomed out, hard black bars top and bottom",
    font: "TikTok Sans 900 title / 800 captions",
    captions: "Static word-synced phrases in the bottom black bar, white",
    animation: "None — footage plays straight, no cuts and no motion",
  },
  "blurred-fill": {
    framing: "Blurred, darkened copy of the frame behind a centred video band",
    font: "Arial Bold / system sans",
    captions: "Static phrases on a translucent rounded plate over the video",
    animation: "Slow drifting punch-in, amber hook pill for the first ~2.6s, progress bar",
  },
};

/**
 * Spec fields the dashboard actually renders, in display order.
 *
 * `animation` is deliberately absent: it stays in `CLIP_STYLE_SPECS` as
 * metadata (and keeps being generated for every style), but is not surfaced
 * on clip cards or dialogs. Any UI showing a style spec should map over this
 * list rather than hard-coding its own row set.
 */
export const CLIP_STYLE_SPEC_FIELDS = [
  ["Framing", "framing"],
  ["Font", "font"],
  ["Captions", "captions"],
] as const satisfies ReadonlyArray<readonly [string, keyof ClipStyleSpec]>;

/** Tolerates legacy rows and unknown values without throwing. */
export function clipStyleLabel(value: string): string {
  return CLIP_STYLE_LABELS[value as ClipStyle] ?? value;
}

/* -------------------------------------------------------------------------
 * Human review: "would I post this?"
 *
 * Deliberately SEPARATE from `score` (the bot's 0-10 virality guess). This is
 * the owner's own 1-5 verdict plus free-text feedback, and it is the input a
 * re-render reads to know what to change. 0 means "not reviewed yet".
 * ---------------------------------------------------------------------- */

export const CLIP_RATING_VALUES = [1, 2, 3, 4, 5] as const;
export type ClipRating = (typeof CLIP_RATING_VALUES)[number];

export type ClipRatingSpec = {
  value: ClipRating;
  /** Short label for the picker's tooltip / legend. */
  label: string;
  /** What this rating means, in the owner's own words. */
  meaning: string;
};

export const CLIP_RATINGS: readonly ClipRatingSpec[] = [
  {
    value: 1,
    label: "Unusable",
    meaning: "Would not post. Wrong moment or wrong edit — start over.",
  },
  {
    value: 2,
    label: "Needs significant improvement",
    meaning: "The idea is there but the execution needs major rework.",
  },
  {
    value: 3,
    label: "Passes, needs lots of changes",
    meaning: "Postable in principle, but lots would have to change first.",
  },
  {
    value: 4,
    label: "Almost there",
    meaning: "Close. Needs a slight change and it would be ready.",
  },
  {
    value: 5,
    label: "Would post",
    meaning: "Perfect as-is. Ready to post with no changes.",
  },
] as const;

export const CLIP_RATING_BY_VALUE: Record<ClipRating, ClipRatingSpec> =
  Object.fromEntries(CLIP_RATINGS.map((r) => [r.value, r])) as Record<
    ClipRating,
    ClipRatingSpec
  >;

/** "" when unrated, so callers can render nothing rather than a fake label. */
export function clipRatingLabel(value: number): string {
  return CLIP_RATING_BY_VALUE[value as ClipRating]?.label ?? "";
}

/**
 * Colour ramp for a 1-5 rating: red (1) -> amber (3) -> green (5).
 * Mirrors `ScoreBadge` so the two numbers read consistently side by side,
 * but stays a separate function because the scales differ (1-5 vs 0-10).
 */
export function clipRatingColor(value: number): { bg: string; fg: string } {
  const clamped = Math.max(1, Math.min(5, value));
  const t = (clamped - 1) / 4; // 0..1
  const hue = t <= 0.5 ? (t / 0.5) * 45 : 45 + ((t - 0.5) / 0.5) * 85;
  const light = hue > 30 && hue < 80;
  return {
    bg: `hsl(${hue} 85% ${light ? 52 : 45}%)`,
    fg: light ? "#1a1a1a" : "#ffffff",
  };
}
