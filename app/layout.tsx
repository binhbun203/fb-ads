import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdPilot Ops — Facebook Ads & Pancake",
  description: "Dashboard quản trị chi tiêu quảng cáo, thanh toán, tài khoản và doanh số Pancake.",
  icons: { icon: "/favicon.svg" },
  metadataBase: new URL("https://adpilot-ops.sites.openai.com"),
  openGraph: {
    title: "AdPilot Ops",
    description: "Facebook Ads & Pancake",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "AdPilot Ops dashboard" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
