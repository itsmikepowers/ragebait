"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/ideas/content", label: "Content" },
  { href: "/ideas/accounts", label: "Accounts" },
];

export default function IdeasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ideas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Research for the funny t-shirt brand — reference posts worth reworking
          and accounts worth mining.
        </p>
      </div>

      <div className="mt-6 flex gap-1 border-b">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
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

      <div className="mt-6 flex-1">{children}</div>
    </div>
  );
}
