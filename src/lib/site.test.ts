import { describe, expect, it, vi } from "vitest";
import { metadata as layoutMetadata } from "@/app/layout";
import { metadata as homeMetadata } from "@/app/page";
import { metadata as tunnelMetadata } from "@/app/tunnel/page";
import { OG_IMAGE, pageMetadata, shareTitle, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

// next/font/google is a build-time transform; under vitest the layout only needs it to return a font object.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "" });
  return { Archivo: font, JetBrains_Mono: font, Michroma: font };
});

const routes = [
  { name: "/", path: "/", metadata: homeMetadata },
  { name: "/tunnel", path: "/tunnel", metadata: tunnelMetadata },
];

describe("share metadata", () => {
  it("names the https custom domain, never a deployment or local URL", () => {
    expect(SITE_URL).toBe("https://f1.badcodes.dev");
  });

  it("describes the picture", () => {
    expect(OG_IMAGE).toMatchObject({ url: "/og.jpg", width: 1200, height: 630 });
    expect(OG_IMAGE.alt.length).toBeGreaterThan(20);
  });

  it("keeps the site description at 160 characters or fewer", () => {
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it.each(routes)("$name carries the image on both cards, with its own title and url", ({ path, metadata }) => {
    const og = metadata.openGraph as { images: unknown[]; title: string; url: string };
    const tw = metadata.twitter as { card: string; images: string[]; title: string };
    expect(og.images).toContain(OG_IMAGE);
    expect(tw.images).toContain(OG_IMAGE.url);
    expect(tw.card).toBe("summary_large_image");
    expect(og.url).toBe(path);
    expect(metadata.alternates?.canonical).toBe(path);
    expect(og.title).toBe(shareTitle(metadata.title as string, path));
    expect(tw.title).toBe(og.title);
  });
});

describe("root layout metadata", () => {
  it("sets metadataBase to the site and carries the image on both cards", () => {
    expect(String(layoutMetadata.metadataBase)).toBe(`${SITE_URL}/`);
    expect(layoutMetadata.description).toBe(SITE_DESCRIPTION);
    expect((layoutMetadata.openGraph as { images: unknown[] }).images).toContain(OG_IMAGE);
    expect((layoutMetadata.twitter as { images: string[] }).images).toContain(OG_IMAGE.url);
  });
});

describe("pageMetadata", () => {
  it("builds both cards from one title, description and path", () => {
    const m = pageMetadata({ title: "T", description: "D", path: "/x" });
    expect(m.openGraph).toMatchObject({ type: "website", title: "T | Interactive", description: "D", url: "/x", images: [OG_IMAGE] });
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: "T | Interactive", description: "D", images: ["/og.jpg"] });
  });
  it("a card's title is the page's <title>: the root page as written, every other route with the suffix", () => {
    expect(shareTitle("T", "/")).toBe("T");
    expect(shareTitle("T", "/x")).toBe(`T | ${SITE_NAME}`);
  });

});
