"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FcGoogle } from "react-icons/fc";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";

/**
 * Sign in / sign up. Anyone may create an account — access to the real tabs is
 * decided afterwards by the admin allow-list, not by who can register.
 */
export default function LoginPage() {
  const router = useRouter();
  const { firebaseUser, loading, login, signup, signInWithGoogle, resetPassword } =
    useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && firebaseUser) {
      router.replace("/overview");
    }
  }, [firebaseUser, loading, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Use at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        await signup(email, password);
      } else {
        await login(email, password);
      }
      router.replace("/overview");
    } catch {
      setError(
        mode === "signup"
          ? "Could not create that account."
          : "Wrong email or password.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await signInWithGoogle();
      router.replace("/overview");
    } catch {
      setError("Could not sign in with Google.");
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    setError("");
    setNotice("");
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    try {
      await resetPassword(email);
      setNotice("Password reset email sent.");
    } catch {
      setError("Could not send a reset email.");
    }
  }

  // Render the form while auth is still resolving — a blank first paint on the
  // sign-in page is worse than a form that redirects a moment later. Only hide
  // it once we know there's a session, since the redirect is already running.
  if (firebaseUser) {
    return null;
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
      <Logo priority />

      <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onGoogle}
          disabled={busy}
          className="w-full"
        >
          <FcGoogle className="mr-2 size-4" aria-hidden />
          Continue with Google
        </Button>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-black/10" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-2 text-xs text-muted-foreground">
              or
            </span>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Input
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            autoComplete="email"
            autoFocus
            className="h-10 rounded-lg"
          />
          <Input
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            className="h-10 rounded-lg"
          />
          <Button type="submit" disabled={busy} className="h-10 w-full">
            {mode === "signup" ? "Create account" : "Continue"}
          </Button>
        </form>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : notice ? (
          <p className="text-sm text-muted-foreground">{notice}</p>
        ) : null}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => {
              setMode(mode === "signup" ? "login" : "signup");
              setError("");
              setNotice("");
            }}
          >
            {mode === "signup" ? "I have an account" : "Create an account"}
          </button>
          {mode === "login" ? (
            <button
              type="button"
              className="hover:text-foreground"
              onClick={onReset}
            >
              Forgot password
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
