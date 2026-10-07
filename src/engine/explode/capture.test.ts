import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText, screenshotName, shareUrl } from "./capture";

const loc = { origin: "https://x.dev", pathname: "/body", search: "?utm=1", hash: "#top" };

describe("shareUrl", () => {
  it("builds the deep link on the current page, keeping other parameters and the hash", () => {
    expect(shareUrl(loc, { selected: "heart", target: 1, isolated: false })).toBe("https://x.dev/body?utm=1&part=heart&explode=1#top");
  });

  it("is the plain page address for the default state", () => {
    expect(shareUrl({ ...loc, search: "", hash: "" }, { selected: null, target: 0, isolated: false })).toBe("https://x.dev/body");
  });
});

describe("screenshotName", () => {
  it("joins app and part into a safe png name", () => {
    expect(screenshotName("anatomy", "Femur (thigh bone)")).toBe("anatomy-femur-thigh-bone.png");
    expect(screenshotName("f1", "Front wing")).toBe("f1-front-wing.png");
  });

  it("falls back to overview with nothing selected or nothing sluggable", () => {
    expect(screenshotName("pc", null)).toBe("pc-overview.png");
    expect(screenshotName("pc", "???")).toBe("pc-overview.png");
  });

  it("strips path and shell characters from both halves", () => {
    expect(screenshotName("../a b", "x/y\\z:*?")).toBe("a-b-xyz.png");
    expect(screenshotName("", "Heart")).toBe("explode-heart.png");
  });

  it("folds accents rather than dropping the letter", () => {
    expect(screenshotName("a", "Cerebellum Café")).toBe("a-cerebellum-cafe.png");
  });
});

describe("copyText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("copies through the clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("link")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("link");
  });

  it("answers unavailable, without throwing, when the API is missing or refuses", async () => {
    vi.stubGlobal("navigator", {});
    expect(await copyText("link")).toBe("unavailable");
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    expect(await copyText("link")).toBe("unavailable");
    vi.stubGlobal("navigator", { clipboard: { writeText: () => { throw new Error("sync"); } } });
    expect(await copyText("link")).toBe("unavailable");
  });
});
