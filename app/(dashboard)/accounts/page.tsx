import { accounts } from "@/lib/accounts";

export default function AccountsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl tracking-tight">Accounts</h1>
      <p className="mt-2 text-muted">
        Connect the profiles that get to post the bait.
      </p>

      <ul className="mt-8 divide-y divide-black/10 border-y border-black/10">
        {accounts.map((account) => (
          <li
            key={account.platform}
            className="flex items-center justify-between py-4"
          >
            <div>
              <p>{account.platform}</p>
              <p className="mt-1 text-sm text-muted">{account.handle}</p>
            </div>
            <span className="text-sm text-muted">{account.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
