import type { Metadata } from "next";
import { Huninn, Jersey_10 } from "next/font/google";
import "./globals.css";

const huninn = Huninn({
  weight: "400",
  variable: "--font-huninn",
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
      className={`${huninn.variable} ${jersey.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans font-normal text-foreground">
        {children}
      </body>
    </html>
  );
}
