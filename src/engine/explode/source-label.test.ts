import { describe, expect, it } from "vitest";
import { sourceLabel } from "./source-label";

describe("sourceLabel", () => {
  it("names the publishers the copy books cite most", () => {
    expect(sourceLabel("https://www.ncbi.nlm.nih.gov/books/NBK279302/")).toBe("NCBI Bookshelf");
    expect(sourceLabel("https://pubmed.ncbi.nlm.nih.gov/12345/")).toBe("PubMed");
    expect(sourceLabel("https://www.nhs.uk/conditions/heart/")).toBe("NHS");
    expect(sourceLabel("https://www.fia.com/regulation/category/110")).toBe("FIA");
  });

  it("falls back to the bare host name for any other site", () => {
    expect(sourceLabel("https://www.racefans.net/2026/01/01/x/")).toBe("racefans.net");
    expect(sourceLabel("http://Example.org/a")).toBe("example.org");
  });

  it("is null for anything that is not an http(s) URL, so it stays plain text", () => {
    expect(sourceLabel("Gray's Anatomy, 42nd edition")).toBeNull();
    expect(sourceLabel("javascript:alert(1)")).toBeNull();
    expect(sourceLabel("https://")).toBeNull();
  });
});
