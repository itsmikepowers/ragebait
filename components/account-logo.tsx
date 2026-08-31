import { MediaThumb, type MediaThumbRef } from "@/components/media-thumb";

export type AccountLogo = MediaThumbRef;

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
  return (
    <MediaThumb
      media={logo}
      fallbackLabel={name}
      size={size}
      className={className}
    />
  );
}
