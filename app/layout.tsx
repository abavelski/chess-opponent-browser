import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "./opponents.css";
import "./games.css";

export const metadata: Metadata = {
  title: "Chess Opponent Browser",
  description: "Private chess tournament preparation and opponent game browser",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
