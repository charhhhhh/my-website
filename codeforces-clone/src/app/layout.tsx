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
      </head>
      <body>{children}</body>
    </html>
  );
}
