import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "日常進度 · Fitness Tracker",
  description: "私人的飲食、訓練與身體量測紀錄。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
