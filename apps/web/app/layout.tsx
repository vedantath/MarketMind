import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarketMind",
  description: "Explainable, non-advisory market intelligence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
