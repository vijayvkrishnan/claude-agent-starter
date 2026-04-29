import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stratus · your workspace, on Claude",
  description:
    "A production-grade Claude Agent SDK starter for in-product agents. Fork it, drop it in your app/, your users are talking to a Claude-powered agent today.",
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="font-sans antialiased min-h-screen bg-bg-base text-text-primary">
        {children}
      </body>
    </html>
  );
}
