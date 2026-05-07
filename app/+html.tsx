import { ScrollViewStyleReset } from "expo-router/html";
import React from "react";

/**
 * Root HTML document for Expo web.
 * Provides default meta tags, Open Graph defaults, preconnects, and
 * the JSON-LD Organization schema for the Milliy Tiklanish website.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* ── Default SEO ───────────────────────────────────────────────── */}
        <title>Milliy Tiklanish — O'zbekiston milliy gazetasi</title>
        <meta
          name="description"
          content="Milliy Tiklanish — O'zbekistonning eng nufuzli milliy gazetasi. So'nggi yangiliklar, tahlillar va maqolalar."
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://milliytiklanish.uz" />

        {/* ── Open Graph ───────────────────────────────────────────────── */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Milliy Tiklanish" />
        <meta property="og:title" content="Milliy Tiklanish — O'zbekiston milliy gazetasi" />
        <meta
          property="og:description"
          content="Milliy Tiklanish — O'zbekistonning eng nufuzli milliy gazetasi."
        />
        <meta property="og:url" content="https://milliytiklanish.uz" />
        <meta property="og:image" content="https://milliytiklanish.uz/og-image.jpg" />
        <meta property="og:locale" content="uz_UZ" />

        {/* ── Twitter Card ─────────────────────────────────────────────── */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@milliytiklanish" />
        <meta name="twitter:title" content="Milliy Tiklanish" />
        <meta
          name="twitter:description"
          content="O'zbekistonning eng nufuzli milliy gazetasi."
        />
        <meta name="twitter:image" content="https://milliytiklanish.uz/og-image.jpg" />

        {/* ── Performance hints ─────────────────────────────────────────── */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://pfrttozbhhqhmbzimphz.supabase.co" />

        {/* ── Favicon ───────────────────────────────────────────────────── */}
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#ed1c24" />

        {/* ── JSON-LD: Organization ─────────────────────────────────────── */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "NewsMediaOrganization",
              "name": "Milliy Tiklanish",
              "url": "https://milliytiklanish.uz",
              "logo": {
                "@type": "ImageObject",
                "url": "https://milliytiklanish.uz/logo.png",
              },
              "sameAs": [
                "https://t.me/milliytiklanish",
                "https://instagram.com/milliytiklanish",
                "https://facebook.com/milliytiklanish",
              ],
            }),
          }}
        />

        <ScrollViewStyleReset />

        {/* ── Global web styles ─────────────────────────────────────────── */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              *, *::before, *::after { box-sizing: border-box; }
              html { scroll-behavior: smooth; }
              body { margin: 0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
              img { max-width: 100%; height: auto; }
              /* Smooth scrollbar on webkit */
              ::-webkit-scrollbar { width: 6px; height: 6px; }
              ::-webkit-scrollbar-track { background: transparent; }
              ::-webkit-scrollbar-thumb { background: #D8D1C3; border-radius: 3px; }
              ::-webkit-scrollbar-thumb:hover { background: #a59d8b; }
              /* Focus ring */
              :focus-visible { outline: 2px solid #ed1c24; outline-offset: 2px; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
