import type { Metadata } from "next";
import "./globals.css";
import SparkleCursor from "@/components/SparkleCursor";
import { profile } from "@/data/profile";

export const metadata: Metadata = {
  // TODO(你): 換成正式網址
  metadataBase: new URL("https://xn--920au0q.tw"),
  title: `${profile.name} 的個人首頁 · ${profile.slogan}`,
  description: `${profile.name}，${profile.location}。專長是${profile.skill}。廢文跟笑話一半一半。`,
  icons: { icon: "/oc/icon/0.png" },
  openGraph: {
    title: `${profile.name} 的個人首頁`,
    description: `${profile.slogan}｜${profile.location}`,
    images: ["/oc/full/0.webp"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>
        {children}
        <SparkleCursor />
      </body>
    </html>
  );
}
