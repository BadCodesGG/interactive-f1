/**
 * The explode engine's DOM-safe surface. Nothing here imports three at runtime, so any client
 * component may use it without pulling three into a route's initial JS.
 *
 * Deliberately NOT re-exported: `./stage` (the canvas, three and R3F), `./materials` (the material
 * presets, which build three materials), `./plan` and `./camera`.
 * Reach the stage only through `next/dynamic(() => import(...), { ssr: false })` from a Client
 * Component, as src/app/stage-client.tsx does; `npm run test:stage` fails if three reaches the
 * initial chunks. Import the presets from `@/engine/explode/materials` inside that same lazy chunk.
 */
export type { ArOptions } from "./ar";
export { createSound, getSound, useMuted, type Cue, type Note, type Sound } from "./audio";
export type { CopyBook, PartCopy } from "./copy";
export { StageGate, SceneBoundary, hasWebGL2, type GateRenderProps, type StageGateProps } from "./gate";
export type { StageGateState } from "./gate-state";
export { loadModel, preloadModel, disposeModel, registerModelSource, type ModelSource } from "./loader";
export { ExplodeProvider, useExplodeStore } from "./provider";
export {
  isSafeNodeName,
  parseSidecar,
  sanitizeNodeName,
  validateSidecar,
  type Axis,
  type Sidecar,
  type SidecarAssemble,
  type SidecarAssembly,
  type SidecarGroup,
  type SidecarPart,
  type SidecarResult,
  type SidecarView,
  type Vec3,
} from "./sidecar";
export { createExplodeStore, useExplodeState, type AppliedLooks, type ExplodeState, type ExplodeStore, type Looks, type PartLook } from "./store";
export { DeepLinkSync } from "./ui/deep-link-sync";
export { ExplodeControls } from "./ui/explode-controls";
export { InfoPanel, type InfoPanelProps } from "./ui/info-panel";
export { PartList, partSections, type PartListProps } from "./ui/part-list";
export { SoundToggle, StageTools, type StageToolsProps } from "./ui/stage-tools";
export { ThemeToggle, type ThemeToggleProps } from "./ui/theme-toggle";
export { XrayControl } from "./ui/xray-control";
export type { Frame } from "./framing";
export type { MaterialHook } from "./materials";
export {
  resolveQuality,
  resolveRender,
  type AoOptions,
  type ContactOptions,
  type EnvKind,
  type Quality,
  type RenderOptions,
  type RenderProp,
  type ResolvedRender,
  type StudioOptions,
  type ToneMapping,
} from "./render";
export type { ExplodeStageProps, StageScene } from "./stage";
export {
  setThemePreference,
  themeScript,
  type StagePalette,
  type Theme,
  type ThemePreference,
  type Themed,
} from "./theme";
export { useTheme, useThemePreference } from "./use-theme";
