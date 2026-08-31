import Image from "next/image";
import { buildCdnUrl } from "@/lib/cdn";
import { cn } from "@/lib/utils";

export type MediaThumbRef = {
  path: string;
  width: number;
  height: number;
} | null;

/**
 * Fixed-size, rounded-square, cover-fit media thumbnail. Height and width
 * are always locked to `size` regardless of the source media's aspect
 * ratio, so table rows never grow/shrink based on content.
 */
export function MediaThumb({
  media,
  fallbackLabel,
  size = 32,
  className,
}: {
  media: MediaThumbRef;
  fallbackLabel: string;
  size?: number;
  className?: string;
}) {
  const src = media ? buildCdnUrl(media.path) : null;

  if (src) {
    return (
      <span
        className={cn(
          "block shrink-0 overflow-hidden rounded-md bg-black/5",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt=""
          width={media!.width}
          height={media!.height}
          unoptimized
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  const initial = fallbackLabel.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-black/5 text-xs font-medium text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
