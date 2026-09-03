"use client";

import { useRouter } from "next/navigation";
import { LuLogOut } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-black/5 py-3 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-sm">{value || "—"}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

/**
 * The only page a non-admin can reach. Deliberately plain: who you are, and a
 * way out. No product data, because a non-admin has no product access.
 */
export default function AccountPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  const role = user.isSuperAdmin ? "Owner" : user.isAdmin ? "Admin" : "Member";

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>

      <div className="mt-8 rounded-xl border border-black/10 px-4">
        <Row label="Name" value={user.name} />
        <Row label="Email" value={user.email} />
        <Row label="Role" value={role} />
        <Row label="Joined" value={formatDate(user.createdAt)} />
      </div>

      {!user.isAdmin ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Your account doesn&apos;t have dashboard access yet.
        </p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="mt-6 w-full"
        onClick={async () => {
          await logout();
          router.replace("/login");
        }}
      >
        <LuLogOut size={16} className="mr-2" aria-hidden />
        Log out
      </Button>
    </div>
  );
}
