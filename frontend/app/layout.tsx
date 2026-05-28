import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UrbanScope",
  description: "Satellite-based building analysis and population estimation"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

