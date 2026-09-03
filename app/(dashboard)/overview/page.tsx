"use client";

import { useAuth } from "@/lib/auth-context";

/**
 * The user-side landing page. Deliberately just a greeting — no stats, no data
 * fetch. Keeping it empty also means it makes no API call, so it renders the
 * same for a member with no grants as it does for an admin.
 */
export default function OverviewPage() {
  const { user } = useAuth();
  const firstName = (user?.name || "").split(" ")[0];

  return (
    <h1 className="text-2xl font-semibold tracking-tight">
      {firstName ? `Hey ${firstName}` : "Overview"}
    </h1>
  );
}
