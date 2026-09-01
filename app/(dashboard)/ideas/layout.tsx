"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const VERTICALS = [
  { value: "funny-tshirts", label: "Funny t-shirts" },
  { value: "novelty-swimwear", label: "Novelty swimwear" },
];

const TABS = [
  { href: "/ideas/content", label: "Content" },
  { href: "/ideas/accounts", label: "Accounts" },
];

function IdeasNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vertical = searchParams.get("vertical") ?? "funny-tshirts";

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        {VERTICALS.map((item) => {
          const active = vertical === item.value;
          return (
            <Link
              key={item.value}
              href={`${pathname}?vertical=${item.value}`}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-5 flex gap-1 border-b">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={`${tab.href}?vertical=${vertical}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}

export default function IdeasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ideas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Research by product line — reference posts worth reworking and accounts
          worth mining.
        </p>
      </div>

      <Suspense fallback={<div className="mt-4 h-24" />}>
        <IdeasNav />
      </Suspense>

      <div className="mt-6 flex-1">{children}</div>
    </div>
  );
}
