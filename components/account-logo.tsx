import Image from "next/image";
import { buildCdnUrl } from "@/lib/cdn";
import { cn } from "@/lib/utils";

export type AccountLogo = {
  path: string;
  width: number;
  height: number;
} | null;

export function AccountLogoThumb({
  logo,
  name,
  size = 32,
  className,
}: {
  logo: AccountLogo;
  name: string;
  size?: number;
  className?: string;
}) {
  const src = logo ? buildCdnUrl(logo.path) : null;

  if (src) {
    return (
      <span
        className={cn(
          "inline-block shrink-0 overflow-hidden rounded-md bg-black/5",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt=""
          width={logo!.width}
          height={logo!.height}
          unoptimized
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-black/5 text-xs font-medium text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
