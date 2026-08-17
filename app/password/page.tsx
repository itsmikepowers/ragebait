"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { AUTH_STORAGE_KEY } from "@/lib/auth";

export default function PasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (localStorage.getItem(AUTH_STORAGE_KEY) === "true") {
      router.replace("/home");
      return;
    }
    setChecking(false);
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const response = await fetch("/api/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = (await response.json()) as { authenticated?: boolean };

    if (!response.ok || !data.authenticated) {
      setError("Wrong password.");
      return;
    }

    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    router.replace("/home");
  }

  if (checking) {
    return null;
  }

  return (
    <div className="flex h-[100vh] flex-col items-center justify-center px-6">
      <Logo />
      <form onSubmit={onSubmit} className="mt-10 flex w-full max-w-xs flex-col gap-3">
        <input
          type="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoFocus
          className="border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/40"
        />
        <button type="submit" className="bg-black px-3 py-2 text-sm text-white">
          Continue
        </button>
        {error ? <p className="text-sm text-muted">{error}</p> : null}
      </form>
    </div>
  );
}
