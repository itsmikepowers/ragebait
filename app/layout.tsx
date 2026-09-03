import type { Metadata } from "next";
import { IBM_Plex_Mono, Jersey_10 } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

/**
 * Two faces only.
 *
 * IBM Plex Mono is the entire UI. Jersey is reserved for the "ragebait"
 * wordmark and nothing else — if a second thing ever wants it, that's a sign
 * the wordmark has stopped being special.
 */
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  subsets: ["latin"],
});

const jersey = Jersey_10({
  weight: "400",
  variable: "--font-jersey",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ragebait",
  description: "We make you mad.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexMono.variable} ${jersey.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans font-normal text-foreground">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
