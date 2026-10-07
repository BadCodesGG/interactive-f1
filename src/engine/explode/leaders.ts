/**
 * Leader-line label layout: pure, so it is testable without three or a DOM.
 *
 * Labels stack in two columns either side of the model, the way an atlas plate sets them. Each
 * column is sorted by its anchors' heights so leader lines do not cross, then relaxed so no two
 * labels overlap and none leaves the frame. A column stands just off the model's outline when
 * there is room for its longest label there, and against the frame's edge when there is not.
 */

export interface Anchor {
  id: string;
  /** Screen position of the part, px from the frame's top left. */
  x: number;
  y: number;
  /** Width of the part's label text, px. */
  w: number;
  /**
   * A label that only shows while hovered or selected (a "hover" part). It does not take part in
   * the median split, so showing it never moves a steady label to the other column.
   */
  extra?: boolean;
}

export interface Placed {
  id: string;
  side: "left" | "right";
  /** Anchor, px. */
  ax: number;
  ay: number;
  /** Where the leader meets the label, px: the label's inner edge, vertically centred. */
  lx: number;
  ly: number;
  /** Width the label's text may take before it is cut, px. */
  room: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** Vertical pitch between labels, px. */
  gap: number;
  /** Distance from the frame edge to a column's outer edge, px. */
  margin: number;
  /** Keep labels this far from the top and bottom, px. */
  pad: number;
  /** The widest a label may be, px; longer ones are cut. */
  column: number;
  /** Space between a leader's end and its label's text, px. */
  inset: number;
  /** Horizontal distance a column keeps from the model's outline, px. */
  reach: number;
  /** The model's screen extent, px. Without it the columns stand against the frame. */
  outline?: { minX: number; maxX: number };
}

/**
 * Whether a part's leader label is drawn this frame. `few` is the stage's narrow-or-selected mode.
 * Any part's label shows while it is hovered or selected; otherwise only an "always" part (the
 * default) shows, and only with the full layout on. A "hover" part never counts towards the full
 * layout, so adding one changes nothing about today's labels.
 */
export function leaderShown(policy: "always" | "hover" | undefined, few: boolean, hovered: boolean, selected: boolean): boolean {
  return hovered || selected || (policy !== "hover" && !few);
}

/** Spreads wanted heights so each is at least `gap` from the last, within [lo, hi]. */
export function relax(wanted: number[], gap: number, lo: number, hi: number): number[] {
  const n = wanted.length;
  if (n === 0) return [];
  // A column too tall for the frame shares the space evenly instead of spilling past the bottom.
  const pitch = n > 1 ? Math.min(gap, (hi - lo) / (n - 1)) : gap;
  const out = wanted.map((y) => Math.min(hi, Math.max(lo, y)));
  for (let i = 1; i < n; i++) out[i] = Math.max(out[i], out[i - 1] + pitch);
  if (out[n - 1] > hi) {
    out[n - 1] = hi;
    for (let i = n - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - pitch);
  }
  return out;
}

export function layoutLeaders(anchors: Anchor[], o: LayoutOptions): Placed[] {
  if (anchors.length === 0) return [];
  // Split by screen x at the median, so the columns stay balanced however the model is turned. The
  // median is over the steady anchors only (all of them when none is steady); a transient one joins
  // the side its x falls on, so it never moves a steady label across the model.
  const steady = anchors.some((a) => !a.extra) ? anchors.filter((a) => !a.extra) : anchors;
  const byX = [...steady].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  const half = Math.ceil(byX.length / 2);
  const cut = byX.length > half ? (byX[half - 1].x + byX[half].x) / 2 : byX[half - 1].x;
  const out: Placed[] = [];
  const place = (col: Anchor[], side: "left" | "right") => {
    if (col.length === 0) return;
    col.sort((a, b) => a.y - b.y);
    const ys = relax(
      col.map((a) => a.y),
      o.gap,
      o.pad,
      o.height - o.pad,
    );
    // The column's inner edge: flush to the frame, moved in to the model's outline when the
    // longest label still fits between the frame and that edge.
    const need = Math.min(o.column, Math.max(...col.map((a) => a.w))) + o.inset;
    let lx: number;
    if (side === "left") {
      lx = o.margin + need;
      if (o.outline) lx = Math.max(lx, Math.min(o.outline.minX - o.reach, o.width / 2));
    } else {
      lx = o.width - o.margin - need;
      if (o.outline) lx = Math.min(lx, Math.max(o.outline.maxX + o.reach, o.width / 2));
    }
    const room = (side === "left" ? lx - o.margin : o.width - o.margin - lx) - o.inset;
    col.forEach((a, i) => out.push({ id: a.id, side, ax: a.x, ay: a.y, lx, ly: ys[i], room }));
  };
  const moving = steady === anchors ? [] : anchors.filter((a) => a.extra);
  place([...byX.slice(0, half), ...moving.filter((a) => a.x <= cut)], "left");
  place([...byX.slice(half), ...moving.filter((a) => a.x > cut)], "right");
  return out;
}
