import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Separator } from "./separator";

const html = (props: Parameters<typeof Separator>[0] = {}) =>
  renderToStaticMarkup(createElement(Separator, props));

describe("Separator", () => {
  it("is decorative by default, so screen readers skip it", () => {
    const markup = html();
    expect(markup).toContain('role="none"');
    expect(markup).not.toContain("aria-orientation");
  });

  it("announces itself as a separator when decorative is false", () => {
    const markup = html({ decorative: false, orientation: "vertical" });
    expect(markup).toContain('role="separator"');
    expect(markup).toContain('aria-orientation="vertical"');
  });
});
