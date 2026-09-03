"use client";

import Link from "next/link";
import { AsciiField } from "@/components/ascii-field";
import { Logo } from "@/components/logo";
import { useAuth } from "@/lib/auth-context";

/**
 * 404. Uses the same ASCII field as the landing page so a wrong URL still
 * lands somewhere that looks like the product rather than a framework default.
 *
 * The way back adapts to the session: signed in goes to the dashboard, signed
 * out goes to sign-in, so the button is never a dead end.
 */
export default function NotFound() {
  const { firebaseUser, loading } = useAuth();

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      <AsciiField />

      <div className="relative flex flex-1 flex-col">
        {/* Same inset as the dashboard sidebar, so the mark doesn't shift. */}
        <header className="flex items-center px-5 py-6">
          <Link href="/" aria-label="ragebait">
            <Logo />
          </Link>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
          <h1 className="font-logo text-[clamp(6rem,22vw,16rem)] leading-[0.82] tracking-tight">
            404
          </h1>

          <p className="mt-6 text-lg text-muted-foreground">
            That page doesn&apos;t exist.
          </p>

          <div className="mt-10 flex h-11 items-center">
            {loading ? null : (
              <Link
                href={firebaseUser ? "/overview" : "/"}
                className="inline-flex h-11 items-center rounded-lg bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-85"
              >
                {firebaseUser ? "Back to dashboard" : "Back home"}
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
