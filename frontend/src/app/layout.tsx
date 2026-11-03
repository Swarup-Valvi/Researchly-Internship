import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/navigation";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Researchly.io - AI-Powered Academic Professional Network",
  description: "Discover conferences, verify credibility, match research papers, and connect with researchers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="min-h-screen bg-background text-foreground">
        <Navigation />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
