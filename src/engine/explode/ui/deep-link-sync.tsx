"use client";

import { useEffect, useRef } from "react";
import { arrivalScroll, parseDeepLink, writeDeepLink } from "../deep-link";
import { useExplodeStore } from "../provider";
import type { Sidecar } from "../sidecar";
import type { ExplodeState } from "../store";

/**
 * Deep links, both ways. On mount it reads `?part=&explode=&iso=` from the address and puts the
 * store there; from then on it mirrors the store back with `history.replaceState`, so the address
 * bar is always a link to what is on screen (and never adds a history entry). Renders nothing.
 * Everything unrelated in the query string is left as it was. A link with a part, opened below md,
 * also scrolls the stage (`[data-stage-gate]`) to the top of the screen, once.
 */
export function DeepLinkSync({ sidecar }: { sidecar: Pick<Sidecar, "parts"> }) {
  const store = useExplodeStore();
  const arrived = useRef(false);
  useEffect(() => {
    const link = parseDeepLink(window.location.search, Object.keys(sidecar.parts));
    const patch: Partial<ExplodeState> = {};
    if (link.part) patch.selected = link.part;
    if (link.explode !== undefined) patch.target = link.explode;
    if (link.iso) patch.isolated = true;
    store.set(patch);

    // Once, on arrival: on a phone the part sheet covers the lower half, so bring the stage to the top.
    let frame = 0;
    // `arrived` flips when the scroll runs, not when it is scheduled, so a dev-mode effect re-run that cancels the frame schedules it again.
    if (!arrived.current) {
      const scroll = arrivalScroll(link, window.matchMedia("(max-width: 767px)").matches, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      if (scroll) {
        frame = requestAnimationFrame(() => {
          arrived.current = true;
          document.querySelector("[data-stage-gate]")?.scrollIntoView(scroll);
        });
      } else arrived.current = true;
    }

    const unsubscribe = store.subscribe(() => {
      const { selected, target, isolated } = store.getState();
      const { pathname, search, hash } = window.location;
      const next = writeDeepLink(search, { selected, target, isolated });
      if (next !== search) window.history.replaceState(window.history.state, "", `${pathname}${next}${hash}`);
    });
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [store, sidecar]);
  return null;
}
