"use client";

import { FormEvent, useEffect, useState } from "react";

type Account = {
  id: string;
  name: string;
};

export function AccountsManager() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadAccounts() {
    const response = await fetch("/api/accounts");
    const data = (await response.json()) as {
      accounts?: Account[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || "Could not load accounts.");
    }
    setAccounts(data.accounts ?? []);
  }

  useEffect(() => {
    loadAccounts()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load accounts.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await response.json()) as { account?: Account; error?: string };
    if (!response.ok || !data.account) {
      setError(data.error || "Could not add that account.");
      return;
    }
    setAccounts((current) => [...current, data.account!]);
    setName("");
  }

  async function onSave(id: string) {
    setError("");
    const response = await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingName }),
    });
    const data = (await response.json()) as { account?: Account; error?: string };
    if (!response.ok || !data.account) {
      setError(data.error || "Could not update that account.");
      return;
    }
    setAccounts((current) =>
      current.map((account) => (account.id === id ? data.account! : account)),
    );
    setEditingId(null);
  }

  async function onRemove(id: string) {
    setError("");
    const response = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not remove that account.");
      return;
    }
    setAccounts((current) => current.filter((account) => account.id !== id));
    if (editingId === id) {
      setEditingId(null);
    }
  }

  return (
    <div className="mt-8">
      <form onSubmit={onAdd} className="flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Account name"
          maxLength={80}
          className="min-w-0 flex-1 border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/40"
        />
        <button type="submit" className="bg-black px-3 py-2 text-sm text-white">
          Add
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-muted">{error}</p> : null}

      {loading ? (
        <p className="mt-8 text-sm text-muted">Loading accounts.</p>
      ) : accounts.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No accounts yet.</p>
      ) : (
        <ul className="mt-8 divide-y divide-black/10 border-y border-black/10">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between gap-4 py-4"
            >
              {editingId === account.id ? (
                <input
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  autoFocus
                  maxLength={80}
                  className="min-w-0 flex-1 border border-black/10 px-3 py-1.5 text-sm outline-none focus:border-black/40"
                />
              ) : (
                <p className="min-w-0 flex-1">{account.name}</p>
              )}
              <div className="flex shrink-0 gap-4 text-sm text-muted">
                {editingId === account.id ? (
                  <>
                    <button type="button" onClick={() => onSave(account.id)}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(account.id);
                        setEditingName(account.name);
                        setError("");
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => onRemove(account.id)}>
                      Remove
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
