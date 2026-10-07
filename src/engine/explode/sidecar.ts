/**
 * The sidecar: one JSON file per feature that names the parts of a GLB and says how each explodes.
 * It is the source of truth for labels, groups and copy keys; the GLB only supplies geometry and
 * node names. `npm run check:sidecar` (and `npm test`) fail when the two drift apart.
 *
 * This module has no imports and uses only erasable TypeScript, so `scripts/check-sidecar.mjs`
 * can import it directly under Node's type stripping and share the exact same rules.
 */

export type Vec3 = [number, number, number];
export type Axis = "x" | "y" | "z";

export interface SidecarAssembly {
  /** Overrides the union-box centre (one outlier part otherwise skews every direction). */
  centre?: Vec3 | null;
  /** Overrides the union-box radius, the unit every radial magnitude is measured in. */
  radius?: number | null;
  /** Blueprint mode: every part moves along this one axis instead of radially. */
  axis?: Axis | null;
  /**
   * The first camera angle, radians (camera-controls' azimuth from +z toward +x, and polar from +y).
   * Defaults to a three-quarter front view, azimuth 0.6 and polar 1.1.
   */
  camera?: { azimuth: number; polar: number } | null;
  /**
   * How loosely the camera frames the model: the fitted pose's radius is multiplied by this. Above 1
   * leaves room around a wide model, for leader labels. Defaults to 1.
   */
  frame?: number | null;
}

export interface SidecarGroup {
  label: string;
  /** Stages split [0, 1] evenly, in order: stage 0 plays first. */
  stage: number;
  /** World-aligned group offset at full explode, model units. Children add their own on top. */
  explode?: Vec3;
}

export interface SidecarView {
  position: Vec3;
  target: Vec3;
}

export interface SidecarAssemble {
  slot: string;
  snap: number;
  after: string[];
}

export interface SidecarPart {
  label: string;
  group?: string;
  /** World-aligned offset at full explode, model units. Overrides the radial default. */
  explode?: Vec3;
  /** Defaults to the group's stage, else 0. */
  stage?: number;
  /** 0..1 stagger inside the stage window. */
  order?: number;
  pickable?: boolean;
  /**
   * When the part's leader label shows. "always" (the default) follows the stage's rules: every
   * label while the full layout is on, only the hovered and selected ones when it is not. "hover"
   * shows the label only while the part is hovered or selected, even in the full layout, for a part
   * whose name would crowd the plate (one vertebra of twenty-four). A "hover" part stays pickable.
   */
  leader?: "always" | "hover";
  /**
   * Built in code and added under the loaded scene before the plan is made (ExplodeStage's
   * `onModel`), so the GLB has no node for it. check:sidecar skips its model check; the feature
   * must test that its builder emits exactly these names.
   */
  procedural?: boolean;
  /** Key into the feature's CopyBook. */
  copy: string;
  view?: SidecarView;
  assemble?: SidecarAssemble;
}

export interface Sidecar {
  schema: 1;
  model: string;
  assembly: SidecarAssembly;
  groups: Record<string, SidecarGroup>;
  /** Keyed by node name as three's GLTFLoader leaves it. Insertion order is display order. */
  parts: Record<string, SidecarPart>;
  /**
   * Group ids of the outer layers the X-ray slider fades (skin over muscle, body panels over the
   * chassis). Absent means the feature's slider is not offered.
   */
  xray?: string[];
}

export type SidecarResult = { ok: true; sidecar: Sidecar } | { ok: false; errors: string[] };

// Copied from three/src/animation/PropertyBinding.js (r186): whitespace becomes "_", then the
// characters reserved for animation track paths ([ ] . : /) are removed. Nothing else changes, so
// "émoji" survives the loader. The unit test compares this against three's own function.
const RESERVED_RE = /[[\].:/]/g;

/** What three's GLTFLoader does to a node name before it becomes `Object3D.name`. */
export function sanitizeNodeName(name: string): string {
  return name.replace(/\s/g, "_").replace(RESERVED_RE, "");
}

/**
 * The naming rule this engine asks of every part: stricter than three's sanitiser, so a name is
 * identical in Blender, in the GLB, after loading, in a URL and in a CSS selector.
 */
