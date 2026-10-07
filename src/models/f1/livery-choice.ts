/**
 * Which livery the visitor is looking at, and how that is decided: the address (`?livery=`), then the
 * choice remembered in localStorage, then Ghost. The same rule is written twice, as `resolveLivery` for
 * code and as `liveryScript()` for the inline script that puts the result on <html> as `data-livery`
 * before first paint (so the site accent never flashes); a test runs the script against the function.
 * Three-free and DOM-free.
 */
import { asLiveryId, LEGACY_LIVERY_IDS, LIVERY_IDS, parseLiveryParam, type LiveryId } from "./livery-meta";
import { DEFAULT_LIVERY_ID } from "./livery-name";
import { segmentKey } from "@/engine/explode/deep-link";

export const LIVERY_ATTR = "data-livery";
export const LIVERY_STORAGE_KEY = "f1-livery";

/** The livery for an address query and a stored value; both untrusted. */
export function resolveLivery(search: string, stored: string | null): LiveryId {
  return parseLiveryParam(search) ?? asLiveryId(stored) ?? DEFAULT_LIVERY_ID;
}

/**
 * The body of the no-flash inline script for the layout's <head>. It reads `?livery=` from the address
 * and the choice from localStorage (a throwing storage reads as nothing), keeps only a known id, and
 * sets `data-livery` on <html>. The ids are baked in from LIVERY_IDS.
 */
export function liveryScript(): string {
  const ids = JSON.stringify(LIVERY_IDS);
  const legacy = JSON.stringify(LEGACY_LIVERY_IDS);
  const key = JSON.stringify(LIVERY_STORAGE_KEY);
  const fallback = JSON.stringify(DEFAULT_LIVERY_ID);
  return `(function(){try{var i=${ids},m=${legacy},s,p;try{s=localStorage.getItem(${key})}catch(e){}try{p=new URLSearchParams(window.location.search).get("livery")}catch(e){}function c(x){return i.indexOf(x)>=0?x:typeof x==="string"&&Object.prototype.hasOwnProperty.call(m,x)?m[x]:null}document.documentElement.setAttribute("${LIVERY_ATTR}",c(p)||c(s)||${fallback})}catch(e){}})();`;
}

/** A query string (with its `?`) that names `id`, every other parameter kept byte for byte and in order. Keys compare decoded, as `get()` reads them, so `%6Civery=` is replaced too. */
export function withLiveryParam(search: string, id: LiveryId): string {
  const kept = search
    .replace(/^\?/, "")
    .split("&")
    .filter((seg) => seg !== "" && segmentKey(seg) !== "livery");
  kept.push(`livery=${id}`);
  return `?${kept.join("&")}`;
}
