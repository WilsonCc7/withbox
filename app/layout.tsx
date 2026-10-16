import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Withbox",
  description: "Track the films and series you watch.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg pb-20 text-fg sm:pb-0">
        {/* pb-20 clears the fixed mobile tab bar, which is sm:hidden. */}
        {children}
        {/*
          TMDB attribution is a condition of using their API and must stay
          visible on every page.
        */}
        <footer className="mx-auto mt-16 max-w-6xl px-4 pb-10 text-xs text-faint sm:px-6">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </footer>
      </body>
    </html>
  );
}
