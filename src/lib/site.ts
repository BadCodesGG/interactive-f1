import type { Metadata } from "next";

/** The production custom domain, as a literal: a relative or deployment URL makes Slack and Facebook drop the image. */
export const SITE_URL = "https://f1.badcodes.dev";
export const SITE_NAME = "Interactive";
export const SITE_DESCRIPTION =
  "An interactive exploded view of a generic 2026 Formula 1 car, and a wind tunnel where you swap parts and watch the flow and the lap time change.";

export const OG_IMAGE = {
  url: "/og.jpg",
  width: 1200,
  height: 630,
  alt: "An exploded 2026 Formula 1 car in a powder blue and orange livery, its wings, floor, bodywork and wheels pulled apart.",
};

/**
 * The title a card shows, which is the page's own `<title>`. The layout's template
 * (`%s | ${SITE_NAME}`) applies to every route below the root but never to the root page, and
 * og:title and twitter:title never go through it, so the suffix is added here.
 */
export function shareTitle(title: string, path: string): string {
  return path === "/" ? title : `${title} | ${SITE_NAME}`;
}

/**
 * Metadata for one route. Next replaces a layout's `openGraph` and `twitter` wholesale when a route
 * declares its own, so a route that set only its title would otherwise lose the image or carry the
 * layout's title. Every route that sets metadata spreads this.
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const card = shareTitle(title, path);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, title: card, description, url: path, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: card, description, images: [OG_IMAGE.url] },
  };
}
