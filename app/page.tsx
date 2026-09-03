"use client";

import Link from "next/link";
import { AsciiField } from "@/components/ascii-field";
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
        <header className="flex items-center justify-between px-6 py-6 md:px-10">
          <span className="font-logo text-2xl lowercase leading-none">
            ragebait
          </span>
          <Link
            href="/docs"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Docs
          </Link>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
          <h1 className="font-logo text-[clamp(4rem,17vw,13rem)] lowercase leading-[0.82] tracking-tight">
            ragebait
          </h1>

          <p className="mt-6 max-w-md text-balance text-lg text-muted-foreground md:text-xl">
            We make you mad.
          </p>

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
