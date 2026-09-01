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

/** Tolerates legacy rows and unknown values without throwing. */
export function clipStyleLabel(value: string): string {
  return CLIP_STYLE_LABELS[value as ClipStyle] ?? value;
}
