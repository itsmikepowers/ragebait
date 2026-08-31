"use client";

import { FormEvent, useEffect, useState } from "react";
import { LuPencil, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Account = {
  id: string;
  name: string;
  username: string;
};

type AccountDraft = {
  name: string;
  username: string;
};

const emptyDraft: AccountDraft = {
  name: "",
  username: "",
};

function AccountFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: AccountDraft;
  onChange: (next: AccountDraft) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="Name"
          maxLength={80}
          required
          autoFocus
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-username`}>Username</label>
        <Input
          id={`${idPrefix}-username`}
          value={value.username}
          onChange={(event) =>
            onChange({ ...value, username: event.target.value })
          }
          placeholder="Username"
          maxLength={80}
          required
        />
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [editDraft, setEditDraft] = useState<AccountDraft>(emptyDraft);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeAccount, setRemoveAccount] = useState<Account | null>(null);
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

  function onAddOpenChange(next: boolean) {
    setAddOpen(next);
    if (next) {
      setError("");
    }
  }

  function onEditOpenChange(next: boolean) {
    setEditOpen(next);
    if (next) {
      setError("");
    }
  }

  function onRemoveOpenChange(next: boolean) {
    setRemoveOpen(next);
    if (next) {
      setError("");
    }
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = (await response.json()) as { account?: Account; error?: string };
    if (!response.ok || !data.account) {
      setError(data.error || "Could not add that account.");
      return;
    }
    setAccounts((current) => [...current, data.account!]);
    setDraft(emptyDraft);
    setAddOpen(false);
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editAccount) {
      return;
    }
    setError("");
    const response = await fetch(`/api/accounts/${editAccount.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    const data = (await response.json()) as { account?: Account; error?: string };
    if (!response.ok || !data.account) {
      setError(data.error || "Could not update that account.");
      return;
    }
    setAccounts((current) =>
      current.map((account) =>
        account.id === editAccount.id ? data.account! : account,
      ),
    );
    setEditOpen(false);
  }

  async function onRemove() {
    if (!removeAccount) {
      return;
    }
    setError("");
    const response = await fetch(`/api/accounts/${removeAccount.id}`, {
      method: "DELETE",
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not remove that account.");
      return;
    }
    setAccounts((current) =>
      current.filter((account) => account.id !== removeAccount.id),
    );
    setRemoveOpen(false);
  }

  const dialogOpen = addOpen || editOpen || removeOpen;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <Dialog open={addOpen} onOpenChange={onAddOpenChange}>
          <DialogTrigger asChild>
            <Button type="button">Add account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add account</DialogTitle>
              <DialogDescription>
                Shared profile. Anyone in the dashboard can use it.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onAdd} className="grid gap-4">
              <AccountFields idPrefix="add-account" value={draft} onChange={setDraft} />
              {error ? (
                <p className="text-sm text-muted-foreground">{error}</p>
              ) : null}
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={!draft.name.trim() || !draft.username.trim()}
                >
                  Add
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && !dialogOpen ? (
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      ) : null}

      {loading ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading accounts.
        </p>
      ) : accounts.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No accounts yet.
        </p>
      ) : (
        <div className="mt-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead className="w-0 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    @{account.username}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${account.name}`}
                        onClick={() => {
                          setError("");
                          setEditAccount(account);
                          setEditDraft({
                            name: account.name,
                            username: account.username,
                          });
                          setEditOpen(true);
                        }}
                      >
                        <LuPencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${account.name}`}
                        onClick={() => {
                          setError("");
                          setRemoveAccount(account);
                          setRemoveOpen(true);
                        }}
                      >
                        <LuTrash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={onEditOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit account</DialogTitle>
            <DialogDescription>
              Update this shared profile.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSave} className="grid gap-4">
            <AccountFields
              idPrefix="edit-account"
              value={editDraft}
              onChange={setEditDraft}
            />
            {error ? (
              <p className="text-sm text-muted-foreground">{error}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="submit"
                disabled={!editDraft.name.trim() || !editDraft.username.trim()}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={onRemoveOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove account</DialogTitle>
            <DialogDescription>
              Remove {removeAccount?.name}? This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="text-sm text-muted-foreground">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onRemove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
