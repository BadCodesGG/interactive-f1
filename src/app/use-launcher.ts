"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * What a launcher card (lap-launcher.tsx, pit-stop-launcher.tsx) does around its dock: whether it is open, the id
 * for its heading, and the ref for the button that opens it. Closing returns focus to that button;
 * `onOpenChange` tells the page whether the dock is open, and is told it is not when the card goes (leaving the
 * page, or the car being swapped for the other year's).
 */
export function useLauncher(onOpenChange?: (open: boolean) => void) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) wasOpen.current = true;
    else if (wasOpen.current) button.current?.focus();
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  return { open, setOpen, titleId, button };
}
