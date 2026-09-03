"use client";

import { useEffect } from "react";
import { LuCalendar, LuCircleCheck } from "react-icons/lu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { useDashboardData } from "@/lib/dashboard-data";

function Stat({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-black/10 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon size={15} className="shrink-0" />
        {label}
      </div>
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-9 w-12" />
        ) : (
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
        )}
      </div>
    </div>
  );
}

/**
 * The user-side landing page. Every signed-in account can reach this, admin or
 * not, so it must never show anything an admin-only API would refuse — its
 * numbers come from the caller's own schedule scope, not the whole system.
 */
export default function OverviewPage() {
  const { user } = useAuth();
  const { schedule } = useDashboardData();
  const { data, loading, error, load } = schedule;

  // Admins get real numbers; a member's schedule call would 403, so don't make
  // it — an empty state is the honest render for someone with no access.
  const canLoad = user?.isAdmin === true;

  useEffect(() => {
    if (canLoad) {
      load();
    }
  }, [canLoad, load]);

  const upcoming = canLoad
    ? data.filter((item) => !item.posted && new Date(item.scheduledDate) > new Date())
        .length
    : 0;
  const posted = canLoad ? data.filter((item) => item.posted).length : 0;

  const firstName = (user?.name || "").split(" ")[0];

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <h1 className="text-2xl font-semibold tracking-tight">
        {firstName ? `Hey ${firstName}` : "Overview"}
      </h1>

      {error && canLoad ? (
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      ) : null}

      {canLoad ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat
            label="Scheduled"
            value={upcoming}
            icon={LuCalendar}
            loading={loading}
          />
          <Stat
            label="Posted"
            value={posted}
            icon={LuCircleCheck}
            loading={loading}
          />
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">
          You&apos;re signed in. Nothing has been shared with your account yet.
        </p>
      )}
    </div>
  );
}
