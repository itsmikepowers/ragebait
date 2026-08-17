import { AccountsManager } from "@/components/accounts-manager";

export default function AccountsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl tracking-tight">Accounts</h1>
      <p className="mt-2 text-muted">
        Shared profiles. Anyone in the dashboard can add, edit, or remove them.
      </p>

      <AccountsManager />
    </div>
  );
}
