import { DashboardAuth } from "@/components/dashboard-auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardDataProvider } from "@/lib/dashboard-data";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardAuth>
      <DashboardDataProvider>
        <DashboardShell>{children}</DashboardShell>
      </DashboardDataProvider>
    </DashboardAuth>
  );
}
