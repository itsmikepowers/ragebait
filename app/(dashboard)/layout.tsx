import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardDataProvider } from "@/lib/dashboard-data";

/**
 * AuthProvider lives in the root layout so /login can use it too; the shell is
 * what enforces "signed in, and admin for anything past /account".
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardDataProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardDataProvider>
  );
}
