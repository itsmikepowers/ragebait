import { DashboardAuth } from "@/components/dashboard-auth";
import { DashboardShell } from "@/components/dashboard-shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardAuth>
      <DashboardShell>{children}</DashboardShell>
    </DashboardAuth>
  );
}
