import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "docs — ragebait",
  description: "Public API for today's scheduled post.",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-3 text-sm leading-6">
      <code>{children}</code>
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="inline-flex">
        <Logo />
      </Link>

      <h1 className="mt-12 text-2xl font-semibold tracking-tight">Docs</h1>
      <p className="mt-3 text-muted-foreground">
        Public JSON for today&apos;s scheduled post. No auth required.
      </p>

      <section className="mt-10 grid gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          GET /api/fetch/{"{username}"}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Looks up an account by username, finds today&apos;s date in UTC, and
          returns the first scheduled post for that day. There is usually one
          post per day.
        </p>
      </section>

      <section className="mt-8 grid gap-3">
        <h3 className="font-medium">Request</h3>
        <Code>{`GET /api/fetch/yourusername`}</Code>
        <p className="text-sm leading-6 text-muted-foreground">
          Replace <code className="text-foreground">yourusername</code> with
          the account username. A leading <code className="text-foreground">@</code>{" "}
          is ignored.
        </p>
      </section>

      <section className="mt-8 grid gap-3">
        <h3 className="font-medium">Response</h3>
        <Code>{`{
  "username": "yourusername",
  "date": "2026-08-17",
  "url": "https://cdn.example.com/schedule/video.mp4",
  "posted": false
}`}</Code>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
          <li>
            <code className="text-foreground">date</code> is today&apos;s UTC
            calendar day.
          </li>
          <li>
            <code className="text-foreground">url</code> is the public video
            URL.
          </li>
          <li>
            <code className="text-foreground">posted</code> is whether that
            item has already been marked as posted.
          </li>
        </ul>
      </section>

      <section className="mt-8 grid gap-3">
        <h3 className="font-medium">Errors</h3>
        <Code>{`{ "error": "Account not found." }`}</Code>
        <p className="text-sm leading-6 text-muted-foreground">
          <code className="text-foreground">404</code> if the username does
          not exist, or if there is no scheduled post for today.
        </p>
      </section>

      <section className="mt-16 grid gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          GET /api/finalize/{"{username}"}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Marks today&apos;s scheduled post for that username as posted. Call
          this after you&apos;ve pulled and used the video from{" "}
          <code className="text-foreground">/api/fetch/{"{username}"}</code>.
        </p>
      </section>

      <section className="mt-8 grid gap-3">
        <h3 className="font-medium">Request</h3>
        <Code>{`GET /api/finalize/yourusername`}</Code>
      </section>

      <section className="mt-8 grid gap-3">
        <h3 className="font-medium">Response</h3>
        <Code>{`{ "status": "okay" }`}</Code>
        <p className="text-sm leading-6 text-muted-foreground">
          If that post was already marked as posted:
        </p>
        <Code>{`{ "status": "already posted" }`}</Code>
      </section>

      <section className="mt-8 grid gap-3">
        <h3 className="font-medium">Errors</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          Same <code className="text-foreground">404</code> responses as fetch
          if the username or today&apos;s post is missing.
        </p>
      </section>
    </div>
  );
}
