import { describe, expect, it } from "vitest";
import { layoutLeaders, leaderShown, relax, type Anchor, type LayoutOptions } from "./leaders";

const opts: LayoutOptions = { width: 800, height: 600, gap: 20, margin: 28, pad: 50, column: 250, inset: 6, reach: 20 };

describe("relax", () => {
  it("keeps heights that are already far enough apart", () => {
    expect(relax([100, 200, 300], 20, 0, 600)).toEqual([100, 200, 300]);
  });

  it("pushes crowded heights down to the pitch", () => {
    expect(relax([100, 105, 110], 20, 0, 600)).toEqual([100, 120, 140]);
  });

  it("pulls a column back up from the bottom edge", () => {
    expect(relax([580, 590, 600], 20, 0, 600)).toEqual([560, 580, 600]);
  });

  it("shares the space evenly when the column is taller than the frame", () => {
    const out = relax([0, 0, 0, 0, 0], 50, 0, 100);
    expect(out).toEqual([0, 25, 50, 75, 100]);
  });
});

const a = (id: string, x: number, y: number, w = 60): Anchor => ({ id, x, y, w });
const extra = (id: string, x: number, y: number, w = 60): Anchor => ({ id, x, y, w, extra: true });

describe("leaderShown", () => {
  it("shows an always part whenever the full layout is on, exactly as before the policy existed", () => {
    expect(leaderShown("always", false, false, false)).toBe(true);
    expect(leaderShown(undefined, false, false, false)).toBe(true);
  });

  it("shows an always part in few mode only while hovered or selected", () => {
    expect(leaderShown("always", true, false, false)).toBe(false);
    expect(leaderShown(undefined, true, false, false)).toBe(false);
    expect(leaderShown("always", true, true, false)).toBe(true);
    expect(leaderShown("always", true, false, true)).toBe(true);
  });

  it("shows a hover part only while hovered or selected, even with the full layout on", () => {
    expect(leaderShown("hover", false, false, false)).toBe(false);
    expect(leaderShown("hover", false, true, false)).toBe(true);
    expect(leaderShown("hover", false, false, true)).toBe(true);
    expect(leaderShown("hover", true, true, false)).toBe(true);
    expect(leaderShown("hover", true, false, false)).toBe(false);
  });
});

describe("layoutLeaders", () => {
  it("splits at the median x, left column first, and never crosses lines within a column", () => {
    const placed = layoutLeaders([a("d", 500, 100), a("a", 300, 300), a("b", 350, 100), a("c", 450, 300)], opts);
    const left = placed.filter((p) => p.side === "left");
    const right = placed.filter((p) => p.side === "right");
    expect(left.map((p) => p.id)).toEqual(["b", "a"]);
    expect(right.map((p) => p.id)).toEqual(["d", "c"]);
    // Sorted by anchor height, so label heights follow the same order.
    for (const col of [left, right]) for (let i = 1; i < col.length; i++) expect(col[i].ly).toBeGreaterThanOrEqual(col[i - 1].ly + opts.gap);
  });

  it("stands a column against the frame when there is no outline", () => {
    const placed = layoutLeaders([a("l", 300, 200, 100), a("r", 500, 200, 80)], opts);
    const l = placed.find((p) => p.id === "l")!;
    const r = placed.find((p) => p.id === "r")!;
    expect(l.lx).toBe(opts.margin + 100 + opts.inset);
    expect(r.lx).toBe(opts.width - opts.margin - 80 - opts.inset);
    expect(l.room).toBe(100);
    expect(r.room).toBe(80);
  });

  it("moves a column in to the model's outline when the longest label fits beside it", () => {
    const placed = layoutLeaders([a("l", 350, 200, 100), a("r", 450, 200, 80)], { ...opts, outline: { minX: 330, maxX: 470 } });
    expect(placed.find((p) => p.id === "l")!.lx).toBe(330 - opts.reach);
    expect(placed.find((p) => p.id === "r")!.lx).toBe(470 + opts.reach);
  });

  it("keeps a label whole over the model rather than cut at the frame, when the model is too wide", () => {
    const placed = layoutLeaders([a("l", 100, 200, 180), a("r", 700, 200, 180)], { ...opts, outline: { minX: 60, maxX: 740 } });
    const l = placed.find((p) => p.id === "l")!;
    const r = placed.find((p) => p.id === "r")!;
    expect(l.lx).toBe(opts.margin + 180 + opts.inset);
    expect(l.room).toBe(180);
    expect(r.lx).toBe(opts.width - opts.margin - 180 - opts.inset);
    expect(r.room).toBe(180);
  });

  it("never lets a column pass the frame's centre", () => {
    const placed = layoutLeaders([a("l", 399, 200), a("r", 401, 200)], { ...opts, outline: { minX: 500, maxX: 300 } });
    expect(placed.find((p) => p.id === "l")!.lx).toBeLessThanOrEqual(opts.width / 2);
    expect(placed.find((p) => p.id === "r")!.lx).toBeGreaterThanOrEqual(opts.width / 2);
  });

  it("cuts a label longer than the column", () => {
    const [p] = layoutLeaders([a("l", 300, 200, 400)], opts);
    expect(p.room).toBe(opts.column);
  });

  it("keeps labels inside the padded frame", () => {
    const placed = layoutLeaders([a("top", 300, -40), a("bottom", 300, 900)], opts);
    for (const p of placed) {
      expect(p.ly).toBeGreaterThanOrEqual(opts.pad);
      expect(p.ly).toBeLessThanOrEqual(opts.height - opts.pad);
    }
  });

  it("lays out the same columns with or without a transient label, which never moves a steady one across", () => {
    const steady = [a("a", 100, 100), a("b", 200, 200), a("c", 600, 100), a("d", 700, 200), a("e", 650, 300)];
    const before = layoutLeaders(steady, opts);
    const after = layoutLeaders([...steady, extra("t", 300, 400)], opts);
    for (const p of before) expect(after.find((q) => q.id === p.id)!.side).toBe(p.side);
    // A plain sixth anchor would have moved the median split; the transient one does not.
    const plain = layoutLeaders([...steady, a("t", 300, 400)], opts);
    expect(before.find((p) => p.id === "c")!.side).toBe("left");
    expect(plain.find((p) => p.id === "c")!.side).toBe("right");
  });

  it("puts a transient label on the side of the steady split its anchor falls on", () => {
    const steady = [a("a", 100, 100), a("b", 200, 200), a("c", 600, 100), a("d", 700, 200)];
    const at = (x: number) => layoutLeaders([...steady, extra("t", x, 150)], opts).find((p) => p.id === "t")!.side;
    expect(at(250)).toBe("left");
    expect(at(550)).toBe("right");
  });

  it("splits by the transient labels themselves when nothing is steady", () => {
    const placed = layoutLeaders([extra("l", 100, 100), extra("r", 700, 100)], opts);
    expect(placed.find((p) => p.id === "l")!.side).toBe("left");
    expect(placed.find((p) => p.id === "r")!.side).toBe("right");
  });

  it("places nothing for no anchors", () => {
    expect(layoutLeaders([], opts)).toEqual([]);
  });
});
