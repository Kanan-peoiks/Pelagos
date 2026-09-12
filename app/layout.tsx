import type { Metadata } from "next";
import "./globals.css";
import { IncidentStoreProvider } from "@/lib/incident-store";
import { NO_FLASH_THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "SeaSentry — Satellite & AI Oil Spill Intelligence",
  description:
    "SeaSentry detects potential oil spills on the Caspian Sea using satellite SAR imagery, analyzes them with AI, and supports human review, response, and cleanup.",
  keywords: [
    "oil spill detection",
    "Caspian Sea",
    "satellite AI",
    "Sentinel-1",
    "SAR",
    "maritime intelligence",
    "SeaSentry",
  ],
  openGraph: {
    title: "SeaSentry Dashboard",
    description:
      "Caspian Sea oil spill intelligence — satellite detection, AI analysis, and operator response.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved (or OS-preferred) theme before first paint,
            so there's no flash of the wrong theme on load. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Leaflet CSS via CDN — avoids Turbopack PostCSS processing panic */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <IncidentStoreProvider>{children}</IncidentStoreProvider>
      </body>
    </html>
  );
}
