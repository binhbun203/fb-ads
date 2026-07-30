import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "./PwaRegister";

export const metadata: Metadata = {
  title: "AdPilot Ops — Facebook Ads & Pancake",
  description: "Dashboard quản trị chi tiêu quảng cáo, thanh toán, tài khoản và doanh số Pancake.",
  applicationName: "AdPilot Ops",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "AdPilot" },
  formatDetection: { telephone: false },
  metadataBase: new URL("https://adpilot-ops-vn.bindqbin.chatgpt.site"),
  openGraph: {
    title: "AdPilot Ops",
    description: "Facebook Ads & Pancake",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "AdPilot Ops dashboard" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0d13",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}<PwaRegister /></body></html>;
}
