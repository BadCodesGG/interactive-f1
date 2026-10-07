"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setThemePreference, THEME_STORAGE_KEY, type ThemePreference } from "../theme";
import { useThemePreference } from "../use-theme";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export interface ThemeToggleProps {
  className?: string;
  /** The localStorage key; must match the one given to `themeScript()`. Default "theme". */
  storageKey?: string;
}

/**
 * A three-way segmented control: System, Light, Dark. Each segment is a button named for what it picks
 * (36 px on phones so the group fits beside the header, 44 px from sm up) and marked pressed, with an
 * accent edge, when chosen. The group's border is the app's `--field-border` (falling back to
 * `--border`); define it at 3:1 or more against the surface. The choice is applied at once and saved (see
 * `setThemePreference`); it reads the current one from `data-theme-pref`, which `themeScript()` sets
 * before first paint, so a page using the toggle needs the script in its <head>.
 */
export function ThemeToggle({ className, storageKey = THEME_STORAGE_KEY }: ThemeToggleProps) {
  const chosen = useThemePreference();
  return (
    <div
      role="group"
      aria-label="Colour theme"
      data-theme-toggle
      className={cn("inline-flex items-center gap-0.5 rounded-lg border border-[color:var(--field-border,var(--color-border))] bg-surface p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          variant="ghost"
          aria-label={label}
          title={label}
          aria-pressed={chosen === value}
          data-theme-option={value}
          onClick={() => setThemePreference(value, storageKey)}
          // The pressed segment carries an accent edge, so it reads without relying on the icon's hue.
          className={cn("h-9 w-9 px-0 text-ink-secondary sm:h-11 sm:w-11", chosen === value && "bg-surface-hover text-accent ring-1 ring-inset ring-accent")}
        >
          <Icon aria-hidden />
        </Button>
      ))}
    </div>
  );
}
