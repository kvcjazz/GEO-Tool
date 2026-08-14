import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luminous GEO — AI Visibility",
  description: "AI search visibility tracker by Luminous PR.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
