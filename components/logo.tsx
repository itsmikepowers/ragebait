import Image from "next/image";
import icon from "@/app/icon.png";

export function Logo({
  size = 28,
  priority = false,
}: {
  size?: number;
  priority?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Image
        src={icon}
        alt=""
        width={size}
        height={size}
        className="shrink-0"
        unoptimized
        priority={priority}
      />
      <span className="font-logo text-[1.65em] leading-none lowercase">
        ragebait
      </span>
    </span>
  );
}
