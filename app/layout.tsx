import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Work Timer",
  description: "Flexible work and break tracking without forced interruptions.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
