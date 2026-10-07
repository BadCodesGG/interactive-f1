/**
 * The View in AR button's work, past the export: mounts a hidden `<model-viewer>` on the exported
 * file and asks it to open AR. Client only. Imports no three; `<model-viewer>` (which carries its
 * own) and the exporters are fetched here and in the stage on the press, never in a route's initial JS.
 *
 * Android opens the model in the page through WebXR. Scene Viewer, model-viewer's other Android
 * mode, hands a URL to another app, which cannot read a `blob:` address (the exported file lives only
 * in this page), so it is not offered: a phone without WebXR AR gets a message instead of a silent
 * failure. iOS opens the USDZ in Quick Look, which does take a blob link.
 */
import type { ModelViewerElement } from "@google/model-viewer";
import { AR_MAX_BYTES, arFileName, checkArSize, type ArFormat, type ArPlatform } from "./ar";
import type { ExplodeStore } from "./store";

/** How long a file stays alive after AR was asked to open it (Quick Look fetches it a moment after the tap), and how long an unopened one waits. */
const OPENED_TTL = 60_000;
const IDLE_TTL = 120_000;
/** The viewer loads the GLB from a blob: a phone gets this long to parse it. */
const LOAD_TIMEOUT = 30_000;

export interface ArSession {
  /** Opens AR. Null when it did, else what to tell the visitor. Needs a fresh tap when it comes from a later press. */
  open(): Promise<string | null>;
  /** Removes the viewer and revokes the file URLs. Safe to call twice. */
  dispose(): void;
}

export type ArLaunch =
  | { ok: false; message: string }
  /** `opened`: AR was asked to open. Otherwise the tap that started the export is too old for the browser to allow it, and `session.open()` waits for the next one. */
  | { ok: true; opened: boolean; session: ArSession };

const fail = (message: string): ArLaunch => ({ ok: false, message });

/** Whether this browser can place a model in the page in AR (WebXR immersive-ar). */
async function webxrAr(): Promise<boolean> {
  try {
    // lib.dom has no `navigator.xr`.
    const { xr } = navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } };
    return (await xr?.isSessionSupported("immersive-ar")) === true;
  } catch {
    return false;
  }
}

/** A GLB or USDZ as a named file, or the reason it will not do. */
async function exportFile(store: ExplodeStore, app: string, format: ArFormat): Promise<File | string> {
  const blob = await store.exportModel(format);
  if (!blob) return "AR is not available for this model";
  const size = checkArSize(blob.size, AR_MAX_BYTES[format]);
  if (!size.ok) return size.message;
  return new File([blob], arFileName(app, format), { type: blob.type });
}

function whenLoaded(viewer: HTMLElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), LOAD_TIMEOUT);
    viewer.addEventListener("load", () => (clearTimeout(timer), resolve()), { once: true });
    viewer.addEventListener("error", () => (clearTimeout(timer), reject(new Error("error"))), { once: true });
  });
}

/**
 * Exports the assembled model, mounts it in a hidden viewer and opens AR. Never throws: every failure
 * comes back as a message.
 */
export async function launchAr(store: ExplodeStore, app: string, platform: ArPlatform): Promise<ArLaunch> {
  if (platform === "android" && !(await webxrAr())) return fail("AR needs Chrome with Google Play Services for AR on this phone");

  const viewerReady = import("@google/model-viewer/dist/model-viewer.min.js").then(() => true, () => false);
  const glb = await exportFile(store, app, "glb");
  if (typeof glb === "string") return fail(glb);
  const usdz = platform === "ios" ? await exportFile(store, app, "usdz") : null;
  if (typeof usdz === "string") return fail(usdz);
  if (!(await viewerReady)) return fail("Could not load the AR viewer");

  const urls = [URL.createObjectURL(glb), ...(usdz ? [URL.createObjectURL(usdz)] : [])];
  const viewer = document.createElement("model-viewer") as ModelViewerElement;
  viewer.setAttribute("data-ar-viewer", "");
  viewer.setAttribute("aria-hidden", "true");
  viewer.setAttribute("ar", "");
  viewer.setAttribute("ar-modes", platform === "android" ? "webxr" : "quick-look");
  // The model is in metres: a fixed scale keeps it life size instead of letting a pinch resize it.
  viewer.setAttribute("ar-scale", "fixed");
  viewer.setAttribute("ar-placement", "floor");
  viewer.setAttribute("loading", "eager");
  viewer.setAttribute("src", urls[0]);
  if (urls[1]) viewer.setAttribute("ios-src", urls[1]);
  // On the page but out of sight and out of the way; display: none would stop it loading.
  Object.assign(viewer.style, { position: "fixed", left: "0", bottom: "0", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  const dispose = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    viewer.remove();
    for (const url of urls) URL.revokeObjectURL(url);
  };
  timer = setTimeout(dispose, IDLE_TTL);
  const session: ArSession = {
    async open() {
      if (done) return "That AR view expired, press AR again";
      try {
        await viewer.activateAR();
      } catch {
        dispose();
        return "Could not open AR";
      }
      // Quick Look fetches the file just after the tap: keep it a while, then let it go.
      clearTimeout(timer);
      timer = setTimeout(dispose, OPENED_TTL);
      return null;
    },
    dispose,
  };

  const loaded = whenLoaded(viewer);
  document.body.append(viewer);
  try {
    await loaded;
  } catch {
    dispose();
    return fail("Could not load the model for AR");
  }
  if (!viewer.canActivateAR) {
    dispose();
    return fail("This device cannot open AR from this page");
  }
  // A browser only lets AR open within a moment of the tap; a slow export can outlast it, so ask for one more.
  if (navigator.userActivation && !navigator.userActivation.isActive) return { ok: true, opened: false, session };
  const message = await session.open();
  return message ? fail(message) : { ok: true, opened: true, session };
}
