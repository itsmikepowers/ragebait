import { cn } from "@/lib/utils";

/**
 * Virality score badge. Colour ramps red (0) -> amber (5) -> green (10) so a
 * clip's strength reads at a glance in a dense grid. Always renders one
 * decimal ("8.0", not "8") so the badge width stays stable across a wall of
 * cards.
 */
function scoreColor(score: number): { bg: string; fg: string } {
  const clamped = Math.max(0, Math.min(10, score));
  // 0 -> hue 0 (red), 5 -> hue 45 (amber), 10 -> hue 130 (green)
  const hue = clamped <= 5 ? (clamped / 5) * 45 : 45 + ((clamped - 5) / 5) * 85;
  // Mid-range ambers need a darker text colour to stay legible.
  const light = hue > 30 && hue < 80;
  return {
    bg: `hsl(${hue} 85% ${light ? 52 : 45}%)`,
    fg: light ? "#1a1a1a" : "#ffffff",
  };
}

export function ScoreBadge({
  score,
  className,
  size = "sm",
}: {
  score: number;
  className?: string;
  size?: "sm" | "md";
}) {
  if (!score) {
    return null;
  }
  const { bg, fg } = scoreColor(score);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold tabular-nums",
        size === "md"
          ? "min-w-9 px-1.5 py-0.5 text-sm"
          : "min-w-7 px-1 py-0.5 text-[11px]",
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
      title={`Virality score ${score.toFixed(1)} / 10`}
    >
      {score.toFixed(1)}
    </span>
  );
}
