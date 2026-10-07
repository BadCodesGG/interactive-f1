/** Share and screenshot: the pure parts (link, file name) and the two browser calls around them. */
import { writeDeepLink, type DeepLinkState } from "./deep-link";

/** The address of the page as it would open in the given state, keeping other parameters and the hash. */
export function shareUrl(loc: Pick<Location, "origin" | "pathname" | "search" | "hash">, state: DeepLinkState): string {
  return `${loc.origin}${loc.pathname}${writeDeepLink(loc.search, state)}${loc.hash}`;
}

export function slug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** `<app>-<part>.png`, or `<app>-overview.png` with nothing selected. A file-system-safe slug either way. */
export function screenshotName(app: string, partLabel: string | null): string {
  return `${slug(app) || "explode"}-${(partLabel && slug(partLabel)) || "overview"}.png`;
}

export type CopyResult = "copied" | "unavailable";

/** Puts text on the clipboard. Never throws: no API, a denied permission and an insecure page all answer "unavailable". */
export async function copyText(text: string): Promise<CopyResult> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return "unavailable";
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "unavailable";
  }
}

/** Saves a blob as a file through a throwaway link. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking in the same task can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
