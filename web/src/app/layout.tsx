import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { SITE_URL } from "@/lib/env";

import "./globals.css";

// Inter, kept in the repo so a build never has to fetch it.
const inter = localFont({ src: "./fonts/inter.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  title: { default: "Floor", template: "%s · Floor" },
  description: "One home for a trading mentor's community: posts, lessons, groups and live sessions.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#090A12" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
