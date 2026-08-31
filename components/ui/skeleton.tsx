import { cn } from "@/lib/utils";

/** Simple pulsing placeholder block for loading states. */
export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-black/[0.06]", className)}
      {...props}
    />
  );
}
