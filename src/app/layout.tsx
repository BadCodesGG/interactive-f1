import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Michroma } from "next/font/google";
import { credits } from "@/data/credits";
import { ThemeToggle, themeScript } from "@/engine/explode";
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { liveryScript } from "@/models/f1/livery-choice";
import "./globals.css";

// Car 26 type: Michroma for the car's name and section labels, Archivo for reading, JetBrains Mono
// for live numbers. Michroma has one weight (400, the only one Google Fonts carries), so nothing set in
// it takes a bold class; globals.css also switches font synthesis off so a bold can never be faked.
const michroma = Michroma({ subsets: ["latin"], weight: "400", variable: "--font-michroma", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-archivo", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-jetbrains-mono", display: "swap" });

const SITE_TITLE = "Interactive: a 2026 F1 car";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_TITLE, description: SITE_DESCRIPTION, images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION, images: [OG_IMAGE.url] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${michroma.variable} ${archivo.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets data-theme before first paint, so neither theme flashes the other. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
        {/* Sets data-livery (the address, then the stored choice, then Ghost) before first paint, so the accent never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: liveryScript() }} />
      </head>
      <body className="isolate flex min-h-full flex-col">
        <div className="mx-auto flex w-full max-w-6xl justify-end px-6 pt-4">
          <ThemeToggle />
        </div>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-border py-6 text-sm text-ink-tertiary">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 md:flex-row md:items-center md:justify-between">
            <p>
              Built by{" "}
              <a href="https://badcodes.dev" className="text-ink-secondary underline-offset-4 hover:text-accent hover:underline">
                badcodes.dev
              </a>
            </p>
            <ul aria-label="Credits" data-credits className="flex flex-col gap-1 md:items-end md:text-right">
              {[credits.showroom, credits.showroom2022, credits.model, credits.partSplit].map((c) => (
                <li key={c.sourceUrl}>
                  <a href={c.sourceUrl} className="underline-offset-4 hover:text-accent hover:underline" rel="noreferrer">
                    &ldquo;{c.title}&rdquo; by {c.author}
                  </a>{" "}
                  (
                  <a href={c.licenceUrl} className="underline-offset-4 hover:text-accent hover:underline" rel="noreferrer">
                    CC BY 4.0
                  </a>
                  )
                </li>
              ))}
              <li>Model split, decimated and repainted for this site. Power unit built in code.</li>
            </ul>
          </div>
        </footer>
      </body>
    </html>
  );
}
