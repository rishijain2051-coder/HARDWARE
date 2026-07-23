import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Hardware Store ERP",
    template: "%s | Hardware Store ERP",
  },
  description:
    "Centralized inventory management system for furniture manufacturing hardware. Manage procurement, storage, consumption, and reporting.",
  keywords: ["hardware", "ERP", "inventory", "furniture", "manufacturing", "GRN", "MIS"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
