import type { Metadata } from "next";
import { Inter, Jersey_10 } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jersey = Jersey_10({
  weight: "400",
  variable: "--font-jersey",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RageBait",
  description: "We make you mad.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jersey.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans font-normal text-foreground">
        {children}
      </body>
    </html>
  );
}
