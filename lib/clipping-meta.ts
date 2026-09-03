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
  "letterbox-accent",
  "letterbox-highlight",
  "daddy-wellness",
  "wide-band-karaoke",
  "blurred-fill",
] as const;

export type ClipStyle = (typeof CLIP_STYLES)[number];

export const CLIP_STYLE_LABELS: Record<ClipStyle, string> = {
  "tracked-karaoke": "Tracked + karaoke",
  "letterbox-simple": "Letterbox + simple title",
  "letterbox-accent": "Letterbox + accent title",
  "letterbox-highlight": "Letterbox + highlighter title",
  "daddy-wellness": "Daddy Wellness",
  "wide-band-karaoke": "Wide band + karaoke",
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
  "letterbox-accent": {
    framing: "Full 16:9 frame zoomed out, hard black bars top and bottom",
    font: "TikTok Sans 900 title / 800 captions",
    captions: "Static word-synced phrases in the bottom black bar, white",
    animation: "None — footage plays straight, no cuts and no motion",
  },
  "letterbox-highlight": {
    framing: "Full 16:9 frame zoomed out, hard black bars top and bottom",
    font: "Heavy condensed sans, uppercase",
    captions: "Static word-synced phrases in the bottom black bar, white",
    animation: "None — the title's yellow highlighter pill is the only accent",
  },
  "daddy-wellness": {
    framing: "Hard black letterbox, video full-width edge to edge",
    font: "Barlow Semi Condensed 700 with real bold-italic accents",
    captions: "Static word-synced amber phrases low inside the video",
    animation: "None — title persists the whole clip, captions cut in on the beat",
  },
  "wide-band-karaoke": {
    framing: "Zoomed-out full 16:9 band on a dark canvas so graphics stay intact",
    font: "Anton titles, karaoke captions",
    captions: "Word-by-word karaoke with an accent colour on the active word",
    animation: "Dead-space jump cuts, punch-in on cuts",
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

/* -------------------------------------------------------------------------
 * Review status: the triage lane a clip lands in AFTER it's been reviewed.
 *
 * The workflow this exists for: cut a large batch off one source, go through
 * them rating and leaving feedback, then sort the pile into three lanes so
 * the good ones are findable and the dead ones stop taking up attention.
 *
 * Distinct from `bucket` (hook / wisdom / highlight), which describes what
 * KIND of moment a clip is. This describes what happens to it next.
 * ---------------------------------------------------------------------- */

export const CLIP_REVIEW_STATUSES = ["review", "ready", "archived"] as const;
export type ClipReviewStatus = (typeof CLIP_REVIEW_STATUSES)[number];

export type ClipReviewStatusSpec = {
  value: ClipReviewStatus;
  label: string;
  /** What lands here and why. */
  meaning: string;
  /** Badge / tab colours. */
  bg: string;
  fg: string;
};

export const CLIP_REVIEW_STATUS_SPECS: readonly ClipReviewStatusSpec[] = [
  {
    value: "review",
    label: "Needs review",
    meaning: "Not judged yet, or judged and still needs changes before posting.",
    bg: "hsl(45 85% 52%)",
    fg: "#1a1a1a",
  },
  {
    value: "ready",
    label: "Good to go",
    meaning: "Cleared to post as-is.",
    bg: "hsl(130 85% 45%)",
    fg: "#ffffff",
  },
  {
    value: "archived",
    label: "Archive",
    meaning: "Out of the running. Kept, with its feedback, as a negative example.",
    bg: "hsl(0 0% 42%)",
    fg: "#ffffff",
  },
];

export const CLIP_REVIEW_STATUS_BY_VALUE: Record<
  ClipReviewStatus,
  ClipReviewStatusSpec
> = Object.fromEntries(
  CLIP_REVIEW_STATUS_SPECS.map((s) => [s.value, s]),
) as Record<ClipReviewStatus, ClipReviewStatusSpec>;

/** Unknown/legacy values fall back to the safe lane, never to "ready". */
export function clipReviewStatus(value: unknown): ClipReviewStatus {
  return CLIP_REVIEW_STATUSES.includes(value as ClipReviewStatus)
    ? (value as ClipReviewStatus)
    : "review";
}

export function clipReviewStatusLabel(value: unknown): string {
  return CLIP_REVIEW_STATUS_BY_VALUE[clipReviewStatus(value)].label;
}

/**
 * Where a rating alone says a clip belongs, so scoring a batch files it at
 * the same time instead of making you set two controls per clip.
 *
 * Only a 5 auto-clears to "good to go" — the user's scale is explicit that
 * only 5s are perfect. 1s and 2s auto-archive. 3s and 4s are salvageable, so
 * they stay in review where the feedback can be acted on. The lane is always
 * overridable by hand afterwards.
 */
export function suggestedReviewStatus(rating: number): ClipReviewStatus {
  if (rating === 5) return "ready";
  if (rating === 1 || rating === 2) return "archived";
  return "review";
}
