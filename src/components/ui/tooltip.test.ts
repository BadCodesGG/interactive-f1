import { describe, expect, it } from "vitest";
import { TooltipProvider } from "./tooltip";

describe("TooltipProvider", () => {
  it("waits 700ms before opening, the delay the Radix wrapper had", () => {
    expect(TooltipProvider({}).props.delay).toBe(700);
  });

  it("lets a caller choose another delay", () => {
    expect(TooltipProvider({ delay: 0 }).props.delay).toBe(0);
  });
});
