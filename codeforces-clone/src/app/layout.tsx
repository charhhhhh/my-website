import type { Metadata } from "next";
import { CF_STYLESHEETS } from "@/lib/cf-assets";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codeforces",
  description:
    "Layout clone of Codeforces contest 2250 (Codeforces Round 1112, Div. 2)",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Codeforces' own stylesheets, served byte-for-byte from public/. Re-deriving
            them in Tailwind would mean reimplementing thousands of rules plus their
            sprite-based rounded corners, at much lower fidelity. */}
        {CF_STYLESHEETS.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        {/* Ours, not Codeforces'. Must stay LAST: it overrides their fixed-width desktop
            layout below 920px with plain selectors, which only works while it wins on
            source order. globals.css cannot do this job - Next injects it above every
            link here. */}
        {/* eslint-disable-next-line @next/next/no-css-tags -- importing it would let Next
            hoist it above the Codeforces sheets, which is exactly what must not happen */}
        <link rel="stylesheet" href="/mobile-fit.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