export function isSafeNodeName(name: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(name);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const key = (k: string) => (isSafeNodeName(k) ? `.${k}` : `[${JSON.stringify(k)}]`);

/** Checks an unknown value (a parsed JSON file) against the schema and names every problem. */
export function validateSidecar(input: unknown): SidecarResult {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  if (!isObj(input)) return { ok: false, errors: ["sidecar must be an object"] };

  if (input.schema !== 1) err("schema must be 1");
  if (!isStr(input.model)) err("model must be a string (the GLB's URL under /models/)");

  const assembly = input.assembly ?? {};
  if (!isObj(assembly)) err("assembly must be an object");
  else {
    if (assembly.centre != null && !isVec3(assembly.centre)) err("assembly.centre must be [x, y, z] or null");
    if (assembly.radius != null && !(isNum(assembly.radius) && assembly.radius > 0)) err("assembly.radius must be a positive number or null");
    if (assembly.axis != null && !["x", "y", "z"].includes(assembly.axis as string)) err('assembly.axis must be "x", "y", "z" or null');
    if (assembly.frame != null && !(isNum(assembly.frame) && assembly.frame > 0)) err("assembly.frame must be a positive number or null");
    const cam = assembly.camera;
    if (cam != null && !(isObj(cam) && isNum(cam.azimuth) && isNum(cam.polar))) err("assembly.camera must be { azimuth: number, polar: number } or null");
  }

  const groups = input.groups ?? {};
  if (!isObj(groups)) err("groups must be an object");
  else {
    for (const [id, g] of Object.entries(groups)) {
      const at = `groups${key(id)}`;
      if (!isObj(g)) { err(`${at} must be an object`); continue; }
      if (!isStr(g.label)) err(`${at}.label must be a non-empty string`);
      if (!(Number.isInteger(g.stage) && (g.stage as number) >= 0)) err(`${at}.stage must be a whole number >= 0`);
      if (g.explode !== undefined && !isVec3(g.explode)) err(`${at}.explode must be [x, y, z]`);
    }
  }

  if (!isObj(input.parts) || Object.keys(input.parts).length === 0) err("parts must be an object with at least one part");
  else {
    const partIds = new Set(Object.keys(input.parts));
    for (const [id, p] of Object.entries(input.parts)) {
      const at = `parts${key(id)}`;
      if (!isSafeNodeName(id)) err(`${at}: key is not a safe node name (use only A-Z, a-z, 0-9, _ and -)`);
      if (!isObj(p)) { err(`${at} must be an object`); continue; }
      if (!isStr(p.label)) err(`${at}.label must be a non-empty string`);
      if (!isStr(p.copy)) err(`${at}.copy must be a non-empty string (a CopyBook key)`);
      if (p.group !== undefined && !(isStr(p.group) && isObj(groups) && p.group in groups)) err(`${at}.group "${String(p.group)}" is not a key of groups`);
      if (p.explode !== undefined && !isVec3(p.explode)) err(`${at}.explode must be [x, y, z]`);
      if (p.stage !== undefined && !(Number.isInteger(p.stage) && (p.stage as number) >= 0)) err(`${at}.stage must be a whole number >= 0`);
      if (p.order !== undefined && !(isNum(p.order) && p.order >= 0 && p.order <= 1)) err(`${at}.order must be a number from 0 to 1`);
      if (p.pickable !== undefined && typeof p.pickable !== "boolean") err(`${at}.pickable must be a boolean`);
      if (p.leader !== undefined && p.leader !== "always" && p.leader !== "hover") err(`${at}.leader must be "always" or "hover"`);
      if (p.procedural !== undefined && typeof p.procedural !== "boolean") err(`${at}.procedural must be a boolean`);
      if (p.view !== undefined && !(isObj(p.view) && isVec3(p.view.position) && isVec3(p.view.target))) err(`${at}.view must be { position: [x, y, z], target: [x, y, z] }`);
      if (p.assemble !== undefined) {
        const a = p.assemble;
        if (!isObj(a) || !isStr(a.slot) || !(isNum(a.snap) && a.snap > 0) || !Array.isArray(a.after)) {
          err(`${at}.assemble must be { slot: string, snap: number > 0, after: string[] }`);
        } else {
          for (const dep of a.after) if (!partIds.has(dep as string)) err(`${at}.assemble.after names "${String(dep)}", which is not a part`);
        }
      }
    }
  }

  if (input.xray !== undefined) {
    if (!Array.isArray(input.xray) || input.xray.length === 0) err("xray must be a non-empty array of group ids");
    else {
      const seen = new Set<string>();
      for (const g of input.xray) {
        if (!(isStr(g) && isObj(groups) && Object.hasOwn(groups, g))) err(`xray names "${String(g)}", which is not a key of groups`);
        else if (seen.has(g)) err(`xray names "${g}" twice`);
        else seen.add(g);
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, sidecar: input as unknown as Sidecar };
}

/** Parses and validates, throwing one readable error. For app code that imports a sidecar JSON. */
export function parseSidecar(input: unknown, name = "sidecar"): Sidecar {
  const r = validateSidecar(input);
  if (!r.ok) throw new Error(`${name} is invalid:\n  ${r.errors.join("\n  ")}`);
  return r.sidecar;
}
