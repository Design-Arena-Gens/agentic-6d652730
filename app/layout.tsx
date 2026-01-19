"use client";

import "./globals.css";
import { ReactNode, useEffect } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (document && !document.body.dataset.fontLoaded) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
      document.head.appendChild(link);
      document.body.dataset.fontLoaded = "true";
    }
  }, []);

  return (
    <html lang="en">
      <head />
      <body>{children}</body>
    </html>
  );
}
