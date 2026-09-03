"use client";

import Link from "next/link";
import { AsciiField } from "@/components/ascii-field";
import { Logo } from "@/components/logo";
import { useAuth } from "@/lib/auth-context";

/**
 * Public landing page.
 *
 * Deliberately NOT a redirect anymore — this is the front door, so a signed-in
 * visitor sees it too and just gets a different call to action. One idea, one
 * screen, no invented features or metrics; the ASCII field carries the interest
 * so the copy doesn't have to pad itself out.
 */
export default function LandingPage() {
  const { firebaseUser, loading } = useAuth();

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      <AsciiField />

      {/* Everything below sits above the canvas. */}
      <div className="relative flex flex-1 flex-col">
        <header className="flex items-center px-6 py-6 md:px-10">
          <Link href="/" aria-label="ragebait">
            <Logo priority />
          </Link>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
          <h1 className="font-logo text-[clamp(2rem,7vw,5rem)] lowercase leading-[0.9] tracking-tight text-muted-foreground">
            media + scale
          </h1>

          {/* Reserve the row's height while auth resolves so the CTA doesn't
              shift the whole composition when it appears. */}
          <div className="mt-10 flex h-11 items-center">
            {loading ? null : (
              <Link
                href={firebaseUser ? "/overview" : "/login"}
                className="inline-flex h-11 items-center rounded-lg bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-85"
              >
                {firebaseUser ? "Open dashboard" : "Sign in"}
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
