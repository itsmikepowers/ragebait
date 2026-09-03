import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "docs — ragebait",
  description: "Publishing API for the next scheduled post.",
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
        Machine API for the poster automation. Both endpoints require the
        publishing key — they expose unpublished captions and media, and
        finalize mutates the schedule.
      </p>

      <section className="mt-10 grid gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Authentication
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Send the publishing key as a bearer token. The header{" "}
          <code className="text-foreground">x-ragebait-key</code> is accepted
          as an alternative.
        </p>
        <Code>{`Authorization: Bearer <POSTER_API_KEY>`}</Code>
        <p className="text-sm leading-6 text-muted-foreground">
          <code className="text-foreground">401</code> when the key is missing
          or wrong, <code className="text-foreground">503</code> when the
          server has no key configured. The dashboard itself uses a separate
          Firebase sign-in; a dashboard session will not open these endpoints,
          and this key will not open the dashboard.
        </p>
      </section>

      <section className="mt-12 grid gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          GET /api/fetch/{"{username}"}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Returns the earliest unposted item for that account whose scheduled
          time has already passed. A leading{" "}
          <code className="text-foreground">@</code> on the username is
          ignored.
        </p>
      </section>

      <section className="mt-8 grid gap-3">
        <h3 className="font-medium">Request</h3>
        <Code>{`curl https://www.ragebait.io/api/fetch/yourusername \\
  -H "Authorization: Bearer $POSTER_API_KEY"`}</Code>
      </section>

      <section className="mt-8 grid gap-3">
        <h3 className="font-medium">Response</h3>
        <Code>{`{
  "username": "yourusername",
  "date": "2026-09-02T13:00:00.000Z",
  "url": "https://cdn.example.com/schedule/video.mp4",
  "caption": "tag your bro",
  "firstComment": "",
  "instagramPostUrl": "",
  "posted": false
}`}</Code>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
          <li>
            <code className="text-foreground">date</code> is the scheduled
            datetime in ISO 8601.
          </li>
          <li>
            <code className="text-foreground">url</code> is the public CDN
            video URL, or <code className="text-foreground">null</code> when no
            CDN base is configured.
          </li>
          <li>
            <code className="text-foreground">posted</code> is whether that
            item has already been marked as posted.
          </li>
        </ul>
      </section>

      <section className="mt-8 grid gap-3">
        <h3 className="font-medium">Errors</h3>
        <Code>{`{ "error": "Account not found." }
{ "error": "No scheduled post is due yet." }`}</Code>
        <p className="text-sm leading-6 text-muted-foreground">
          <code className="text-foreground">404</code> if the username does not
          exist, or if nothing is due.
        </p>
      </section>

      <section className="mt-16 grid gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          POST /api/finalize/{"{username}"}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Marks the same item that fetch would return as posted. Call this only
          after the upload is confirmed — it is{" "}
          <strong className="text-foreground">POST-only</strong> precisely so a
          crawler, link unfurler, or prefetch can never burn the next queued
          post.
        </p>
      </section>

      <section className="mt-8 grid gap-3">
        <h3 className="font-medium">Request</h3>
        <Code>{`curl -X POST https://www.ragebait.io/api/finalize/yourusername \\
  -H "Authorization: Bearer $POSTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"instagramPostUrl":"https://www.instagram.com/p/ABC123/"}'`}</Code>
        <p className="text-sm leading-6 text-muted-foreground">
          The body is optional. When present,{" "}
          <code className="text-foreground">instagramPostUrl</code> is stored
          on the item; anything that isn&apos;t an instagram.com URL is ignored
          rather than rejected.
        </p>
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
          if the username or a due post is missing.
        </p>
      </section>
    </div>
  );
}
